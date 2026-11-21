'use strict';
// Minimal Supabase client (auth, rest, storage). Session in sessionStorage; never the password.
(() => {
  const C = window.GRID_CONFIG;
  const STORE = 'grid-auth';
  let session = null;            // { access_token, refresh_token, expires_at, user }
  let refreshing = null;

  class GridError extends Error {
    constructor(message, status) { super(message); this.status = status; }
  }

  // ---------- low-level request ----------
  async function call(path, { method = 'GET', body, token, headers = {}, raw = false, signal } = {}) {
    const h = { apikey: C.key, ...headers };
    if (token) h.Authorization = 'Bearer ' + token;
    let payload = body;
    if (body !== undefined && !(body instanceof Blob) && typeof body !== 'string') {
      h['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res;
    try { res = await fetch(C.url + path, { method, headers: h, body: payload, cache: 'no-store', credentials: 'omit', signal }); }
    catch (_) { throw new GridError('offline', 0); }
    if (!res.ok) {
      let msg = 'error ' + res.status;
      try { const j = await res.json(); msg = j.error_description || j.msg || j.message || j.error || msg; } catch (_) {}
      throw new GridError(String(msg), res.status);
    }
    if (raw) return res;
    if (res.status === 204) return null;
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  }

  // ---------- session ----------
  function save(s) {
    session = s ? { access_token: s.access_token, refresh_token: s.refresh_token,
      expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600),
      user: { id: s.user.id, email: s.user.email } } : null;
    try { session ? sessionStorage.setItem(STORE, JSON.stringify(session)) : sessionStorage.removeItem(STORE); } catch (_) {}
  }
  function load() {
    try { session = JSON.parse(sessionStorage.getItem(STORE) || 'null'); } catch (_) { session = null; }
    return session;
  }
  const toEmail = name => {
    const n = name.trim();
    return n.includes('@') ? n.toLowerCase() : n.toLowerCase() + '@' + C.userDomain;
  };
  const handle = email => (email || '').endsWith('@' + C.userDomain) ? email.split('@')[0] : (email || '');

  async function signIn(username, password) {
    const s = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: toEmail(username), password } });
    save(s);
    return session.user;
  }
  async function signUp(code, username, password) {
    const s = await call('/auth/v1/signup', { method: 'POST',
      body: { email: toEmail(username), password, data: { invite: String(code).trim() } } });
    if (!s || !s.access_token) throw new GridError('account not active', 403);
    save(s);
    return session.user;
  }
  async function refresh() {
    if (!session) throw new GridError('no session', 401);
    if (!refreshing) {
      const original = session;
      refreshing = call('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: original.refresh_token } })
        .then(next => {
          // A background read must never restore a session after Lock has cleared it.
          if (session !== original) throw new GridError('no session', 401);
          save(next);
        }).catch(e => { if (session === original) save(null); throw e; }).finally(() => { refreshing = null; });
    }
    return refreshing;
  }
  // A valid access token: refreshed a minute before it would expire.
  async function token() {
    if (!session) throw new GridError('no session', 401);
    if (session.expires_at - 60 < Date.now() / 1000) await refresh();
    if (!session) throw new GridError('no session', 401);
    return session.access_token;
  }
  // Restore a session from this tab and check it with the server.
  async function resume() {
    if (!load()) return null;
    try { const u = await call('/auth/v1/user', { token: await token() }); return u && u.id ? session.user : null; }
    catch (_) { save(null); return null; }
  }
  async function signOut() {
    const t = session && session.access_token;
    save(null);
    if (t) { try { await call('/auth/v1/logout', { method: 'POST', token: t }); } catch (_) {} }
  }
  // The project requires the current password too, so a stolen session alone cannot change it.
  async function changePassword(current, password) {
    await call('/auth/v1/user', { method: 'PUT', token: await token(), body: { password, current_password: current } });
  }
  // Every data call goes through here: on a 401 it refreshes once and tries again.
  async function authed(path, opts = {}) {
    try { return await call(path, { ...opts, token: await token() }); }
    catch (e) { if (e.status !== 401 || !session) throw e; await refresh(); return call(path, { ...opts, token: await token() }); }
  }

  // ---------- entries (table grid_items) ----------
  const enc = encodeURIComponent;
  const items = {
    list: () => authed('/rest/v1/grid_items?select=id,kind,title,body,created_at,updated_at&order=created_at.desc'),
    add: row => authed('/rest/v1/grid_items', { method: 'POST', body: row, headers: { Prefer: 'return=representation' } }).then(r => r[0]),
    update: (id, row) => authed('/rest/v1/grid_items?id=eq.' + enc(id), { method: 'PATCH', body: row, headers: { Prefer: 'return=representation' } }).then(r => r[0]),
    remove: id => authed('/rest/v1/grid_items?id=eq.' + enc(id), { method: 'DELETE' })
  };

  // ---------- files (bucket grid-files, folder <user id>/<entry id>/) ----------
  const objPath = p => p.split('/').map(enc).join('/');
  const folder = itemId => session.user.id + '/' + itemId;
  // File names are reduced to safe characters so a name can never climb out of its folder.
  const safeName = n => (n.normalize('NFKD').replace(/[^\w.\-]+/g, '_').replace(/^\.+/, '').slice(-120)) || 'file';
  const files = {
    async list(itemId) {
      const r = await authed('/storage/v1/object/list/' + C.bucket, { method: 'POST',
        body: { prefix: folder(itemId) + '/', limit: 200, offset: 0, sortBy: { column: 'name', order: 'asc' } } });
      return (r || []).filter(f => f.id || f.metadata).map(f => ({ name: f.name, path: folder(itemId) + '/' + f.name,
        size: f.metadata ? f.metadata.size : 0, type: f.metadata ? f.metadata.mimetype : '' }));
    },
    async upload(itemId, file) {
      if (file.size > C.maxFileMB * 1048576) throw new GridError('too large', 413);
      const path = folder(itemId) + '/' + safeName(file.name);
      await authed('/storage/v1/object/' + C.bucket + '/' + objPath(path), { method: 'POST', body: file,
        headers: { 'Content-Type': file.type || 'application/octet-stream', 'x-upsert': 'true' } });
      return path;
    },
    // The file's bytes, fetched with the login token (used for image previews).
    async blob(path) {
      const res = await authed('/storage/v1/object/authenticated/' + C.bucket + '/' + objPath(path), { raw: true });
      return res.blob();
    },
    // A download link that stops working after 60 seconds.
    async link(path) {
      const r = await authed('/storage/v1/object/sign/' + C.bucket + '/' + objPath(path), { method: 'POST', body: { expiresIn: 60 } });
      const rel = r.signedURL || r.signedUrl;
      const url = new URL(C.url + '/storage/v1' + rel);
      url.searchParams.set('download', path.split('/').pop());
      return url.href;
    },
    remove: paths => paths.length ? authed('/storage/v1/object/' + C.bucket, { method: 'DELETE', body: { prefixes: paths } }) : null
  };

  const rpc = (fn, args) => authed('/rest/v1/rpc/' + fn, { method: 'POST', body: args || {} });
  const coating = {
    status: () => authed('/rest/v1/rpc/grid_coating_status', { method: 'POST', body: {}, signal: AbortSignal.timeout(8000) }),
    notebook: maxRows => authed('/rest/v1/rpc/grid_coating_notebook', { method: 'POST', body: { max_rows: maxRows || 40 }, signal: AbortSignal.timeout(8000) })
  };
  const invites = {
    isAdmin: () => rpc('grid_is_admin').then(v => v === true).catch(() => false),
    make: (note, days) => rpc('grid_make_invite', { note: note || null, valid_days: days }),
    list: () => rpc('grid_list_invites'),
    withdraw: id => rpc('grid_withdraw_invite', { invite_id: id })
  };

  window.GridAPI = Object.freeze({ signIn, signUp, signOut, resume, changePassword, items, files, invites, coating, GridError,
    user: () => session && session.user, handle: () => session ? handle(session.user.email) : '' });
})();

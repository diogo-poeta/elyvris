'use strict';
// Each user's private entries and files. Text is inserted with textContent only.
(() => {
  const API = window.GridAPI, C = window.GRID_CONFIG;
  const KINDS = { report: 'Report', simulation: 'Simulation', data: 'Data', note: 'Note' };
  const PLURAL = { report: 'Reports', simulation: 'Simulations', data: 'Data', note: 'Notes' };
  const IMG = /^image\/(png|jpeg|gif|webp|svg\+xml)$/;
  const TEXT = /\.(csv|tsv|txt|json|dat|log|md|py|ctl|in|out)$/i;
  let root, entries = [], filter = 'all', query = '', current = null, blobUrls = [];

  // ---------- tiny DOM helper: el('div.card', {attrs}, children...) ----------
  function el(tag, attrs, ...kids) {
    const [name, ...cls] = tag.split('.');
    const n = document.createElement(name);
    if (cls.length) n.className = cls.join(' ');
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'text') n.textContent = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
    return n;
  }
  const date = s => new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const size = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' kB' : (b / 1048576).toFixed(1) + ' MB';
  const freeBlobs = () => { blobUrls.forEach(URL.revokeObjectURL); blobUrls = []; };
  function problem(e) {
    if (e && e.status === 401) { location.reload(); return 'Session ended.'; }
    if (e && e.status === 0) return 'Grid is offline. Try again in a moment.';
    if (e && e.status === 413) return 'That file is larger than ' + C.maxFileMB + ' MB.';
    return 'Something went wrong (' + ((e && e.message) || 'unknown') + ').';
  }
  function toast(text, bad) {
    const t = el('p.toast' + (bad ? '.bad' : ''), { role: 'status', text });
    document.body.append(t);
    setTimeout(() => t.remove(), 4200);
  }

  // ---------- modal dialogs ----------
  function dialog(title, body, actions) {
    const d = el('dialog.grid-dialog', {}, el('h2', { text: title }), body, el('div.dialog-actions', {}, actions));
    d.addEventListener('close', () => d.remove());
    document.body.append(d);
    d.showModal();
    return d;
  }
  function confirmBox(title, text, okLabel) {
    return new Promise(res => {
      const d = dialog(title, el('p', { text }), [
        el('button.ghost', { type: 'button', onclick: () => { res(false); d.close(); }, text: 'Cancel' }),
        el('button.danger', { type: 'button', onclick: () => { res(true); d.close(); }, text: okLabel })
      ]);
      d.addEventListener('cancel', () => res(false));
    });
  }

  // ---------- main view ----------
  async function open(container) {
    root = container;
    root.replaceChildren(el('p.loading', { text: 'Opening your sector…' }));
    try { entries = await API.items.list() || []; }
    catch (e) { root.replaceChildren(el('p.bad', { text: problem(e) })); return; }
    renderList();
  }

  function renderList() {
    freeBlobs(); current = null;
    const counts = { all: entries.length };
    for (const k in KINDS) counts[k] = entries.filter(x => x.kind === k).length;
    const q = query.toLowerCase();
    const shown = entries.filter(x => (filter === 'all' || x.kind === filter) &&
      (!q || x.title.toLowerCase().includes(q) || x.body.toLowerCase().includes(q)));

    const chips = el('div.chips', { role: 'toolbar', 'aria-label': 'Filter by kind' },
      ['all', ...Object.keys(KINDS)].map(k => el('button.chip' + (filter === k ? '.on' : ''), {
        type: 'button', 'aria-pressed': String(filter === k), onclick: () => { filter = k; renderList(); }
      }, k === 'all' ? 'All' : PLURAL[k], el('span', { text: counts[k] }))));
    const search = el('input.search', { type: 'search', placeholder: 'Search titles and text', value: query, 'aria-label': 'Search entries',
      oninput: e => { query = e.target.value; const pos = e.target.selectionStart; renderList(); const s = root.querySelector('.search'); s.focus(); s.setSelectionRange(pos, pos); } });

    const list = shown.length ? el('div.entries', {}, shown.map(card))
      : el('div.empty', {}, el('p', { text: entries.length ? 'Nothing matches.' : 'Your sector is empty.' }),
        entries.length ? null : el('p.dim', { text: 'Add a report, a simulation run, a data set or a note. Attach the files that belong with it (figures, CSV data, scripts, PDFs).' }));

    root.replaceChildren(
      el('p.grid-kicker', { text: 'Access granted · ' + API.handle() }),
      el('h2.grid-title', { text: 'Your sector' }),
      el('p.grid-lede', { text: 'Private work, simulation reports and data. Only your account can read or change what is here.' }),
      el('div.toolbar', {}, chips, search, el('button.primary', { type: 'button', onclick: () => editor(null), text: '+ New entry' })),
      list
    );
  }

  function card(x) {
    const preview = x.body.length > 180 ? x.body.slice(0, 180).trimEnd() + '…' : x.body;
    return el('button.entry.k-' + x.kind, { type: 'button', onclick: () => detail(x) },
      el('span.tag', { text: KINDS[x.kind] }),
      el('h3', { text: x.title }),
      preview ? el('p', { text: preview }) : null,
      el('span.meta', { text: date(x.created_at) + (x.updated_at && x.updated_at.slice(0, 16) !== x.created_at.slice(0, 16) ? ' · edited ' + date(x.updated_at) : '') }));
  }

  // ---------- one entry ----------
  async function detail(x) {
    freeBlobs(); current = x;
    const filesBox = el('div.files', {}, el('p.dim', { text: 'Loading files…' }));
    const drop = el('label.drop', {},
      el('input', { type: 'file', multiple: true, onchange: e => upload(x, [...e.target.files]) }),
      el('span', { text: 'Add files: click, or drop them here (up to ' + C.maxFileMB + ' MB each)' }));
    drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', e => { e.preventDefault(); drop.classList.remove('over'); upload(x, [...e.dataTransfer.files]); });

    root.replaceChildren(
      el('button.back', { type: 'button', onclick: renderList, text: '← All entries' }),
      el('article.detail.k-' + x.kind, {},
        el('span.tag', { text: KINDS[x.kind] }),
        el('h2.detail-title', { text: x.title }),
        el('p.meta', { text: 'Created ' + date(x.created_at) + (x.updated_at ? ' · last change ' + date(x.updated_at) : '') }),
        x.body ? el('div.body', { text: x.body }) : el('p.dim', { text: 'No text.' }),
        el('h3', { text: 'Files' }), filesBox, drop,
        el('div.detail-actions', {},
          el('button', { type: 'button', onclick: () => editor(x), text: 'Edit' }),
          el('button.danger', { type: 'button', onclick: () => removeEntry(x), text: 'Delete entry' }))));
    root.focus({ preventScroll: true });
    scrollTo(0, 0);
    showFiles(x, filesBox);
  }

  async function showFiles(x, box) {
    let list;
    try { list = await API.files.list(x.id); }
    catch (e) { box.replaceChildren(el('p.bad', { text: problem(e) })); return; }
    if (current !== x) return;
    if (!list.length) { box.replaceChildren(el('p.dim', { text: 'No files yet.' })); return; }
    box.replaceChildren(...list.map(f => {
      const row = el('div.file', {},
        el('span.fname', { text: f.name }), el('span.fsize', { text: size(f.size) }),
        TEXT.test(f.name) && f.size < 300000 ? el('button', { type: 'button', onclick: () => peek(f, row), text: 'Preview' }) : null,
        el('button', { type: 'button', onclick: () => download(f), text: 'Download' }),
        el('button.danger', { type: 'button', onclick: () => removeFile(x, f), text: 'Remove', 'aria-label': 'Remove ' + f.name }));
      if (IMG.test(f.type)) thumb(f, row);
      return row;
    }));
  }
  // Images are fetched with the login token and shown from memory (a blob: address).
  async function thumb(f, row) {
    try {
      const url = URL.createObjectURL(await API.files.blob(f.path));
      blobUrls.push(url);
      row.prepend(el('img.thumb', { src: url, alt: f.name, loading: 'lazy' }));
    } catch (_) {}
  }
  async function peek(f, row) {
    const old = row.querySelector('pre'); if (old) { old.remove(); return; }
    try {
      const text = await (await API.files.blob(f.path)).text();
      const lines = text.split(/\r?\n/);
      row.append(el('pre.peek', { text: lines.slice(0, 40).join('\n') + (lines.length > 40 ? '\n… (' + (lines.length - 40) + ' more lines)' : '') }));
    } catch (e) { toast(problem(e), true); }
  }
  async function download(f) {
    try {
      const a = el('a', { href: await API.files.link(f.path), rel: 'noopener noreferrer', download: f.name });
      document.body.append(a); a.click(); a.remove();
    } catch (e) { toast(problem(e), true); }
  }
  async function upload(x, list) {
    if (!list.length) return;
    let ok = 0;
    for (const file of list) {
      try { toast('Uploading ' + file.name + '…'); await API.files.upload(x.id, file); ok++; }
      catch (e) { toast(file.name + ': ' + problem(e), true); }
    }
    if (ok) toast(ok + (ok === 1 ? ' file added.' : ' files added.'));
    if (current === x) detail(x);
  }
  async function removeFile(x, f) {
    if (!await confirmBox('Remove file?', f.name + ' will be deleted for good.', 'Remove')) return;
    try { await API.files.remove([f.path]); toast('File removed.'); detail(x); }
    catch (e) { toast(problem(e), true); }
  }
  async function removeEntry(x) {
    if (!await confirmBox('Delete entry?', '"' + x.title + '" and all its files will be deleted for good. This cannot be undone.', 'Delete')) return;
    try {
      const list = await API.files.list(x.id);
      await API.files.remove(list.map(f => f.path));
      await API.items.remove(x.id);
      entries = entries.filter(e => e.id !== x.id);
      toast('Entry deleted.'); renderList();
    } catch (e) { toast(problem(e), true); }
  }

  // ---------- new / edit ----------
  function editor(x) {
    const kind = el('select', { id: 'edKind' }, Object.entries(KINDS).map(([k, v]) => el('option', { value: k, selected: x ? x.kind === k : k === 'report', text: v })));
    const title = el('input', { id: 'edTitle', type: 'text', maxlength: 200, required: true, value: x ? x.title : '' });
    const body = el('textarea', { id: 'edBody', rows: 12, maxlength: 100000, placeholder: 'What was done, the parameters, units, what came out, what to check next…' });
    body.value = x ? x.body : '';
    const fileIn = x ? null : el('input', { id: 'edFiles', type: 'file', multiple: true });
    const err = el('p.bad', { role: 'status' });
    const save = el('button.primary', { type: 'submit', text: x ? 'Save changes' : 'Create entry' });
    const form = el('form.editor', {},
      el('label', { for: 'edKind', text: 'Kind' }), kind,
      el('label', { for: 'edTitle', text: 'Title' }), title,
      el('label', { for: 'edBody', text: 'Text' }), body,
      fileIn ? el('label', { for: 'edFiles', text: 'Files (optional)' }) : null, fileIn, err);
    const d = dialog(x ? 'Edit entry' : 'New entry', form, [
      el('button.ghost', { type: 'button', onclick: () => d.close(), text: 'Cancel' }), save]);
    save.setAttribute('form', 'gridEditor'); form.id = 'gridEditor';
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const row = { kind: kind.value, title: title.value.trim(), body: body.value };
      if (!row.title) { err.textContent = 'A title is needed.'; return; }
      save.disabled = true; err.textContent = '';
      try {
        if (x) {
          const upd = await API.items.update(x.id, row);
          Object.assign(x, upd); d.close(); detail(x);
        } else {
          const added = await API.items.add(row);
          entries.unshift(added); d.close();
          const picked = [...fileIn.files];
          await detail(added);
          if (picked.length) upload(added, picked);
        }
      } catch (e2) { err.textContent = problem(e2); save.disabled = false; }
    });
    title.focus();
  }

  // ---------- change password ----------
  function changePassword() {
    const cur = el('input', { id: 'pw0', type: 'password', autocomplete: 'current-password', required: true });
    const a = el('input', { id: 'pw1', type: 'password', autocomplete: 'new-password', minlength: 12, required: true });
    const b = el('input', { id: 'pw2', type: 'password', autocomplete: 'new-password', minlength: 12, required: true });
    const err = el('p.bad', { role: 'status' });
    const form = el('form.editor', { id: 'gridPw' },
      el('p.dim', { text: 'At least 12 characters. A short sentence you can remember works well.' }),
      el('label', { for: 'pw0', text: 'Current access key' }), cur,
      el('label', { for: 'pw1', text: 'New access key' }), a,
      el('label', { for: 'pw2', text: 'Type it again' }), b, err);
    const ok = el('button.primary', { type: 'submit', form: 'gridPw', text: 'Change key' });
    const d = dialog('Change your access key', form, [el('button.ghost', { type: 'button', onclick: () => d.close(), text: 'Cancel' }), ok]);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (a.value.length < 12) { err.textContent = 'Use at least 12 characters.'; return; }
      if (a.value !== b.value) { err.textContent = 'The two keys are different.'; return; }
      ok.disabled = true;
      try { await API.changePassword(cur.value, a.value); cur.value = a.value = b.value = ''; d.close(); toast('Access key changed.'); }
      catch (e2) { err.textContent = e2.status === 401 || e2.status === 400 || e2.status === 422 ? 'Not changed: check the current key (' + e2.message + ').' : problem(e2); ok.disabled = false; }
    });
    cur.focus();
  }

  async function copyText(input) {
    try { await navigator.clipboard.writeText(input.value); return true; } catch (_) {}
    input.focus(); input.select(); input.setSelectionRange(0, input.value.length);
    try { if (document.execCommand('copy')) return true; } catch (_) {}
    return false;
  }
  function inviteStatus(v) {
    if (v.used_at) return 'used by ' + (v.used_by || '?') + ' · ' + date(v.used_at);
    if (new Date(v.expires_at) < new Date()) return 'expired ' + date(v.expires_at);
    return 'unused · valid until ' + date(v.expires_at);
  }
  function invites() {
    const note = el('input', { id: 'invNote', type: 'text', maxlength: 200, placeholder: 'For example: for Ada (only you see this)' });
    const days = el('select', { id: 'invDays' }, [7, 14, 30, 90].map(n => el('option', { value: n, selected: n === 14, text: n + ' days' })));
    const make = el('button.primary', { type: 'submit', text: 'Make code' });
    const out = el('input.invite-code', { id: 'invOut', type: 'text', readonly: true, 'aria-label': 'New invite code' });
    const copy = el('button.primary', { type: 'button', text: 'Copy' });
    const copyMsg = el('p.dim', { role: 'status' });
    const made = el('div.invite-made', { hidden: true },
      el('div.invite-row', {}, out, copy), copyMsg,
      el('p.dim', { text: 'Send it privately. Copy it now: only a fingerprint is stored, so it cannot be shown again.' }));
    const err = el('p.bad', { role: 'status' });
    const list = el('ul.invite-list');
    const form = el('form.editor', { id: 'gridInvite' },
      el('p.dim', { text: 'A one-time code lets one person create their own account (they choose their user id and key; you never see it).' }),
      el('label', { for: 'invNote', text: 'Note (who it is for)' }), note,
      el('label', { for: 'invDays', text: 'Valid for' }), days,
      el('div.invite-row', {}, make), made, err,
      el('h3.invite-head', { text: 'Codes made so far' }), list);
    const d = dialog('Invite someone', form, [el('button.ghost', { type: 'button', onclick: () => d.close(), text: 'Close' })]);

    async function refresh() {
      try {
        const rows = await API.invites.list() || [];
        list.replaceChildren(...(rows.length ? rows.map(v => el('li', {},
          el('span.invite-note', { text: v.note || '(no note)' }),
          el('span.dim', { text: inviteStatus(v) }),
          !v.used_at ? el('button.ghost.danger', { type: 'button', text: 'Withdraw', onclick: async () => {
            if (!await confirmBox('Withdraw this code?', 'The code "' + (v.note || 'without a note') + '" will stop working.', 'Withdraw')) return;
            try { await API.invites.withdraw(v.id); toast('Code withdrawn.'); refresh(); } catch (e) { toast(problem(e), true); }
          } }) : null)) : [el('li.dim', { text: 'No codes yet.' })]));
      } catch (e) { list.replaceChildren(el('li.bad', { text: problem(e) })); }
    }
    form.addEventListener('submit', async e => {
      e.preventDefault();
      make.disabled = true; err.textContent = ''; copyMsg.textContent = '';
      try {
        out.value = await API.invites.make(note.value.trim(), Number(days.value));
        made.hidden = false; note.value = '';
        copy.focus();
        refresh();
      } catch (e2) { err.textContent = e2.status === 403 ? 'Only the Grid owner can make invite codes.' : problem(e2); }
      make.disabled = false;
    });
    copy.addEventListener('click', async () => {
      copyMsg.textContent = await copyText(out) ? 'Copied.' : 'This browser blocks copying: the code is selected, press Ctrl+C.';
    });
    out.addEventListener('focus', () => out.select());
    refresh();
    note.focus();
  }

  window.GridSpace = Object.freeze({ open, changePassword, invites });
})();

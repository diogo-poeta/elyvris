'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const C = window.GRID_CONFIG, API = window.GridAPI;
  const founderDoor = new URLSearchParams(location.search).has('founder');
  const isFounder = () => API.invites.isAdmin();
  const still = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const connected = C && !/YOUR-/.test(C.url + C.key);

  // The wall. If its script failed to load, a plain dark page and a timer stand in for it.
  const wall = window.GridWall ? GridWall.create($('wall'), { still })
    : { intro: () => wait(still ? 2500 : 11000), setMode() {}, destroy() {} };

  const crt = $('crt'), log = $('bootLog'), gate = $('gate'), user = $('gridUser'), key = $('gridKey'), msg = $('gateMsg');
  let busy = false, fails = 0;

  async function typeLine(text, cls) {
    const line = document.createElement('div');
    line.className = 'line' + (cls ? ' ' + cls : '');
    log.append(line);
    if (still) { line.textContent = text; return; }
    for (let i = 1; i <= text.length; i++) { line.textContent = text.slice(0, i); if (text[i - 1] !== ' ') await wait(11); }
  }
  const say = (text, cls, el = msg) => { el.textContent = text; el.className = 'gate-msg ' + (cls || ''); };
  const status = text => { $('wallStatus').textContent = text; };

  async function boot() {
    crt.hidden = false; crt.classList.add('on');
    await wait(still ? 0 : 650);
    await typeLine('ELYVRIS GRID · SYSTEM 20.39', 'dim');
    await typeLine('PERIMETER ........... SEALED', 'ok');
    await typeLine('ENCRYPTED LINK ...... TLS 1.3', 'ok');
    await typeLine('IDENTITY CHECK ...... ' + (founderDoor ? 'FOUNDER' : 'REQUIRED'), 'warn');
  }

  // What the public sees once the intro has played.
  async function notReleased() {
    await typeLine('');
    await typeLine('GRID ACCESS ......... TO BE RELEASED IN THE NEXT PATCH', 'warn');
    await typeLine('Thank you for coming this far. Check back soon.', 'dim');
  }

  async function show() {
    // Ask the server early (in parallel with the show) whether this tab is already signed in.
    const resumed = connected ? API.resume().catch(() => null) : Promise.resolve(null);
    status('Approaching the perimeter…');
    const introDone = wall.intro();
    await wait(still ? 300 : 9600);
    status('');
    await boot();
    await introDone;
    wall.setMode('idle');
    const who = await resumed;
    if (who) {
      if (await isFounder()) {
        await typeLine('SESSION TOKEN ....... VALID · FOUNDER', 'ok');
        await wait(still ? 200 : 700);
        return enter(false);
      }
      await API.signOut();                // a saved session that is not the founder's
    }
    if (!founderDoor) return notReleased();
    gate.hidden = false;
    if (!connected) say('GRID NOT CONNECTED YET', 'bad');
    user.focus({ preventScroll: true });
  }

  gate.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const name = user.value.trim(), pass = key.value;
    if (!name || !pass) return;
    if (!connected) { say('GRID NOT CONNECTED YET', 'bad'); return; }
    busy = true; user.readOnly = key.readOnly = true;
    say('VERIFYING…', 'dim'); wall.setMode('scan');
    try {
      await API.signIn(name, pass);
      key.value = '';
      if (!(await isFounder())) {
        // Right key, but not the founder's account: the Grid is not open to it yet.
        await API.signOut();
        throw Object.assign(new Error('not the founder'), { status: 403 });
      }
      fails = 0;
      say('ACCESS GRANTED', 'ok'); crt.classList.add('granted'); wall.setMode('granted');
      await wait(still ? 0 : 1200);
      enter(true);
    } catch (err) {
      fails++; key.value = '';
      // Same message whether the user id or the key was wrong: the page never reveals which ids exist.
      if (err.status === 0) say('GRID OFFLINE · TRY AGAIN LATER', 'bad');
      else if (err.status === 429) say('TOO MANY ATTEMPTS · WAIT A MINUTE', 'bad');
      else say('ACCESS DENIED', 'bad');
      wall.setMode('denied');
      crt.classList.remove('denied'); void crt.offsetWidth; crt.classList.add('denied');
      // A growing pause after repeated misses (the server also limits attempts).
      if (fails >= 3) await wait(1500 * Math.min(fails - 2, 5));
      wall.setMode('idle');
    }
    busy = false; user.readOnly = key.readOnly = false;
    (user.value ? key : user).focus();
  });

  const inv = $('invite'), invMsg = $('invMsg');
  const invFields = ['invCode', 'invUser', 'invKey', 'invKey2'].map($);
  const [invCode, invUser, invKey, invKey2] = invFields;
  function showForm(which) {
    const toInvite = which === 'invite';
    gate.hidden = toInvite; inv.hidden = !toInvite;
    log.hidden = toInvite;              // the monitor clears its boot text to make room
    say('', '', toInvite ? invMsg : msg);
    (toInvite ? invCode : user).focus({ preventScroll: true });
  }
  $('toInvite').addEventListener('click', () => showForm('invite'));
  $('toLogin').addEventListener('click', () => showForm('login'));

  // Turn the server's refusals into short monitor messages.
  function inviteError(err) {
    const m = String(err.message || '').toLowerCase();
    if (err.status === 0) return 'GRID OFFLINE · TRY AGAIN LATER';
    if (err.status === 429) return 'TOO MANY ATTEMPTS · WAIT A FEW MINUTES';
    if (m.includes('invite')) return 'INVITE CODE NOT VALID, ALREADY USED OR EXPIRED';
    if (m.includes('already') || m.includes('registered') || m.includes('exists')) return 'THAT USER ID IS TAKEN · CHOOSE ANOTHER';
    if (m.includes('user id')) return 'USER ID: 3–32 LETTERS, DIGITS, . _ -';
    if (m.includes('password') || m.includes('weak')) return 'ACCESS KEY REFUSED · USE A LONGER, LESS COMMON ONE';
    if (m.includes('signup') || m.includes('sign up') || m.includes('not allowed')) return 'INVITES ARE CLOSED RIGHT NOW';
    return 'SIGN-UP REFUSED';
  }

  inv.addEventListener('submit', async e => {
    e.preventDefault();
    if (busy) return;
    const code = invCode.value.trim(), name = invUser.value.trim().toLowerCase();
    // [passes?, field to fix, message]; the first failing check is reported.
    const fail = [
      [code.replace(/[^A-Za-z0-9]/g, '').length >= 12, invCode, 'ENTER THE INVITE CODE YOU WERE GIVEN'],
      [/^[a-z0-9][a-z0-9._-]{2,31}$/.test(name), invUser, 'USER ID: 3–32 LETTERS, DIGITS, . _ -'],
      [invKey.value.length >= 12, invKey, 'ACCESS KEY: AT LEAST 12 CHARACTERS'],
      [invKey.value === invKey2.value, invKey2, 'THE TWO KEYS ARE DIFFERENT']
    ].find(c => !c[0]);
    if (fail) { say(fail[2], 'bad', invMsg); fail[1].focus(); return; }
    if (!connected) { say('GRID NOT CONNECTED YET', 'bad', invMsg); return; }
    busy = true; invFields.forEach(f => { f.readOnly = true; });
    say('CHECKING INVITE…', 'dim', invMsg); wall.setMode('scan');
    let fix = null;                     // the field to fix if the server refuses
    try {
      await API.signUp(code, name, invKey.value);
      invFields.forEach(f => { if (f.type === 'password') f.value = ''; });
      say('ACCOUNT CREATED · ACCESS GRANTED', 'ok', invMsg); crt.classList.add('granted'); wall.setMode('granted');
      await wait(still ? 0 : 1400);
      return enter(true);
    } catch (err) {
      const text = inviteError(err);
      say(text, 'bad', invMsg);
      fix = /INVITE/.test(text) ? invCode : /USER ID/.test(text) ? invUser : /KEY/.test(text) ? invKey : null;
      wall.setMode('denied');
      crt.classList.remove('denied'); void crt.offsetWidth; crt.classList.add('denied');
      await wait(1200);
      wall.setMode('idle');
    }
    busy = false; invFields.forEach(f => { f.readOnly = false; });
    if (fix) fix.focus();
  });

  // ---------- Inside ----------
  let idleTimer = 0;
  function armIdle() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => lock('idle'), C.idleMinutes * 60000);
  }
  async function lock(reason) {
    clearTimeout(idleTimer);
    window.GridLab?.close();
    await API.signOut();
    // Reloading wipes everything that was shown; the intro then plays again.
    const q = [founderDoor && 'founder', reason === 'idle' && 'locked=idle'].filter(Boolean).join('&');
    location.replace(location.pathname + (q ? '?' + q : ''));
  }
  function enter(withFlash) {
    document.body.classList.remove('locked'); document.body.classList.add('unlocked');
    $('gateLayer').hidden = true; $('spaceShell').hidden = false;
    wall.setMode('inside');
    $('who').textContent = API.handle();
    if (withFlash && !still) document.body.classList.add('arrive');
    window.GridLab?.open($('gridLab'));
    GridSpace.open($('gridSector'));
    $('space').focus({ preventScroll: true });
    API.invites.isAdmin().then(ok => { $('inviteBtn').hidden = !ok; });
    ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach(t => addEventListener(t, armIdle, { passive: true }));
    armIdle();
  }
  $('lockGrid').addEventListener('click', () => lock('user'));
  $('changeKey').addEventListener('click', () => GridSpace.changePassword());
  $('inviteBtn').addEventListener('click', () => GridSpace.invites());
  if (new URLSearchParams(location.search).get('locked') === 'idle') history.replaceState(null, '', location.pathname + (founderDoor ? '?founder' : ''));

  show();
})();

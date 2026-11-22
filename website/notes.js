/* Elyvris Notes.
   Each note has a title and a list of blocks: text, drawing, image or calculation.
   Everything is kept in this browser's own database (IndexedDB). Nothing is sent anywhere. */
(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const make = (tag, props = {}, parent) => {
    const node = Object.assign(document.createElement(tag), props);
    if (parent) parent.appendChild(node);
    return node;
  };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
  const when = t => new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /* ---------- storage ---------- */
  const DB_NAME = 'elyvris-notes', STORE = 'notes';
  let dbPromise = null;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  async function tx(mode, work) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode), store = t.objectStore(STORE);
      const out = work(store);
      t.oncomplete = () => resolve(out && 'result' in out ? out.result : undefined);
      t.onerror = () => reject(t.error);
    });
  }
  const allNotes = () => tx('readonly', s => s.getAll());
  const putNote = note => tx('readwrite', s => s.put(note));
  const deleteNote = id => tx('readwrite', s => s.delete(id));

  /* ---------- the list of notes ---------- */
  const listView = $('notes-list'), editorView = $('note-editor');
  const cards = $('note-cards');

  function summary(note) {
    const text = note.blocks.find(b => b.type === 'text' && b.text.trim());
    const kinds = [...new Set(note.blocks.map(b => ({ text: 'text', drawing: 'drawing', image: 'image', calc: 'calculation' }[b.type])))];
    return { preview: text ? text.text.trim().slice(0, 160) : '', kinds: kinds.join(' · ') };
  }

  async function showList() {
    const notes = (await allNotes()).sort((a, b) => b.updated - a.updated);
    cards.replaceChildren();
    for (const note of notes) {
      const li = make('li', {}, cards);
      const card = make('button', { type: 'button', className: 'note-card' }, li);
      const { preview, kinds } = summary(note);
      make('span', { className: 'nc-date', textContent: when(note.updated) }, card);
      make('span', { className: 'nc-title', textContent: note.title.trim() || 'Untitled note' }, card);
      if (preview) make('span', { className: 'nc-preview', textContent: preview }, card);
      make('span', { className: 'nc-kinds', textContent: kinds || 'empty' }, card);
      card.addEventListener('click', () => openNote(note));
    }
    $('notes-empty').hidden = notes.length > 0;
    editorView.hidden = true;
    listView.hidden = false;
    showStorage();
  }

  async function showStorage() {
    const out = $('notes-storage');
    if (!navigator.storage || !navigator.storage.estimate) { out.textContent = ''; return; }
    const { usage = 0 } = await navigator.storage.estimate();
    const kept = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    out.textContent = `Space used in this browser: ${(usage / 1048576).toFixed(1)} MB. ` +
      (kept ? 'The browser keeps these notes until you delete them.'
            : 'Clearing this site’s data in the browser settings deletes the notes; “Save a copy” keeps a file of them.');
  }

  /* ---------- one open note ---------- */
  let current = null, saveTimer = 0;
  const status = $('note-status');

  function touch() {
    if (!current) return;
    current.updated = Date.now();
    status.textContent = 'Saving…';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 400);
  }
  async function saveNow() {
    clearTimeout(saveTimer);
    if (!current) return;
    try {
      await putNote(current);
      status.textContent = 'Saved in this browser';
      $('note-dates').textContent = `Created ${when(current.created)} · changed ${when(current.updated)}`;
    } catch (error) {
      status.textContent = 'Could not save: ' + error.message;
    }
  }

  function openNote(note) {
    current = note;
    $('note-title').value = note.title;
    $('note-dates').textContent = `Created ${when(note.created)} · changed ${when(note.updated)}`;
    status.textContent = '';
    const holder = $('note-blocks');
    holder.replaceChildren();
    note.blocks.forEach(block => holder.appendChild(renderBlock(block)));
    listView.hidden = true;
    editorView.hidden = false;
    window.scrollTo(0, 0);
    if (!note.title) $('note-title').focus();
  }

  $('note-title').addEventListener('input', event => { current.title = event.target.value; touch(); });
  $('note-back').addEventListener('click', async () => { await saveNow(); current = null; showList(); });
  $('note-delete').addEventListener('click', async () => {
    if (!current) return;
    if (!confirm(`Delete “${current.title || 'Untitled note'}”? This cannot be undone.`)) return;
    clearTimeout(saveTimer);
    await deleteNote(current.id);
    current = null;
    showList();
  });

  $('note-new').addEventListener('click', async () => {
    const now = Date.now();
    const note = { id: newId(), title: '', created: now, updated: now, blocks: [{ id: newId(), type: 'text', text: '' }] };
    await putNote(note);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    openNote(note);
  });

  /* ---------- blocks ---------- */
  document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
    const type = button.dataset.add;
    if (type === 'image') { $('image-pick').click(); return; }
    const block = { id: newId(), type };
    if (type === 'text') block.text = '';
    if (type === 'drawing') block.strokes = [];
    if (type === 'calc') block.text = '';
    addBlock(block);
  }));

  function addBlock(block) {
    current.blocks.push(block);
    const node = renderBlock(block);
    $('note-blocks').appendChild(node);
    node.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    const field = node.querySelector('textarea');
    if (field) field.focus({ preventScroll: true });
    touch();
  }

  function renderBlock(block) {
    const box = make('div', { className: 'block' });
    const head = make('div', { className: 'block-head' }, box);
    make('span', { className: 'block-kind', textContent: { text: 'Text', drawing: 'Drawing', image: 'Image', calc: 'Calculation' }[block.type] }, head);
    const tools = make('div', { className: 'block-tools' }, head);
    const move = (dir, label, sign) => {
      const b = make('button', { type: 'button', className: 'icon-btn', textContent: sign, title: label }, tools);
      b.setAttribute('aria-label', label);
      b.addEventListener('click', () => {
        const list = current.blocks, i = list.indexOf(block), j = i + dir;
        if (j < 0 || j >= list.length) return;
        [list[i], list[j]] = [list[j], list[i]];
        const sibling = dir < 0 ? box.previousElementSibling : box.nextElementSibling;
        if (dir < 0) box.parentNode.insertBefore(box, sibling); else box.parentNode.insertBefore(sibling, box);
        touch();
      });
    };
    move(-1, 'Move up', '↑');
    move(1, 'Move down', '↓');
    const remove = make('button', { type: 'button', className: 'icon-btn', textContent: '×', title: 'Remove this part' }, tools);
    remove.setAttribute('aria-label', 'Remove this part');
    remove.addEventListener('click', () => {
      if (!confirm('Remove this part of the note?')) return;
      current.blocks.splice(current.blocks.indexOf(block), 1);
      box.remove();
      touch();
    });

    if (block.type === 'text') textBlock(box, block);
    if (block.type === 'drawing') drawingBlock(box, block);
    if (block.type === 'image') imageBlock(box, block);
    if (block.type === 'calc') calcBlock(box, block);
    return box;
  }

  function grow(area) { area.style.height = 'auto'; area.style.height = area.scrollHeight + 4 + 'px'; }

  function textBlock(box, block) {
    const area = make('textarea', { value: block.text, placeholder: 'Write here…', spellcheck: true }, box);
    area.setAttribute('aria-label', 'Text');
    area.addEventListener('input', () => { block.text = area.value; grow(area); touch(); });
    requestAnimationFrame(() => grow(area));
  }

  /* Drawing panel.
     A drawing is a list of strokes. Each stroke keeps its tool (pen, highlighter or rubber), colour, size and
     points; positions and sizes are fractions of the drawing's width, so it looks the same at any size.
     Lines are drawn as smooth curves through the points (Catmull-Rom), and a pen's pressure sets the width.
     The rubber removes ink only where it passes. After a pen has touched a drawing, fingers no longer draw
     on it (a hand resting on a tablet), and the pen's own eraser end works as the rubber. */
  const INKS = [['#1B1F27', 'Black'], ['#5B6270', 'Grey'], ['#B4741A', 'Amber'], ['#2F6FA8', 'Blue'], ['#3C8A4E', 'Green'], ['#B3392F', 'Red'], ['#7A4FB0', 'Purple']];
  const TOOLS = { pen: { label: 'Pen', size: 3 }, marker: { label: 'Highlighter', size: 18 }, erase: { label: 'Rubber', size: 24 } };
  const REF = 1000;   // sizes are given in "px on a 1000 px wide drawing"

  function strokePoints(stroke, W) {
    // Smooth curve through the stored points, with extra points every ~1.5 px.
    const p = stroke.p, out = [];
    if (p.length === 1) return [[p[0][0] * W, p[0][1] * W, p[0][2]]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], d = p[i + 2] || p[i + 1];
      const len = Math.hypot(c[0] - b[0], c[1] - b[1]) * W;
      const m = Math.max(1, Math.min(24, Math.ceil(len / 1.5)));
      for (let k = 0; k < m; k++) {
        const t = k / m, t2 = t * t, t3 = t2 * t;
        const cr = (q0, q1, q2, q3) => 0.5 * (2 * q1 + (-q0 + q2) * t + (2 * q0 - 5 * q1 + 4 * q2 - q3) * t2 + (-q0 + 3 * q1 - 3 * q2 + q3) * t3);
        out.push([cr(a[0], b[0], c[0], d[0]) * W, cr(a[1], b[1], c[1], d[1]) * W, b[2] + (c[2] - b[2]) * t]);
      }
    }
    const last = p[p.length - 1];
    out.push([last[0] * W, last[1] * W, last[2]]);
    return out;
  }
  function radius(stroke, W, pressure) {
    const base = (stroke.s != null ? stroke.s : stroke.w) * W / 2;
    return (stroke.t || 'pen') === 'pen' ? base * (0.3 + 1.4 * pressure) : base;
  }
  function inkStroke(ctx, stroke, W) {
    const pts = strokePoints(stroke, W);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = stroke.t === 'erase' ? '#000' : stroke.c;
    if (pts.length === 1) {
      ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], Math.max(.4, radius(stroke, W, pts[0][2])), 0, Math.PI * 2); ctx.fill();
      return;
    }
    const constant = (stroke.t || 'pen') !== 'pen';
    if (constant) {                         // one path: even width, no darker overlaps
      ctx.lineWidth = Math.max(.8, 2 * radius(stroke, W, .5));
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
      return;
    }
    for (let i = 1; i < pts.length; i++) {  // pen: width follows the pressure along the line
      ctx.lineWidth = Math.max(.6, radius(stroke, W, pts[i - 1][2]) + radius(stroke, W, pts[i][2]));
      ctx.beginPath(); ctx.moveTo(pts[i - 1][0], pts[i - 1][1]); ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke();
    }
  }
  function applyStroke(target, stroke, W, H, scratch) {
    if (stroke.t === 'erase') {
      target.save(); target.globalCompositeOperation = 'destination-out'; inkStroke(target, stroke, W); target.restore();
    } else if (stroke.t === 'marker') {     // drawn alone first, then laid on see-through
      scratch.clearRect(0, 0, W, H); inkStroke(scratch, stroke, W);
      target.save(); target.globalAlpha = .38; target.drawImage(scratch.canvas, 0, 0); target.restore();
    } else {
      inkStroke(target, stroke, W);
    }
  }

  function drawingBlock(box, block) {
    block.paper = block.paper || 'plain';
    const bar = make('div', { className: 'draw-bar' }, box);
    const wrap = make('div', { className: 'draw-wrap' }, box);
    const canvas = make('canvas', { className: 'draw-canvas', tabIndex: 0 }, wrap);
    canvas.setAttribute('aria-label', 'Drawing area: draw with a pen, a finger or the mouse. Ctrl+Z undoes, Ctrl+Y redoes.');
    const ctx = canvas.getContext('2d');
    const kept = document.createElement('canvas').getContext('2d');     // all finished strokes
    const scratch = document.createElement('canvas').getContext('2d');  // one highlighter stroke at a time
    let tool = 'pen', ink = INKS[0][0], penSeen = false, live = null, last = null, redo = [], frame = 0;
    const sizes = { pen: TOOLS.pen.size, marker: TOOLS.marker.size, erase: TOOLS.erase.size };

    // --- toolbar ---
    const group = (label) => { const g = make('div', { className: 'draw-group' }, bar); g.setAttribute('role', 'group'); g.setAttribute('aria-label', label); return g; };
    const tg = group('Tool');
    const toolButtons = Object.entries(TOOLS).map(([key, { label }]) => {
      const b = make('button', { type: 'button', className: 'n-btn n-small', textContent: label }, tg);
      b.addEventListener('click', () => { tool = key; sync(); });
      return [key, b];
    });
    const sg = group('Size');
    make('span', { className: 'draw-label', textContent: 'Size' }, sg);
    const size = make('input', { type: 'range', min: 1, max: 60, step: 1, className: 'draw-size' }, sg);
    size.setAttribute('aria-label', 'Size');
    const dot = make('span', { className: 'draw-dot' }, sg);
    size.addEventListener('input', () => { sizes[tool] = +size.value; sync(); });
    const cg = group('Colour');
    const swatches = INKS.map(([colour, name]) => {
      const s = make('button', { type: 'button', className: 'swatch', title: name }, cg);
      s.style.background = colour;
      s.setAttribute('aria-label', name);
      s.addEventListener('click', () => { ink = colour; if (tool === 'erase') tool = 'pen'; sync(); });
      return [colour, s];
    });
    const custom = make('input', { type: 'color', className: 'swatch-pick', value: '#1b1f27', title: 'Any colour' }, cg);
    custom.setAttribute('aria-label', 'Any colour');
    custom.addEventListener('input', () => { ink = custom.value; if (tool === 'erase') tool = 'pen'; sync(); });
    const ag = group('Actions');
    const undoBtn = make('button', { type: 'button', className: 'n-btn n-small', textContent: 'Undo' }, ag);
    const redoBtn = make('button', { type: 'button', className: 'n-btn n-small', textContent: 'Redo' }, ag);
    const clearBtn = make('button', { type: 'button', className: 'n-btn n-small', textContent: 'Clear' }, ag);
    const paper = make('select', { className: 'draw-paper' }, ag);
    paper.setAttribute('aria-label', 'Paper');
    [['plain', 'Plain paper'], ['grid', 'Squared paper'], ['lines', 'Lined paper']].forEach(([v, t]) => make('option', { value: v, textContent: t }, paper));
    paper.value = block.paper;
    const full = make('button', { type: 'button', className: 'n-btn n-small', textContent: 'Full screen' }, ag);

    function sync() {
      toolButtons.forEach(([key, b]) => b.setAttribute('aria-pressed', String(key === tool)));
      swatches.forEach(([colour, s]) => s.setAttribute('aria-pressed', String(tool !== 'erase' && colour === ink)));
      size.value = sizes[tool];
      const r = canvas.getBoundingClientRect().width || REF;
      const px = Math.max(2, sizes[tool] * r / REF * (tool === 'pen' ? 1 : 1));
      dot.style.width = dot.style.height = Math.min(30, px) + 'px';
      dot.style.background = tool === 'erase' ? '#F7F4EC' : ink;
      dot.style.opacity = tool === 'marker' ? .45 : 1;
      undoBtn.disabled = !block.strokes.length;
      redoBtn.disabled = !redo.length;
      canvas.dataset.tool = tool;
    }

    // --- painting ---
    function fit() {
      const r = canvas.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width === w && canvas.height === h) return false;
      [canvas, kept.canvas, scratch.canvas].forEach(c => { c.width = w; c.height = h; });
      const cell = (r.width * 0.04).toFixed(2) + 'px';
      canvas.style.backgroundSize = block.paper === 'lines' ? `100% ${cell}` : `${cell} ${cell}`;
      return true;
    }
    function rebuild() {
      fit();
      const W = canvas.width, H = canvas.height;
      kept.clearRect(0, 0, W, H);
      block.strokes.forEach(s => applyStroke(kept, s, W, H, scratch));
      show();
    }
    function show() {
      const W = canvas.width, H = canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.drawImage(kept.canvas, 0, 0);
      if (live && live.p.length) applyStroke(ctx, live, W, H, scratch);
      if (tool === 'erase' && last) {      // a ring that shows the rubber's size
        ctx.save(); ctx.strokeStyle = 'rgba(30,34,42,.55)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(last[0] * W, last[1] * W, sizes.erase / REF * W / 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
      }
    }
    const request = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; show(); }); };

    function commit(stroke) {
      block.strokes.push(stroke);
      redo = [];
      applyStroke(kept, stroke, canvas.width, canvas.height, scratch);
      show(); sync(); touch();
    }
    undoBtn.addEventListener('click', () => { if (!block.strokes.length) return; redo.push(block.strokes.pop()); rebuild(); sync(); touch(); });
    redoBtn.addEventListener('click', () => { if (!redo.length) return; block.strokes.push(redo.pop()); rebuild(); sync(); touch(); });
    clearBtn.addEventListener('click', () => {
      if (!block.strokes.length || !confirm('Clear the whole drawing?')) return;
      redo = block.strokes.slice().reverse(); block.strokes = []; rebuild(); sync(); touch();
    });
    paper.addEventListener('change', () => { block.paper = paper.value; canvas.dataset.paper = paper.value; canvas.width = 0; rebuild(); touch(); });
    canvas.dataset.paper = block.paper;
    full.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if (box.requestFullscreen) box.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => { full.textContent = document.fullscreenElement === box ? 'Exit full screen' : 'Full screen'; requestAnimationFrame(rebuild); });
    canvas.addEventListener('keydown', event => {
      const k = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && k === 'z' && !event.shiftKey) { event.preventDefault(); undoBtn.click(); }
      if ((event.ctrlKey || event.metaKey) && (k === 'y' || (k === 'z' && event.shiftKey))) { event.preventDefault(); redoBtn.click(); }
    });

    // --- input ---
    const point = event => {
      const r = canvas.getBoundingClientRect();
      let pressure = event.pointerType === 'mouse' ? .5 : event.pressure;
      if (!pressure) pressure = .5;     // some touch screens report no pressure
      return [(event.clientX - r.left) / r.width, (event.clientY - r.top) / r.width, pressure];
    };
    const round = q => [+q[0].toFixed(5), +q[1].toFixed(5), +q[2].toFixed(2)];
    let smooth = null;
    function add(q) {
      // Steady the hand a little (pen and highlighter only) and skip points closer than 0.6 px.
      if (live.t !== 'erase' && smooth) q = [smooth[0] + (q[0] - smooth[0]) * .55, smooth[1] + (q[1] - smooth[1]) * .55, smooth[2] + (q[2] - smooth[2]) * .5];
      smooth = q;
      const prev = live.p[live.p.length - 1], W = canvas.getBoundingClientRect().width;
      if (prev && Math.hypot(q[0] - prev[0], q[1] - prev[1]) * W < .6) return;
      live.p.push(round(q));
    }
    canvas.addEventListener('pointerdown', event => {
      if (event.pointerType === 'pen') penSeen = true;
      if (event.pointerType === 'touch' && penSeen) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      canvas.focus({ preventScroll: true });
      try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* pointer already gone */ }
      const using = event.buttons & 32 ? 'erase' : tool;     // the pen's eraser end
      live = { t: using, s: sizes[using] / REF, p: [] };
      if (using !== 'erase') live.c = ink;
      smooth = null;
      add(point(event));
      last = point(event);
      request();
    });
    canvas.addEventListener('pointermove', event => {
      last = point(event);
      if (!live) { if (tool === 'erase') request(); return; }
      const all = event.getCoalescedEvents ? event.getCoalescedEvents() : [];
      (all.length ? all : [event]).forEach(e => add(point(e)));
      request();
    });
    canvas.addEventListener('pointerleave', () => { if (!live) { last = null; request(); } });
    const finish = () => {
      if (!live) return;
      const stroke = live; live = null; smooth = null;
      if (stroke.p.length) commit(stroke); else show();
    };
    canvas.addEventListener('pointerup', finish);
    canvas.addEventListener('pointercancel', finish);
    new ResizeObserver(() => { if (fit()) rebuild(); sync(); }).observe(canvas);
    sync();
  }

  /* Image: made smaller in the browser (longest side at most 1600 px) before it is kept. */
  $('image-pick').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file || !current) return;
    try {
      const blob = await shrink(file, 1600);
      addBlock({ id: newId(), type: 'image', blob, caption: '' });
    } catch (error) {
      alert('This image could not be read: ' + error.message);
    }
  });
  async function shrink(file, longest) {
    const bitmap = await createImageBitmap(file);
    const k = Math.min(1, longest / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * k); canvas.height = Math.round(bitmap.height * k);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return new Promise((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('empty image')), type, .88));
  }
  function imageBlock(box, block) {
    const img = make('img', { className: 'img-shown', alt: block.caption || 'Image in the note' }, box);
    const url = URL.createObjectURL(block.blob);
    img.src = url;
    img.addEventListener('load', () => URL.revokeObjectURL(url), { once: true });
    const caption = make('input', { type: 'text', className: 'img-caption', value: block.caption || '', placeholder: 'Caption (optional)' }, box);
    caption.setAttribute('aria-label', 'Caption');
    caption.addEventListener('input', () => { block.caption = caption.value; img.alt = caption.value || 'Image in the note'; touch(); });
  }

  /* Calculation: one expression per line, results beside it.
     "x = 2*pi*0.5" stores x; "ans" is the last result; "#" starts a comment.
     The reader below only knows numbers, + - * / ^, brackets, names and these functions,
     so a line can never run code. */
  const FUNCS = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, asin: Math.asin, acos: Math.acos, atan: Math.atan,
    exp: Math.exp, ln: Math.log, log: Math.log10, log10: Math.log10, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
    min: Math.min, max: Math.max, deg: x => x * 180 / Math.PI, rad: x => x * Math.PI / 180 };
  const CONSTS = { pi: Math.PI, e: Math.E };

  function evaluate(src, vars) {
    const tokens = src.match(/\d+\.?\d*(?:e[+-]?\d+)?|\.\d+(?:e[+-]?\d+)?|[A-Za-z_]\w*|\*\*|[-+*/^(),]|\S/gi) || [];
    let i = 0;
    const peek = () => tokens[i], take = () => tokens[i++];
    const expect = t => { if (take() !== t) throw new Error(`“${t}” expected`); };
    function expr() { let v = term(); while (peek() === '+' || peek() === '-') v = take() === '+' ? v + term() : v - term(); return v; }
    function term() { let v = unary(); while (peek() === '*' || peek() === '/') v = take() === '*' ? v * unary() : v / unary(); return v; }
    function unary() { if (peek() === '-') { take(); return -unary(); } if (peek() === '+') { take(); return unary(); } return power(); }
    function power() { const base = primary(); if (peek() === '^' || peek() === '**') { take(); return Math.pow(base, unary()); } return base; }
    function primary() {
      const t = take();
      if (t === undefined) throw new Error('unfinished line');
      if (t === '(') { const v = expr(); expect(')'); return v; }
      if (/^(\d|\.\d)/.test(t)) return parseFloat(t);
      if (/^[A-Za-z_]/.test(t)) {
        if (peek() === '(') {
          const f = FUNCS[t.toLowerCase()];
          if (!f) throw new Error(`unknown function “${t}”`);
          take();
          const args = [expr()];
          while (peek() === ',') { take(); args.push(expr()); }
          expect(')');
          return f(...args);
        }
        if (Object.prototype.hasOwnProperty.call(vars, t)) return vars[t];
        if (Object.prototype.hasOwnProperty.call(CONSTS, t)) return CONSTS[t];
        throw new Error(`“${t}” has no value yet`);
      }
      throw new Error(`“${t}” not understood`);
    }
    const value = expr();
    if (i < tokens.length) throw new Error(`“${tokens[i]}” not understood`);
    return value;
  }
  const show = v => {
    if (!isFinite(v)) return String(v);
    if (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-4)) return v.toExponential(5).replace(/\.?0+e/, 'e');
    return String(+v.toPrecision(8));
  };
  function runCalc(text) {
    const vars = Object.create(null);
    return text.split('\n').map(raw => {
      const line = raw.replace(/#.*/, '').trim();
      if (!line) return { out: '' };
      const m = line.match(/^([A-Za-z_]\w*)\s*=(?!=)\s*(.+)$/);
      try {
        const value = evaluate(m ? m[2] : line, vars);
        vars.ans = value;
        if (m) vars[m[1]] = value;
        return { out: (m ? m[1] + ' = ' : '= ') + show(value) };
      } catch (error) {
        return { out: error.message, err: true };
      }
    });
  }
  function calcBlock(box, block) {
    const grid = make('div', { className: 'calc-grid' }, box);
    const area = make('textarea', { value: block.text, spellcheck: false, placeholder: 'lambda = 532e-9\nn = 2.4\nd = lambda / (4*n)' }, grid);
    area.setAttribute('aria-label', 'Calculation, one line at a time');
    const out = make('pre', { className: 'calc-out' }, grid);
    out.setAttribute('aria-live', 'polite');
    const update = () => {
      out.replaceChildren();
      runCalc(area.value).forEach(({ out: text, err }, k) => {
        if (k) out.appendChild(document.createTextNode('\n'));
        const span = make('span', { textContent: text }, out);
        if (err) span.className = 'err';
      });
      grow(area);
    };
    area.addEventListener('input', () => { block.text = area.value; update(); touch(); });
    area.addEventListener('scroll', () => { out.scrollTop = area.scrollTop; });
    make('p', { className: 'calc-help', textContent: 'One line at a time. Names: x = 2*pi. Also: ^, sqrt, sin, cos, exp, ln, log, abs, pi, e, ans (the last result). # starts a comment.' }, box);
    requestAnimationFrame(update);
  }

  /* ---------- a copy as a file ---------- */
  const toDataURL = blob => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
  $('notes-export').addEventListener('click', async () => {
    const notes = await allNotes();
    const plain = await Promise.all(notes.map(async note => ({ ...note, blocks: await Promise.all(note.blocks.map(async b => b.type === 'image' ? { ...b, blob: undefined, data: await toDataURL(b.blob) } : b)) })));
    const file = new Blob([JSON.stringify({ format: 'elyvris-notes', version: 1, saved: new Date().toISOString(), notes: plain })], { type: 'application/json' });
    const link = make('a', { href: URL.createObjectURL(file), download: `elyvris-notes-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  });
  $('notes-import').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.format !== 'elyvris-notes' || !Array.isArray(data.notes)) throw new Error('this is not an Elyvris notes file');
      const existing = new Set((await allNotes()).map(n => n.id));
      let added = 0;
      for (const n of data.notes) {
        const blocks = await Promise.all((n.blocks || []).map(async b => {
          if (b.type === 'image' && typeof b.data === 'string' && b.data.startsWith('data:image/')) {
            const [head, body] = b.data.split(',');
            const bytes = Uint8Array.from(atob(body), ch => ch.charCodeAt(0));
            const blob = new Blob([bytes], { type: head.slice(5, head.indexOf(';')) });
            return { id: newId(), type: 'image', blob, caption: String(b.caption || '') };
          }
          if (b.type === 'text' || b.type === 'calc') return { id: newId(), type: b.type, text: String(b.text || '') };
          if (b.type === 'drawing' && Array.isArray(b.strokes)) return { id: newId(), type: 'drawing', strokes: b.strokes };
          return null;
        }));
        const id = existing.has(n.id) || !n.id ? newId() : String(n.id);
        await putNote({ id, title: String(n.title || ''), created: +n.created || Date.now(), updated: +n.updated || Date.now(), blocks: blocks.filter(Boolean) });
        added++;
      }
      await showList();
      alert(`${added} note${added === 1 ? '' : 's'} added.`);
    } catch (error) {
      alert('This file could not be opened: ' + error.message);
    }
  });

  window.addEventListener('pagehide', () => { if (current) saveNow(); });
  if (!window.indexedDB) {
    $('notes-storage').textContent = 'This browser cannot keep notes (no IndexedDB, for example in some private windows).';
    $('note-new').disabled = true;
    return;
  }
  showList().catch(error => { $('notes-storage').textContent = 'Notes could not be opened: ' + error.message; });
})();

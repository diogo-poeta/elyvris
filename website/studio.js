/* Elyvris Studio — page logic.
 *
 * The design is a list of shapes (studio-code.js describes one shape).
 * Three views of the same list stay in step:
 *   3D view   (studio-view3d.js)
 *   the form  (buttons and number fields on this page)
 *   the code  (gdsfactory or Meep text; editing it changes the shapes)
 * All lengths are stored in nanometres. Nothing leaves the browser.
 */
(() => {
  'use strict';
  const C = window.ElyvrisStudioCode, A = window.ElyvrisAssistant, Materials = window.OpticalMaterials, View = window.ElyvrisView3D;
  const $ = id => document.getElementById(id);
  if (!$('studio') || !C) return;

  const STORE = 'elyvris-studio-design-v2', MAX_SHAPES = 200, MAX_SIZE = 1e7; // 1e7 nm = 1 cm
  const FIELDS = {
    sphere: [['radius', 'Radius']],
    cylinder: [['radius', 'Radius'], ['height', 'Height']],
    box: [['sx', 'Size x'], ['sy', 'Size y'], ['sz', 'Size z']],
    cone: [['radius', 'Bottom radius'], ['radius2', 'Top radius'], ['height', 'Height']],
    ellipsoid: [['sx', 'Size x'], ['sy', 'Size y'], ['sz', 'Size z']],
    ring: [['radius', 'Outer radius'], ['width', 'Wall width'], ['height', 'Height']],
    prism: [['sides', 'Corners'], ['radius', 'Corner radius'], ['height', 'Height']]
  };
  const CAN_BE_INFINITE = ['height', 'sx', 'sy', 'sz'];

  let shapes = [], selected = -1, unit = 'nm', tab = 'gds', history = [], view = null, materialsReady = false, dragStarted = false;

  /* ------------------------------------------------------------------ *
   * Numbers and units
   * ------------------------------------------------------------------ */
  const factor = () => unit === 'um' ? 1000 : 1;
  const unitLabel = () => unit === 'um' ? 'µm' : 'nm';
  const show = nm => nm === Infinity ? 'inf' : String(Number((nm / factor()).toPrecision(8)));
  function read(text) {
    const t = String(text).trim().toLowerCase();
    if (t === 'inf' || t === 'infinity' || t === 'mp.inf') return Infinity;
    return t === '' ? NaN : Number(t) * factor();
  }
  function niceStep(value) {
    const power = Math.pow(10, Math.floor(Math.log10(value))), f = value / power;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * power;
  }

  /* Keep only well-formed shapes (used for saved designs and for code). */
  function clean(shape) {
    if (!shape || !C.TYPES[shape.type]) return null;
    const out = { type: shape.type, material: C.MATERIALS.some(m => m.id === shape.material) ? shape.material : 'custom' };
    if (out.material === 'custom') { out.customName = String(shape.customName || 'material1').slice(0, 40); out.customN = shape.customN > 0 && shape.customN <= 20 ? Number(shape.customN) : null; }
    for (const key of ['x', 'y', 'z']) { const v = Number(shape[key]); if (!Number.isFinite(v) || Math.abs(v) > MAX_SIZE) return null; out[key] = v; }
    for (const [key] of FIELDS[shape.type]) {
      let v = shape[key] === 'inf' ? Infinity : Number(shape[key]);
      if (key === 'sides') { out.sides = Math.max(3, Math.min(64, Math.round(v) || 3)); continue; }
      const infiniteOk = CAN_BE_INFINITE.includes(key) && v === Infinity;
      if (!(v > 0 || (key === 'radius2' && v === 0)) || (!infiniteOk && v > MAX_SIZE)) return null;
      out[key] = v;
    }
    if (shape.type === 'ring' && !(out.width < out.radius)) return null;
    if (shape.type === 'cylinder' || shape.type === 'cone') out.axis = ['x', 'y', 'z'].includes(shape.axis) ? shape.axis : 'z';
    if (shape.type === 'prism' && Array.isArray(shape.points) && shape.points.length >= 3 && shape.points.length <= 400) {
      const points = shape.points.map(p => [Number(p[0]), Number(p[1])]);
      if (points.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))) out.points = points;
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * History (Undo) and saving in the browser
   * ------------------------------------------------------------------ */
  const freeze = () => JSON.stringify({ shapes, selected }, (key, value) => value === Infinity ? 'inf' : value);
  function thaw(text) {
    const data = JSON.parse(text);
    return { shapes: (data.shapes || []).map(clean).filter(Boolean).slice(0, MAX_SHAPES), selected: Number.isInteger(data.selected) ? data.selected : -1 };
  }
  function remember() { const now = freeze(); if (history[history.length - 1] !== now) { history.push(now); if (history.length > 40) history.shift(); } }
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ design: freeze(), unit, tab })); } catch (error) { /* storage may be unavailable */ } }
  $('undo').addEventListener('click', () => {
    let previous = history.pop();
    if (previous === freeze()) previous = history.pop();
    if (!previous) return;
    const state = thaw(previous); shapes = state.shapes; selected = Math.min(state.selected, shapes.length - 1);
    refresh('structure');
  });

  /* ------------------------------------------------------------------ *
   * 3D scene
   * ------------------------------------------------------------------ */
  function buildScene() {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    shapes.forEach(s => {
      const half = C.halfExtent(s), centre = [s.x, s.y, s.z];
      for (let k = 0; k < 3; k++) { const e = Number.isFinite(half[k]) ? half[k] : 0; min[k] = Math.min(min[k], centre[k] - e); max[k] = Math.max(max[k], centre[k] + e); }
    });
    if (!shapes.length) { min[0] = min[1] = -200; min[2] = 0; max[0] = max[1] = max[2] = 200; }
    const center = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
    const radius = Math.max(60, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    const grid = niceStep(radius / 3.5), reach = 20 * grid;      // infinite sizes are drawn out to the edge of the grid
    const f = v => Number.isFinite(v) ? v : reach;
    const parts = shapes.map((s, i) => {
      const half = C.halfExtent(s).map(v => Number.isFinite(v) ? v : reach / 2);
      const part = { at: [s.x, s.y, s.z], half, color: C.materialColor(s), selected: i === selected, axis: 'z' };
      if (s.type === 'sphere') { part.mesh = 'sphere'; part.size = [2 * s.radius, 2 * s.radius, 2 * s.radius]; }
      else if (s.type === 'cylinder') { part.mesh = 'cylinder'; part.size = [2 * s.radius, 2 * s.radius, f(s.height)]; part.axis = s.axis; }
      else if (s.type === 'cone') { const widest = Math.max(s.radius, s.radius2 || 0); part.mesh = 'cone'; part.bottom = s.radius / widest; part.top = (s.radius2 || 0) / widest; part.size = [2 * widest, 2 * widest, f(s.height)]; part.axis = s.axis; }
      else if (s.type === 'box') { part.mesh = 'box'; part.size = [f(s.sx), f(s.sy), f(s.sz)]; }
      else if (s.type === 'ellipsoid') { part.mesh = 'sphere'; part.size = [f(s.sx), f(s.sy), f(s.sz)]; }
      else if (s.type === 'ring') { part.mesh = 'ring'; part.inner = (s.radius - s.width) / s.radius; part.size = [2 * s.radius, 2 * s.radius, f(s.height)]; }
      else { part.mesh = 'prism'; part.points = C.prismPoints(s); part.size = [1, 1, f(s.height)]; }
      return part;
    });
    return { parts, center, radius, grid };
  }

  /* ------------------------------------------------------------------ *
   * Shape list and form
   * ------------------------------------------------------------------ */
  const list = $('shape-list'), form = $('shape-form');
  function shapeTitle(shape) { return `${C.TYPES[shape.type]} · ${C.materialLabel(shape)}`; }
  function renderList() {
    list.replaceChildren(...shapes.map((shape, index) => {
      const item = document.createElement('li'), button = document.createElement('button'), dot = document.createElement('i');
      button.type = 'button'; button.setAttribute('aria-pressed', String(index === selected));
      dot.style.background = C.materialColor(shape);
      button.append(dot, `${index + 1}. ${shapeTitle(shape)}`);
      button.addEventListener('click', () => { selected = index; refresh('select'); });
      item.append(button); return item;
    }));
    if (!shapes.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = 'No shapes yet. Add one above.'; list.append(empty); }
  }
  function field(labelText, value, apply, options) {
    options = options || {};
    const label = document.createElement('label'), input = document.createElement('input');
    label.className = 'field'; label.append(labelText);
    input.type = 'text'; input.inputMode = options.text ? 'text' : 'decimal'; input.value = value; input.autocomplete = 'off';
    input.addEventListener('focus', remember);
    input.addEventListener('input', () => { const ok = apply(input.value); input.setAttribute('aria-invalid', String(!ok)); if (ok) refresh('form'); });
    label.append(input); return label;
  }
  function chooser(labelText, choices, value, apply) {
    const label = document.createElement('label'), select = document.createElement('select');
    label.className = 'field'; label.append(labelText);
    choices.forEach(([id, text]) => { const option = document.createElement('option'); option.value = id; option.textContent = text; select.append(option); });
    select.value = value;
    select.addEventListener('change', () => { remember(); apply(select.value); refresh('structure-keep'); });
    label.append(select); return label;
  }
  function row(className, children) { const div = document.createElement('div'); div.className = className; div.append(...children); return div; }
  function action(text, run, className) { const button = document.createElement('button'); button.type = 'button'; button.textContent = text; if (className) button.className = className; button.addEventListener('click', run); return button; }

  function renderForm() {
    form.replaceChildren();
    if (selected < 0 || !shapes[selected]) {
      const hint = document.createElement('p'); hint.className = 'form-hint';
      hint.textContent = shapes.length ? 'Select a shape in the list or click it in the 3D view.' : '';
      form.append(hint); return;
    }
    const s = shapes[selected], u = unitLabel(), nodes = [];
    nodes.push(chooser('Material', C.MATERIALS.map(m => [m.id, m.label]), s.material, value => {
      s.material = value;
      if (value === 'custom') { s.customName = s.customName || 'material1'; s.customN = s.customN || 2; } else { delete s.customName; delete s.customN; }
    }));
    if (s.material === 'custom') {
      nodes.push(row('pair', [
        field('Name', s.customName || '', text => { const name = text.trim(); if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(name)) return false; s.customName = name; return true; }, { text: true }),
        field('Index n', s.customN === null || s.customN === undefined ? '' : s.customN, text => { if (text.trim() === '') { s.customN = null; return true; } const n = Number(text); if (!(n > 0 && n <= 20)) return false; s.customN = n; return true; })
      ]));
    }
    // A prism whose outline came from code keeps that outline: only its height is edited here.
    const sizeFields = s.type === 'prism' && s.points ? [['height', 'Height']] : FIELDS[s.type];
    if (s.type === 'prism' && s.points) { const note = document.createElement('p'); note.className = 'form-hint'; note.textContent = `Outline with ${s.points.length} corners. Edit the corners in the code box.`; nodes.push(note); }
    nodes.push(row(sizeFields.length === 3 ? 'trio' : sizeFields.length === 2 ? 'pair' : 'single', sizeFields.map(([key, name]) => {
      if (key === 'sides') return field(name, s.points ? s.points.length : s.sides, text => { const n = Number(text); if (!Number.isInteger(n) || n < 3 || n > 64) return false; s.sides = n; delete s.points; return true; });
      return field(`${name} (${u})`, show(s[key]), text => {
        const v = read(text), infinite = v === Infinity && CAN_BE_INFINITE.includes(key);
        if (!(infinite || (v > 0 && v <= MAX_SIZE) || (key === 'radius2' && v === 0))) return false;
        if (s.type === 'ring' && ((key === 'width' && !(v < s.radius)) || (key === 'radius' && !(v > s.width)))) return false;
        s[key] = v; if (s.type === 'prism' && key === 'radius') delete s.points;
        return true;
      });
    })));
    if (s.type === 'cylinder' || s.type === 'cone') nodes.push(chooser('Axis along', [['z', 'z (standing)'], ['x', 'x (lying)'], ['y', 'y (lying)']], s.axis || 'z', value => { s.axis = value; }));
    nodes.push(row('trio', ['x', 'y', 'z'].map(key => field(`Centre ${key} (${u})`, show(s[key]), text => { const v = read(text); if (!Number.isFinite(v) || Math.abs(v) > MAX_SIZE) return false; s[key] = v; return true; }))));
    nodes.push(row('actions', [
      action('Rest on z = 0', () => { const half = C.halfExtent(s)[2]; if (!Number.isFinite(half)) return; remember(); s.z = half; refresh('structure-keep'); }),
      action('Duplicate', () => {
        if (shapes.length >= MAX_SHAPES) return;
        remember(); const copy = clean(s); const step = C.halfExtent(s)[0]; copy.x += Number.isFinite(step) ? 2 * step + 50 : 200;
        shapes.push(copy); selected = shapes.length - 1; refresh('structure');
      }),
      action('Delete', () => { remember(); shapes.splice(selected, 1); selected = Math.min(selected, shapes.length - 1); refresh('structure'); }, 'danger')
    ]));
    form.append(...nodes);
  }
  form.addEventListener('submit', event => event.preventDefault());

  /* ------------------------------------------------------------------ *
   * Adding shapes: buttons and a sentence
   * ------------------------------------------------------------------ */
  function add(shape) {
    if (shapes.length >= MAX_SHAPES) { $('say-status').textContent = `A design can hold up to ${MAX_SHAPES} shapes.`; return false; }
    remember(); shapes.push(shape); selected = shapes.length - 1; refresh('structure'); return true;
  }
  $('add-row').append(...Object.keys(C.TYPES).map(type => action(C.TYPES[type], () => {
    const last = shapes[selected] || shapes[shapes.length - 1];
    const shape = C.newShape(type, last ? last.material : 'si');
    if (last && last.material === 'custom') { shape.customName = last.customName; shape.customN = last.customN; }
    if (add(shape)) $('say-status').textContent = `${C.TYPES[type]} added. Change its numbers below.`;
  })));

  const SHAPE_WORDS = [
    ['ellipsoid', ['ellipsoid']], ['ring', ['ring', 'annulus', 'tube']], ['cone', ['cone', 'tip']],
    ['prism', ['prism', 'triangle', 'triangular', 'pentagon', 'hexagon', 'hexagonal', 'polygon']],
    ['sphere', ['nanosphere', 'sphere', 'ball', 'bead']],
    ['cylinder', ['nanopillar', 'nanodisk', 'nanodisc', 'nanowire', 'nanorod', 'cylinder', 'pillar', 'disk', 'disc', 'wire', 'rod']],
    ['box', ['substrate', 'waveguide', 'rectangle', 'cuboid', 'block', 'brick', 'cube', 'slab', 'film', 'layer', 'box']]
  ];
  const LIBRARY = Object.fromEntries(C.MATERIALS.filter(m => m.lib).map(m => [m.lib, m.id]));
  const hasWord = (text, word) => new RegExp('(^|[^a-z0-9])' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![a-z0-9])').test(text);
  function addFromSentence(sentence) {
    let text = sentence.replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080)).replace(/[µμ]\s*m\b/g, 'um').toLowerCase();
    const type = (SHAPE_WORDS.find(entry => entry[1].some(word => hasWord(text, word))) || [])[0];
    if (!type) return 'I did not find a shape word. Try: sphere, cylinder, box, cone, ellipsoid, ring or prism.';
    const NUM = '(-?\\d+(?:\\.\\d+)?)', UNIT = '(nm|um|mm)?', toNm = (v, u, fallback) => Number(v) * ({ nm: 1, um: 1e3, mm: 1e6 }[u || fallback || 'nm']);
    const shape = C.newShape(type, 'si');
    // Position: "at (300, 0, 100) nm" or "at 300, 0 nm".
    const at = text.match(new RegExp('\\bat\\s*\\(?\\s*' + NUM + '\\s*' + UNIT + '\\s*,\\s*' + NUM + '\\s*' + UNIT + '(?:\\s*,\\s*' + NUM + '\\s*' + UNIT + ')?\\s*\\)?\\s*' + UNIT));
    let placedZ = false;
    if (at) {
      const last = at[7] || at[6] || at[4] || at[2];
      shape.x = toNm(at[1], at[2], last); shape.y = toNm(at[3], at[4], last);
      if (at[5] !== undefined) { shape.z = toNm(at[5], at[6], last); placedZ = true; }
      text = text.replace(at[0], ' ');
    }
    const wall = text.match(new RegExp('\\b(?:wall|width)\\s*(?:of|=|:)?\\s*' + NUM + '\\s*' + UNIT));
    if (wall && type === 'ring') { shape.width = toNm(wall[1], wall[2]); text = text.replace(wall[0], ' '); }
    const sides = text.match(/\b(\d+)\s*(?:sides|corners)\b/);
    if (type === 'prism') shape.sides = sides ? Number(sides[1]) : hasWord(text, 'hexagon') || hasWord(text, 'hexagonal') ? 6 : hasWord(text, 'pentagon') ? 5 : 3;
    // Sizes and material: reuse the sentence reader.
    const state = A ? A.interpret(text, null, {}).state : {};
    if (state.radius) shape.radius = state.radius;
    if (state.height && 'height' in shape) shape.height = state.height;
    if (type === 'box' || type === 'ellipsoid') { ['sx', 'sy', 'sz'].forEach(key => { if (state[key]) shape[key] = state[key]; }); if (state.height) shape.sz = state.height; }
    if (state.material && state.material.kind === 'library' && LIBRARY[state.material.id]) shape.material = LIBRARY[state.material.id];
    else if (state.material && state.material.kind === 'constant') { shape.material = 'custom'; shape.customName = 'material1'; shape.customN = state.material.n; }
    else if (hasWord(text, 'air')) shape.material = 'air';
    else if (A) {
      const known = A.materials.slice().sort((a, b) => b.words[0].length - a.words[0].length).find(m => !m.id && m.words.some(word => hasWord(text, word)));
      if (known) { shape.material = 'custom'; shape.customName = known.formula.replace(/[₀-₉]/g, c => String(c.charCodeAt(0) - 0x2080)).replace(/[^A-Za-z0-9_]/g, '_'); shape.customN = null; }
    }
    if (shape.type === 'ring' && !(shape.width < shape.radius)) shape.width = shape.radius / 4;
    if (!placedZ) shape.z = C.halfExtent(shape)[2];
    const ready = clean(shape);
    if (!ready) return 'Those sizes do not make a valid shape.';
    return add(ready) ? `${shapeTitle(ready)} added.` : $('say-status').textContent;
  }
  $('say-form').addEventListener('submit', event => {
    event.preventDefault();
    const input = $('say-input'), text = input.value.trim(); if (!text) return;
    const message = addFromSentence(text); $('say-status').textContent = message;
    if (/added\.$/.test(message)) input.value = '';
  });

  /* ------------------------------------------------------------------ *
   * Code panel
   * ------------------------------------------------------------------ */
  const codeArea = $('code-area'), codeStatus = $('code-status');
  function codeOptions() {
    const wavelength = Number($('index-wavelength').value) > 0 ? Number($('index-wavelength').value) : 633;
    return { wavelength, index: lib => { if (!materialsReady) return null; try { return Materials.get(lib, wavelength); } catch (error) { return null; } } };
  }
  function writeCode() {
    codeArea.value = tab === 'gds' ? C.toGds(shapes) : C.toMeep(shapes, codeOptions());
    codeStatus.textContent = ''; codeStatus.classList.remove('warning');
  }
  let codeTimer = 0, codeRemembered = false;
  codeArea.addEventListener('focus', () => { codeRemembered = false; });
  codeArea.addEventListener('input', () => {
    clearTimeout(codeTimer);
    codeTimer = setTimeout(() => {
      const text = codeArea.value, result = tab === 'gds' ? C.fromGds(text) : C.fromMeep(text);
      const read = result.shapes.map(clean).filter(Boolean).slice(0, MAX_SHAPES);
      const problems = [];
      if (result.skipped.length) problems.push(`Could not use line${result.skipped.length > 1 ? 's' : ''} ${result.skipped.slice(0, 8).join(', ')}${result.skipped.length > 8 ? '…' : ''}.`);
      if (read.length < result.shapes.length) problems.push(`${result.shapes.length - read.length} shape(s) had sizes that are not allowed.`);
      problems.push(...result.notes);
      if (!read.length && text.trim()) { codeStatus.textContent = ['No shapes found in this code yet.'].concat(problems).join(' '); codeStatus.classList.add('warning'); return; }
      if (!codeRemembered) { remember(); codeRemembered = true; }
      const countChanged = read.length !== shapes.length;
      shapes = read; selected = Math.min(selected, shapes.length - 1);
      refresh(countChanged ? 'code-structure' : 'code');
      codeStatus.textContent = [`Read ${read.length} shape${read.length === 1 ? '' : 's'}.`].concat(problems).join(' ');
      codeStatus.classList.toggle('warning', problems.length > 0);
    }, 350);
  });
  function setTab(next) {
    tab = next;
    $('tab-gds').setAttribute('aria-selected', String(tab === 'gds')); $('tab-meep').setAttribute('aria-selected', String(tab === 'meep'));
    $('index-label').hidden = tab !== 'meep';
    writeCode(); save();
  }
  $('tab-gds').addEventListener('click', () => setTab('gds'));
  $('tab-meep').addEventListener('click', () => setTab('meep'));
  $('index-wavelength').addEventListener('input', () => { if (tab === 'meep') writeCode(); });
  $('code-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(codeArea.value); codeStatus.textContent = 'Copied.'; }
    catch (error) { codeArea.select(); codeStatus.textContent = 'Press Ctrl+C (or ⌘C) to copy the selected code.'; }
    codeStatus.classList.remove('warning');
  });
  $('code-download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([codeArea.value], { type: 'text/x-python' })), a = document.createElement('a');
    a.href = url; a.download = tab === 'gds' ? 'elyvris_studio_layout.py' : 'elyvris_studio_meep.py'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  /* ------------------------------------------------------------------ *
   * Keeping everything in step
   * ------------------------------------------------------------------ */
  function refresh(source) {
    const scene = buildScene();
    if (view) view.setScene(scene, source === 'structure' || source === 'code-structure');
    $('stage-scale').textContent = `1 square = ${scene.grid >= 1000 ? scene.grid / 1000 + ' µm' : scene.grid + ' nm'}`;
    renderList();
    if (source !== 'form') renderForm();                       // do not rebuild the field being typed in
    if (source !== 'code' && source !== 'code-structure') writeCode();
    $('undo').disabled = !history.length;
    save();
  }

  /* ------------------------------------------------------------------ *
   * 3D view buttons
   * ------------------------------------------------------------------ */
  try {
    view = View ? View.create($('view3d'), $('view-labels'), {
      onPick: index => { if (index !== selected) { selected = index; refresh('select'); } },
      onMove: (index, x, y) => {
        if (!shapes[index]) return;
        if (!dragStarted) { remember(); dragStarted = true; }
        shapes[index].x = Math.round(x); shapes[index].y = Math.round(y); selected = index; refresh('drag');
      },
      onMoveEnd: () => { dragStarted = false; }
    }) : null;
  } catch (error) { view = null; }
  if (!view) { $('stage-fallback').hidden = false; $('view3d').hidden = true; document.querySelectorAll('.stage-top, .stage-bottom, .stage-scale').forEach(node => { node.hidden = true; }); }
  else {
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => view.view(button.dataset.view)));
    $('view-zoom-in').addEventListener('click', () => view.zoom(1 / 1.25));
    $('view-zoom-out').addEventListener('click', () => view.zoom(1.25));
    $('view-fit').addEventListener('click', () => view.fit());
    const setMode = mode => { view.setMode(mode); $('mode-orbit').setAttribute('aria-pressed', String(mode === 'orbit')); $('mode-move').setAttribute('aria-pressed', String(mode === 'move')); };
    $('mode-orbit').addEventListener('click', () => setMode('orbit'));
    $('mode-move').addEventListener('click', () => setMode('move'));
  }
  $('unit').addEventListener('change', () => { unit = $('unit').value; refresh('unit'); });

  /* ------------------------------------------------------------------ *
   * Examples
   * ------------------------------------------------------------------ */
  const make = (type, material, values) => clean(Object.assign(C.newShape(type, material), values));
  // A material the user defines in the code (Studio has no tabulated data for it): n is left empty on purpose.
  const own = (type, name, values) => clean(Object.assign(C.newShape(type, 'custom'), { customName: name, customN: null }, values));
  const range = (count, step) => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
  const EXAMPLES = {
    /* Simple: one TiO₂ film, 100 nm, on silicon, as in the third-harmonic measurements on the Research page.
       A film is a Fabry–Pérot resonator: its thickness sets which wavelengths build up inside. */
    film: () => [
      make('box', 'si', { sx: 2000, sy: 2000, sz: 500, z: -250 }),
      make('box', 'tio2', { sx: 2000, sy: 2000, sz: 100, z: 50 })],
    /* Six quarter-wave pairs for 370 nm: d = λ / (4n), TiO₂ (n ≈ 2.87) 32 nm, SiO₂ (n ≈ 1.47) 63 nm. */
    bragg: () => [make('box', 'sio2', { sx: 2000, sy: 2000, sz: 500, z: -250 })].concat(
      Array.from({ length: 6 }).flatMap((_, i) => [
        make('box', 'tio2', { sx: 2000, sy: 2000, sz: 32, z: i * 95 + 16 }),
        make('box', 'sio2', { sx: 2000, sy: 2000, sz: 63, z: i * 95 + 32 + 31.5 })])),
    /* Research, Part IV: TiO₂ rectangles 190 × 160 × 100 nm on a 600 nm fused silica membrane, period 733 nm (3 × 3 cells). */
    anapole: () => [make('box', 'sio2', { sx: 2199, sy: 2199, sz: 600, z: -300 })].concat(
      range(3, 733).flatMap(x => range(3, 733).map(y => make('box', 'tio2', { sx: 190, sy: 160, sz: 100, x, y, z: 50 })))),
    /* Research, Part I: a 30 nm silver film with MoS₂ lines above and below (period 580 nm, width 174 nm, height 150 nm).
       Silver and MoS₂ are absorbing and anisotropic; define them yourself in the Meep code. */
    msc: () => [own('box', 'Ag', { sx: 2900, sy: 2000, sz: 30, z: 0 })].concat(
      range(5, 580).flatMap(x => [
        own('box', 'MoS2', { sx: 174, sy: 2000, sz: 150, x, z: 15 + 75 }),
        own('box', 'MoS2', { sx: 174, sy: 2000, sz: 150, x, z: -15 - 75 })])),
    /* Two silicon strip waveguides (450 × 220 nm) 200 nm apart on oxide. */
    coupler: () => [
      make('box', 'sio2', { sx: 6000, sy: 3000, sz: 1000, z: -500 }),
      make('box', 'si', { sx: 6000, sy: 450, sz: 220, y: 325, z: 110 }),
      make('box', 'si', { sx: 6000, sy: 450, sz: 220, y: -325, z: 110 })],
    /* A ring between two bus waveguides: light near resonance leaves through the second (drop) waveguide. */
    adddrop: () => [
      make('box', 'sio2', { sx: 4600, sy: 5200, sz: 500, z: -250 }),
      make('ring', 'si', { radius: 1500, width: 450, height: 220, z: 110 }),
      make('box', 'si', { sx: 4600, sy: 450, sz: 220, y: -1925, z: 110 }),
      make('box', 'si', { sx: 4600, sy: 450, sz: 220, y: 1925, z: 110 })],
    /* A 220 nm silicon slab with a triangular lattice of air holes (lattice 420 nm, radius 125 nm).
       In Meep, later objects replace earlier ones, so the holes come after the slab. */
    phc: () => {
      const a = 420, rowH = a * Math.sqrt(3) / 2, holes = [];
      for (let row = -3; row <= 3; row++) {
        for (let col = -3; col <= 3; col++) holes.push(make('cylinder', 'air', { radius: 125, height: 220, x: col * a + (row % 2 ? a / 2 : 0), y: row * rowH, z: 110 }));
      }
      return [make('box', 'si', { sx: 3400, sy: 3000, sz: 220, z: 110 })].concat(holes);
    },

    disk: () => [
      make('box', 'sio2', { sx: 1200, sy: 1200, sz: 300, z: -150 }),
      make('cylinder', 'tio2', { radius: 150, height: 150, z: 75 })],
    dimer: () => [
      make('sphere', 'si', { radius: 90, x: -100, z: 90 }),
      make('sphere', 'si', { radius: 90, x: 100, z: 90 })],
    ring: () => [
      make('box', 'sio2', { sx: 4600, sy: 4600, sz: 500, y: -250, z: -250 }),
      make('ring', 'si', { radius: 1500, width: 450, height: 220, z: 110 }),
      make('box', 'si', { sx: 4600, sy: 450, sz: 220, y: -1925, z: 110 })],
    pillars: () => [make('box', 'sio2', { sx: 1800, sy: 1800, sz: 300, z: -150 })].concat(
      [-500, 0, 500].flatMap(x => [-500, 0, 500].map(y => make('cylinder', 'si', { radius: 100, height: 300, x, y, z: 150 })))),
    bowtie: () => [
      make('box', 'sio2', { sx: 700, sy: 500, sz: 150, z: -75 }),
      make('prism', 'au', { height: 40, x: -115, z: 20, sides: 3, radius: 152, points: [[100, 0], [-100, 115], [-100, -115]] }),
      make('prism', 'au', { height: 40, x: 115, z: 20, sides: 3, radius: 152, points: [[-100, 0], [100, -115], [100, 115]] })],
    empty: () => []
  };
  $('example').addEventListener('change', () => {
    const name = $('example').value; if (!EXAMPLES[name]) return;
    remember(); shapes = EXAMPLES[name](); selected = shapes.length ? shapes.length - 1 : -1;
    refresh('structure'); $('example').value = ''; $('say-status').textContent = '';
  });

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (stored && stored.design) {
      const state = thaw(stored.design); shapes = state.shapes; selected = Math.min(state.selected, shapes.length - 1);
      if (stored.unit === 'um') { unit = 'um'; $('unit').value = 'um'; }
      if (stored.tab === 'meep') tab = 'meep';
    }
  } catch (error) { shapes = []; }
  if (!shapes.length) { shapes = EXAMPLES.disk(); selected = 1; }
  window.ElyvrisStudio = { shapes: () => JSON.parse(freeze()).shapes, addFromSentence, load: next => { shapes = next.map(clean).filter(Boolean); selected = shapes.length - 1; refresh('structure'); } };
  setTab(tab);
  refresh('structure');
  if (Materials) Materials.load().then(() => { materialsReady = true; if (tab === 'meep' && document.activeElement !== codeArea) writeCode(); }).catch(() => { /* Meep code then asks the user to define materials */ });
})();

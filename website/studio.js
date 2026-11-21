(() => {
  'use strict';
  const C = window.ElyvrisStudioCode, A = window.ElyvrisAssistant, Materials = window.OpticalMaterials, View = window.ElyvrisView3D;
  const $ = id => document.getElementById(id);
  if (!$('studio') || !C) return;

  // STORE: the browser save used before the project format (read once, see Start).
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

  let shapes = [], selected = -1, unit = 'nm', tab = 'gds', history = [], view = null, materialsReady = false, dragStarted = false, storedCode = null;

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
    // A material kept as the user wrote it (see materialKey in studio-code.js).
    if (out.material === 'custom' && typeof shape.customCode === 'string' && shape.customCode.trim() && shape.customCode.length <= 4000) out.customCode = shape.customCode;
    if (out.material !== 'air' && typeof shape.meepLibrary === 'string' && /^[A-Za-z_]\w{0,39}$/.test(shape.meepLibrary)) out.meepLibrary = shape.meepLibrary;
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
    // A name for figures only; it never goes into the code.
    if (typeof shape.label === 'string' && shape.label.trim()) out.label = shape.label.trim().slice(0, 40);
    return out;
  }

  const ownCode = () => codeOwner === 'user' && codeArea.value.length <= 200000 ? { text: codeArea.value, tab } : null;
  // The physical settings belong to the design: they change the numbers in the Meep code.
  const settings = () => ({ wavelength: codeOptions().wavelength, scale: codeOptions().scale });
  const freeze = () => JSON.stringify({ shapes, selected, code: ownCode(), settings: settings() }, (key, value) => value === Infinity ? 'inf' : value);
  const inRange = (value, low, high) => Number.isFinite(value) && value >= low && value <= high;
  function thaw(text) {
    const data = JSON.parse(text), code = data.code && typeof data.code.text === 'string' && (data.code.tab === 'gds' || data.code.tab === 'meep') ? { text: data.code.text.slice(0, 200000), tab: data.code.tab } : null;
    // Designs saved before these settings existed used 633 nm and 1 Meep unit = 1 µm.
    const given = data.settings || {}, wavelength = Number(given.wavelength), scale = Number(given.scale);
    return {
      shapes: (data.shapes || []).map(clean).filter(Boolean).slice(0, MAX_SHAPES), selected: Number.isInteger(data.selected) ? data.selected : -1, code,
      settings: { wavelength: inRange(wavelength, 1, 1e7) ? wavelength : 633, scale: inRange(scale, 1e-6, 1e6) ? scale : 1 }
    };
  }
  function applySettings(given) {
    $('index-wavelength').value = String(given.wavelength); $('meep-scale').value = String(given.scale);
    shownSettings = { wavelength: given.wavelength, scale: given.scale }; settingsRemembered = false;
  }
  let shownSettings = { wavelength: 633, scale: 1 }, settingsRemembered = false;
  function remember() { const now = freeze(); if (history[history.length - 1] !== now) { history.push(now); if (history.length > 40) history.shift(); } }
  function save() { try { localStorage.setItem(PROJECT_KEY, JSON.stringify(projectData())); } catch (error) { /* storage may be unavailable */ } }

  const PROJECT = 'elyvris-studio-project', PROJECT_VERSION = 1, PROJECT_KEY = 'elyvris-studio-project-v1';
  const ABOUT = 'Elyvris Studio project. Shape lengths are in nanometres ("inf" is endless) and the shapes are in geometry order. ' +
    'code is the text you wrote, keptCode the text kept under "Bring back my code". diagnostics records what the preview drew when the project was saved; it is worked out again when the project is opened.';
  function projectData() {
    const design = JSON.parse(freeze()), own = ownCode(), s = settings();
    return {
      format: PROJECT, version: PROJECT_VERSION, saved: new Date().toISOString(), about: ABOUT,
      settings: { wavelength_nm: s.wavelength, meep_unit_um: s.scale, display_unit: unit, language: tab },
      selected: design.selected, shapes: design.shapes,
      code: own ? { language: own.tab, text: own.text } : null,
      keptCode: lostCode ? { language: lostCode.tab, text: lostCode.text } : null,
      diagnostics: own && coverage ? { state: STATES[stateOf(coverage)][0], outOfDate: coverage.stale || null, notDrawn: coverage.missing, approximated: coverage.approx, notShown: coverage.outside, notes: coverage.notes } : null
    };
  }
  const asCode = c => c && typeof c.text === 'string' && c.text.trim() && (c.language === 'gds' || c.language === 'meep') ? { text: c.text.slice(0, 200000), tab: c.language } : null;
  function readProject(data) {
    if (!data || data.format !== PROJECT) throw new Error('this is not an Elyvris Studio project file.');
    const version = Number(data.version);
    if (!(version >= 1)) throw new Error('the project file has no valid version number.');
    if (Math.floor(version) > PROJECT_VERSION) throw new Error(`it was saved by a newer Studio (project format ${data.version}); this page reads format ${PROJECT_VERSION}. Reload the page for the newest Studio.`);
    const left = [], given = data.settings || {}, list = Array.isArray(data.shapes) ? data.shapes : [], shapesOut = [];
    if (!Array.isArray(data.shapes)) left.push('The file has no list of shapes.');
    list.forEach((shape, i) => {
      const ok = clean(shape), kind = shape && typeof shape.type === 'string' ? shape.type.slice(0, 20) : 'no type';
      if (!ok) left.push(`Shape ${i + 1} (${kind}): an unknown type or a size that is not allowed.`);
      else if (shapesOut.length >= MAX_SHAPES) left.push(`Shape ${i + 1}: beyond the limit of ${MAX_SHAPES} shapes.`);
      else shapesOut.push(ok);
    });
    const w = Number(given.wavelength_nm), s = Number(given.meep_unit_um);
    if (given.wavelength_nm !== undefined && !inRange(w, 1, 1e7)) left.push('The wavelength is not between 1 nm and 10 mm: 633 nm is used.');
    if (given.meep_unit_um !== undefined && !inRange(s, 1e-6, 1e6)) left.push('The Meep length unit is not usable: 1 µm is used.');
    const code = asCode(data.code), kept = asCode(data.keptCode);
    if (data.code && !code) left.push('The code in the file could not be used.');
    const tabOut = code ? code.tab : given.language === 'meep' ? 'meep' : 'gds';
    return {
      left,
      project: {
        shapes: shapesOut, selected: Math.min(Number.isInteger(data.selected) ? data.selected : shapesOut.length - 1, shapesOut.length - 1),
        settings: { wavelength: inRange(w, 1, 1e7) ? w : 633, scale: inRange(s, 1e-6, 1e6) ? s : 1 },
        unit: given.display_unit === 'um' ? 'um' : 'nm', tab: tabOut, code, kept
      }
    };
  }
  function fromOldSave(stored) {
    const state = thaw(stored.design);
    return { shapes: state.shapes, selected: Math.min(state.selected, state.shapes.length - 1), settings: state.settings, unit: stored.unit === 'um' ? 'um' : 'nm', tab: stored.tab === 'meep' ? 'meep' : 'gds', code: state.code, kept: null };
  }
  function projectStatus(text, warning) {
    const node = $('project-status'); if (!node) return;
    node.hidden = !text; node.textContent = text; node.classList.toggle('warning', !!warning);
  }
  /* Replace the design with an opened project. Undo returns to the design before. */
  function openProject(p) {
    remember();
    shapes = p.shapes; selected = p.selected; applySettings(p.settings);
    unit = p.unit; $('unit').value = unit;
    codeOwner = 'studio'; lostCode = p.kept; keptCoverage = null;
    showTab(p.tab);
    if (p.code) putBackCode(p.code.text, p.selected); else refresh('structure');
  }
  function openProjectText(name, text) {
    let result;
    try { result = readProject(JSON.parse(text)); }
    catch (error) { projectStatus(`Could not open ${name}: ${error instanceof SyntaxError ? 'it is not valid JSON text.' : error.message}`, true); return false; }
    openProject(result.project); endTour();
    const n = shapes.length;
    projectStatus(`Opened ${name}: ${n} shape${n === 1 ? '' : 's'}${result.project.code ? ' and your own code' : ''}.` +
      (result.left.length ? ` Left out: ${result.left.slice(0, 5).join(' ')}${result.left.length > 5 ? ` And ${result.left.length - 5} more.` : ''}` : '') +
      ' Undo returns to the design you had before.', result.left.length > 0);
    return true;
  }
  $('project-save').addEventListener('click', () => {
    const data = projectData(), name = `elyvris-studio-${data.saved.slice(0, 10)}.elyvris.json`;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1) + '\n'], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    projectStatus(`Saved ${name}: ${shapes.length} shape${shapes.length === 1 ? '' : 's'}, the wavelength (${data.settings.wavelength_nm} nm), the Meep length unit (${data.settings.meep_unit_um} µm)${data.code ? ' and your own code' : ''}. Open project reads it back, in any browser.`);
  });
  $('project-open').addEventListener('click', () => $('project-file').click());
  $('project-file').addEventListener('change', async () => {
    const file = $('project-file').files[0]; $('project-file').value = '';
    if (!file) return;
    if (file.size > 5e6) { projectStatus(`Could not open ${file.name}: it is larger than 5 MB, so it is not a Studio project.`, true); return; }
    openProjectText(file.name, await file.text());
  });
  $('undo').addEventListener('click', () => {
    let previous = history.pop();
    if (previous === freeze()) previous = history.pop();
    if (!previous) return;
    const state = thaw(previous); shapes = state.shapes; selected = Math.min(state.selected, shapes.length - 1);
    applySettings(state.settings); save();
    if (state.code && state.code.tab === tab) { lostCode = null; putBackCode(state.code.text, state.selected); } else refresh('structure');
  });

  function buildScene() {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    shapes.forEach(s => {
      const half = C.halfExtent(s), centre = [s.x, s.y, s.z];
      for (let k = 0; k < 3; k++) { const e = Number.isFinite(half[k]) ? half[k] : 0; min[k] = Math.min(min[k], centre[k] - e); max[k] = Math.max(max[k], centre[k] + e); }
    });
    if (!shapes.length) { min[0] = min[1] = -200; min[2] = 0; max[0] = max[1] = max[2] = 200; }
    const reach = 20 * niceStep(Math.max(60, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2) / 3.5);   // the edge of the grid of the shapes alone
    const drawn = shownSetup(), cell = drawn && drawn.cell;
    if (cell) for (let k = 0; k < 3; k++) {
      const lo = drawn.center[k] - cell.size[k] / 2, hi = drawn.center[k] + cell.size[k] / 2;
      min[k] = shapes.length ? Math.min(min[k], lo) : lo; max[k] = shapes.length ? Math.max(max[k], hi) : hi;
    }
    const center = [0, 1, 2].map(k => (min[k] + max[k]) / 2);
    const radius = Math.max(60, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
    const grid = niceStep(radius / 3.5);
    const clipped = k => !!cell && cell.size[k] > 0;
    const endlessSize = k => clipped(k) ? cell.size[k] : cell && drawn.dimensions === 2 && k === 2 ? grid / 4 : reach;
    const AXIS = { x: 0, y: 1, z: 2 };
    const parts = shapes.map((s, i) => {
      const extent = C.halfExtent(s), endless = extent.map(v => !Number.isFinite(v));
      const half = extent.map((v, k) => Number.isFinite(v) ? v : endlessSize(k) / 2);
      const at = [s.x, s.y, s.z].map((v, k) => endless[k] && clipped(k) ? drawn.center[k] : v);
      const along = AXIS[s.axis] === undefined ? 2 : AXIS[s.axis];      // the world direction of a height
      const f = (v, k) => Number.isFinite(v) ? v : endlessSize(k);
      const part = { at, half, endless, color: C.materialColor(s), selected: i === selected, axis: 'z' };
      if (s.type === 'sphere') { part.mesh = 'sphere'; part.size = [2 * s.radius, 2 * s.radius, 2 * s.radius]; }
      else if (s.type === 'cylinder') { part.mesh = 'cylinder'; part.size = [2 * s.radius, 2 * s.radius, f(s.height, along)]; part.axis = s.axis; }
      else if (s.type === 'cone') { const widest = Math.max(s.radius, s.radius2 || 0); part.mesh = 'cone'; part.bottom = s.radius / widest; part.top = (s.radius2 || 0) / widest; part.size = [2 * widest, 2 * widest, f(s.height, along)]; part.axis = s.axis; }
      else if (s.type === 'box') { part.mesh = 'box'; part.size = [f(s.sx, 0), f(s.sy, 1), f(s.sz, 2)]; }
      else if (s.type === 'ellipsoid') { part.mesh = 'sphere'; part.size = [f(s.sx, 0), f(s.sy, 1), f(s.sz, 2)]; }
      else if (s.type === 'ring') { part.mesh = 'ring'; part.inner = (s.radius - s.width) / s.radius; part.size = [2 * s.radius, 2 * s.radius, f(s.height, 2)]; }
      else { part.mesh = 'prism'; part.points = C.prismPoints(s); part.size = [1, 1, f(s.height, 2)]; }
      return part;
    });
    return { parts, center, radius, grid, setup: cell ? setupScene(drawn, grid) : null };
  }
  let setup = null, setupOn = true;
  const SETUP_COLORS = { cell: '#E3B45A', PML: '#B48CE6', Absorber: '#8FB3E0', source: '#F07C5A', monitor: '#6CC08B' };
  const activeSetup = () => codeOwner === 'user' && tab === 'meep' && setup && (setup.cell || setup.layers.length || setup.sources.length || setup.monitors.length) ? setup : null;
  const shownSetup = () => setupOn ? activeSetup() : null;
  const lengthText = nm => `${show(nm)} ${unitLabel()}`;
  const AXES = 'xyz';
  // A direction as text: '+x', '−y' along an axis, or '(0.71, 0.71, 0)' otherwise.
  function dirText(d) {
    const k = d.findIndex(v => Math.abs(v) > 0.999);
    return k >= 0 ? `${d[k] > 0 ? '+' : '−'}${AXES[k]}` : `(${d.map(v => Number(v.toFixed(2))).join(', ')})`;
  }
  const isPoint = size => size.every(v => v === 0);
  const endOf = (center, size, sign) => { const k = size.findIndex(v => v > 0); return k < 0 ? center : center.map((v, i) => i === k ? v + sign * size[k] / 2 : v); };
  function setupScene(s, grid) {
    const size = s.cell.size, c = s.center, boxes = [{ center: c, size, color: SETUP_COLORS.cell }], labels = [], dots = [], arrows = [];
    labels.push({ text: `Cell ${size.slice(0, s.dimensions === 2 ? 2 : 3).map(show).join(' × ')} ${unitLabel()}${s.dimensions === 2 ? ' (2D)' : ''}`,
      at: [c[0] - size[0] / 2, c[1] + size[1] / 2, c[2] + size[2] / 2] });
    const named = {};
    C.layerSlabs(s).forEach(slab => {
      const layer = s.layers[slab.layer];
      boxes.push({ center: slab.center, size: slab.size, color: SETUP_COLORS[layer.kind] });
      if (!named[slab.layer]) { named[slab.layer] = true; labels.push({ text: `${layer.kind} ${lengthText(layer.thickness)}`, at: slab.center }); }
    });
    (s.sources || []).forEach(src => {
      const color = SETUP_COLORS.source;
      if (isPoint(src.size)) dots.push({ center: src.center, size: grid * 0.12, color });
      else boxes.push({ center: src.center, size: src.size, color, front: true });
      if (src.polarization) arrows.push({ from: src.center, dir: src.polarization, length: grid * 0.8, both: true, color });
      if (src.travel) arrows.push({ from: src.center, dir: src.travel, length: grid * 1.2, both: false, color });
      const what = src.kind === 'Source' ? `${src.component} current, both sides` : src.kind === 'EigenModeSource' ? 'mode source' : 'beam';
      labels.push({ text: src.travel ? `${what} → ${dirText(src.travel)}` : what, at: endOf(src.center, src.size, -1) });
    });
    (s.monitors || []).forEach(m => {
      const color = SETUP_COLORS.monitor;
      boxes.push({ center: m.center, size: m.size, color, front: true });
      if (m.normal) arrows.push({ from: endOf(m.center, m.size.map(v => v * 0.6), 1), dir: m.normal, length: grid * 0.7, both: false, color });
      labels.push({ text: m.normal ? `+ flux ${dirText(m.normal)}` : 'flux (no normal)', at: endOf(m.center, m.size, 1) });
    });
    return { boxes, dots, arrows, labels };
  }
  const pointText = (v, dimensions) => `(${v.slice(0, dimensions === 2 ? 2 : 3).map(show).join(', ')})`;
  const SOURCE_NAMES = { Source: 'Current source', EigenModeSource: 'Mode source (EigenModeSource)', GaussianBeamSource: 'Gaussian beam' };
  function sourceText(src, dimensions) {
    const where = isPoint(src.size) ? `point at ${pointText(src.center, dimensions)}` : `${src.size.slice(0, dimensions === 2 ? 2 : 3).map(show).join(' × ')} ${unitLabel()} at ${pointText(src.center, dimensions)}`;
    const head = `${SOURCE_NAMES[src.kind]}, ${where}`;
    if (src.note === 'both') return `${head}: a current along ${src.component[1]} (${src.component}). It radiates to both sides, so it has no travel arrow (measured in Meep).`;
    if (src.note === 'mode') return `${head}: launches its mode toward ${dirText(src.travel)} (measured in Meep).`;
    if (src.note === 'oblique') return `${head}: eig_kpoint is oblique, so no travel arrow is drawn.`;
    if (src.note === 'no-normal') return `${head}: no launch direction found (give direction= or a size that is 0 in one direction), so no travel arrow is drawn.`;
    if (src.note === 'beam') return `${head}: travels along ${dirText(src.travel)} (beam_kdir)${src.polarization ? `, field along ${dirText(src.polarization)} (beam_E0)` : ''}.`;
    return `${head}: no beam_kdir, so no travel arrow is drawn.`;
  }
  function monitorText(m, dimensions) {
    const head = `${m.kind === 'mode' ? 'Mode monitor' : 'Flux plane'} ${m.size.slice(0, dimensions === 2 ? 2 : 3).map(show).join(' × ')} ${unitLabel()} at ${pointText(m.center, dimensions)}`;
    if (!m.normal) return `${head}: no single normal (its size is 0 in no direction, or in several), so no "+ flux" arrow is drawn.`;
    return `${head}: positive flux = power crossing toward ${dirText(m.normal)}${m.weight < 0 ? ' (the weight is negative, which turns the sign around)' : ''}. The arrow is a sign convention, not the path of the light.`;
  }
  function layerText(layer, dimensions) {
    const dirs = layer.direction === -1 ? (dimensions === 2 ? 'x and y' : dimensions === 1 ? 'z' : 'x, y and z') : AXES[layer.direction];
    const where = layer.side === -1 ? `both ${dirs} walls` : `the ${layer.side === 1 ? 'low (−)' : 'high (+)'} ${dirs} wall${layer.direction === -1 ? 's' : ''}`;
    return `${layer.kind} ${lengthText(layer.thickness)} thick, inside the cell on ${where}`;
  }
  /* The lines of the Preview box about the setup: [{ text, line }]. */
  function setupItems(s) {
    const items = [];
    if (s.cell) items.push({ text: `Cell ${s.cell.size.map(show).join(' × ')} ${unitLabel()}${s.center.some(v => v) ? `, centred at (${s.center.map(show).join(', ')})` : ''}: ${s.dimensions === 2 ? '2D (z size 0). Meep uses only the cross-section of the shapes in the plane of the cell' : s.dimensions === 1 ? '1D' : '3D'}.`, line: s.cell.line });
    s.layers.forEach(layer => items.push({ text: `${layerText(layer, s.dimensions)}. A visual gap to the structure is not a convergence test.`, line: layer.line }));
    if (s.walls) items.push({ text: s.walls === 'periodic' ? `Outer walls: Bloch-periodic (k_point = (${s.kPoint.join(', ')})).` : 'Outer walls: metal, Meep\'s default when there is no k_point.', line: s.line });
    if (s.resolution) items.push({ text: `Resolution ${s.resolution} pixels per Meep unit: one pixel is ${lengthText(1000 * codeOptions().scale / s.resolution)}.`, line: s.line });
    (s.sources || []).forEach(src => items.push({ text: sourceText(src, s.dimensions), line: src.line }));
    (s.monitors || []).forEach(m => items.push({ text: monitorText(m, s.dimensions), line: m.line }));
    return items;
  }
  /* Select a line of the code box and bring it into view. */
  function goToLine(line) {
    const lines = codeArea.value.split('\n'); let pos = 0;
    for (let i = 0; i < line - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    codeArea.focus({ preventScroll: true }); codeArea.setSelectionRange(pos, pos + (lines[line - 1] || '').length);
    const lineHeight = parseFloat(getComputedStyle(codeArea).lineHeight) || 20;
    codeArea.scrollTop = Math.max(0, (line - 3) * lineHeight);
    codeArea.scrollIntoView({ block: 'nearest' });
  }

  /* The sizes that describe a shape, chosen by its type: round shapes by radius, boxes by edge lengths. */
  function sizeText(s) {
    const u = unitLabel(), v = nm => nm === Infinity ? '∞' : show(nm), len = nm => nm === Infinity ? '∞' : `${v(nm)} ${u}`;
    const along = (s.type === 'cylinder' || s.type === 'cone') && s.axis && s.axis !== 'z' ? ` · along ${s.axis}` : '';
    switch (s.type) {
      case 'sphere': return `r = ${len(s.radius)}`;
      case 'cylinder': return `r = ${len(s.radius)} · h = ${len(s.height)}${along}`;
      case 'cone': return `r = ${v(s.radius)} → ${len(s.radius2 || 0)} · h = ${len(s.height)}${along}`;
      case 'box': return `${v(s.sx)} × ${v(s.sy)} × ${len(s.sz)}`;
      case 'ellipsoid': return `axes ${v(s.sx)} × ${v(s.sy)} × ${len(s.sz)}`;
      case 'ring': return `R = ${len(s.radius)} · w = ${len(s.width)} · h = ${len(s.height)}`;
      case 'prism': return s.points ? `${s.points.length} corners · h = ${len(s.height)}` : `${s.sides} sides · R = ${len(s.radius)} · h = ${len(s.height)}`;
      default: return '';
    }
  }
  /* One label per kind of shape: identical copies (same name, type, material and sizes, as in a photonic
     crystal) share one label with "× N". Unnamed shapes are called by their type, numbered when a type repeats. */
  function figureMarks() {
    const groups = [];
    shapes.forEach(shape => {
      const detail = sizeText(shape), key = [shape.label || '', shape.type, C.materialLabel(shape), detail].join('|');
      const group = groups.find(g => g.key === key);
      if (group) group.members.push(shape); else groups.push({ key, detail, members: [shape] });
    });
    const unnamed = {};
    groups.forEach(g => { if (!g.members[0].label) unnamed[g.members[0].type] = (unnamed[g.members[0].type] || 0) + 1; });
    const seen = {};
    return groups.map(g => {
      const s = g.members[0], type = C.TYPES[s.type];
      let title = s.label;
      if (!title) { seen[s.type] = (seen[s.type] || 0) + 1; title = unnamed[s.type] > 1 ? `${type} ${seen[s.type]}` : type; }
      if (g.members.length > 1) title += ` × ${g.members.length}`;
      const h = C.halfExtent(s), endless = h.map(x => !Number.isFinite(x));
      const top = endless[2] ? s.z : s.z + h[2];
      // The 8 corners of each copy's bounding box: the labels of other shapes keep clear of them.
      const corners = endless.some(Boolean) ? [] : g.members.map(m => [-1, 1].flatMap(a => [-1, 1].flatMap(b => [-1, 1].map(c => [m.x + a * h[0], m.y + b * h[1], m.z + c * h[2]]))));
      // Places the line may start from: the middle of the top, then points out toward the top's edges.
      const anchors = [[s.x, s.y, top]];
      if (!endless[0] && !endless[1]) [0.6, 0.85].forEach(f => [[f, 0], [-f, 0], [0, f], [0, -f], [f, f], [-f, f], [f, -f], [-f, -f]].forEach(([a, b]) => anchors.push([s.x + a * h[0], s.y + b * h[1], top])));
      return { title, detail: g.detail, anchors, corners };
    });
  }

  const list = $('shape-list'), form = $('shape-form');
  function shapeTitle(shape) { return `${C.TYPES[shape.type]} · ${C.materialLabel(shape)}`; }
  function renderList() {
    const hadFocus = list.contains(document.activeElement);
    $('object-count').textContent = String(shapes.length);
    list.replaceChildren(...shapes.map((shape, index) => {
      const item = document.createElement('li'), button = document.createElement('button');
      const number = document.createElement('span'), material = document.createElement('span'), dot = document.createElement('i');
      button.type = 'button'; button.setAttribute('aria-pressed', String(index === selected));
      number.className = 'object-number'; number.textContent = String(index + 1).padStart(2, '0');
      material.className = 'object-material'; material.textContent = C.materialLabel(shape);
      dot.style.background = C.materialColor(shape); dot.setAttribute('aria-hidden', 'true');
      material.prepend(dot);
      button.append(number, shape.label || C.TYPES[shape.type], material);
      button.addEventListener('click', () => { selected = index; refresh('select'); });
      item.append(button); return item;
    }));
    if (!shapes.length) { const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = 'No shapes yet. Add one above.'; list.append(empty); }
    if (hadFocus) list.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  }
  function field(labelText, value, apply, options) {
    options = options || {};
    const label = document.createElement('label'), input = document.createElement('input');
    label.className = 'field'; label.append(labelText);
    input.type = 'text'; input.inputMode = options.text ? 'text' : 'decimal'; input.value = value; input.autocomplete = 'off';
    input.addEventListener('focus', remember);
    input.addEventListener('input', () => { const ok = apply(input.value); input.setAttribute('aria-invalid', String(!ok)); if (ok && !options.inPlace) refresh('form'); });
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
      if (shapes.length) {
        const hint = document.createElement('p'); hint.className = 'form-hint';
        hint.textContent = 'Select a shape in the list or click it in the 3D view.'; form.append(hint);
      }
      return;
    }
    const s = shapes[selected], u = unitLabel(), nodes = [];
    const heading = document.createElement('h3');
    heading.className = 'inspector-label';
    heading.textContent = `${C.TYPES[s.type]} properties`;
    nodes.push(heading);
    const materialField = chooser('Material', C.MATERIALS.map(m => [m.id, m.label]), s.material, value => {
      s.material = value; delete s.customCode; delete s.meepLibrary;   // a new choice replaces the material kept from code
      if (value === 'custom') { s.customName = s.customName || 'material1'; s.customN = s.customN || 2; } else { delete s.customName; delete s.customN; }
    });
    if (s.type === 'cylinder' || s.type === 'cone') {
      const axisField = chooser('Axis along', [['z', 'z (standing)'], ['x', 'x (lying)'], ['y', 'y (lying)']], s.axis || 'z', value => { s.axis = value; });
      nodes.push(row('pair', [materialField, axisField]));
    } else {
      nodes.push(materialField);
    }
    if (s.material === 'custom') {
      nodes.push(row('pair', [
        field('Name', s.customName || '', text => { const name = text.trim(); if (!/^[A-Za-z_][A-Za-z0-9_]{0,39}$/.test(name)) return false; s.customName = name; return true; }, { text: true }),
        // Typing an index replaces a definition copied from code with that one constant index.
        field('Index n', s.customN === null || s.customN === undefined ? '' : s.customN, text => { if (text.trim() === '') { s.customN = null; return true; } const n = Number(text); if (!(n > 0 && n <= 20)) return false; s.customN = n; delete s.customCode; return true; })
      ]));
    }
    // Changing the name only redraws the list: the code and the 3D view do not use it.
    nodes.push(field('Name in figures (optional)', s.label || '', text => {
      const name = text.trim(); if (name.length > 40) return false;
      if (name) s.label = name; else delete s.label;
      renderList(); save(); return true;
    }, { text: true, inPlace: true }));
    if (s.customCode || s.meepLibrary) {
      const kept = document.createElement('p'); kept.className = 'form-hint';
      kept.textContent = s.meepLibrary
        ? `From Meep's material library (meep.materials.${s.meepLibrary}): the code keeps Meep's own model.${s.material === 'custom' ? '' : ' The colour comes from the Studio\'s data, for the 3D view only.'}`
        : 'Defined in your code by more than one constant index: the code keeps your definition unchanged. Typing an index replaces it.';
      nodes.push(kept);
      // A library model used outside the wavelengths it was fitted for.
      const outside = s.meepLibrary ? C.meepRangeWarning(s.meepLibrary, codeOptions().wavelength) : '';
      if (outside) { const warn = document.createElement('p'); warn.className = 'form-hint form-warning'; warn.textContent = outside; nodes.push(warn); }
    }
    // A prism whose outline came from code keeps that outline: only its height is edited here.
    const sizeFields = s.type === 'prism' && s.points ? [['height', 'Height']] : FIELDS[s.type];
    if (s.type === 'prism' && s.points) { const note = document.createElement('p'); note.className = 'form-hint'; note.textContent = `Outline with ${s.points.length} corners. Edit the corners in the code box.`; nodes.push(note); }
    const own = inPlace(), lengthField = (key, labelText, apply) => {
      if (!own) return field(labelText, show(s[key]), apply);
      const where = (shapeOrigins[selected] || {})[key];
      if (!where) { const label = field(labelText, show(s[key]), () => false), input = label.querySelector('input'); input.readOnly = true; label.classList.add('computed'); input.title = 'This number comes from a formula in your code. Change it in the code.'; computed = true; return label; }
      const label = field(labelText, show(s[key]), text => { const v = read(text); return apply(text, true) && editInPlace(key, v); }, { inPlace: true });
      if (where.via) label.querySelector('input').title = `Changes the variable ${where.via} on line ${where.line} of your code.`;
      return label;
    };
    let computed = false;
    nodes.push(row(sizeFields.length === 3 ? 'trio' : sizeFields.length === 2 ? 'pair' : 'single', sizeFields.map(([key, name]) => {
      if (key === 'sides') { const label = field(name, s.points ? s.points.length : s.sides, text => { const n = Number(text); if (own || !Number.isInteger(n) || n < 3 || n > 64) return false; s.sides = n; delete s.points; return true; }); if (own) { label.querySelector('input').readOnly = true; label.classList.add('computed'); } return label; }
      return lengthField(key, `${name} (${u})`, (text, checkOnly) => {
        const v = read(text), infinite = v === Infinity && CAN_BE_INFINITE.includes(key);
        if (!(infinite || (v > 0 && v <= MAX_SIZE) || (key === 'radius2' && v === 0))) return false;
        if (s.type === 'ring' && ((key === 'width' && !(v < s.radius)) || (key === 'radius' && !(v > s.width)))) return false;
        if (checkOnly) return true;
        s[key] = v; if (s.type === 'prism' && key === 'radius') delete s.points;
        return true;
      });
    })));
    nodes.push(row('trio', ['x', 'y', 'z'].map(key => lengthField(key, `Centre ${key} (${u})`, (text, checkOnly) => { const v = read(text); if (!Number.isFinite(v) || Math.abs(v) > MAX_SIZE) return false; if (!checkOnly) s[key] = v; return true; }))));
    if (computed) { const note = document.createElement('p'); note.className = 'form-hint'; note.textContent = 'Greyed numbers come from a formula in your code (for example a loop): change them in the code. The other numbers are changed directly in your code.'; nodes.push(note); }
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

  function add(shape) {
    if (shapes.length >= MAX_SHAPES) { $('say-status').textContent = `A design can hold up to ${MAX_SHAPES} shapes.`; return false; }
    remember(); shapes.push(shape); selected = shapes.length - 1; refresh('structure'); return true;
  }
  const shapeIcons = {
    sphere: 'M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0ZM3 12c3-4 15-4 18 0M12 3c-5 4-5 14 0 18',
    cylinder: 'M4 6c0-4 16-4 16 0S4 10 4 6Zm0 0v12c0 4 16 4 16 0V6',
    box: 'm12 2 9 5v10l-9 5-9-5V7Zm0 10L3 7m9 5 9-5m-9 5v10',
    cone: 'm4 17 8-15 8 15c0 5-16 5-16 0Zm0 0c3-2 13-2 16 0',
    ellipsoid: 'M2 12c0-8 20-8 20 0S2 20 2 12Zm0 0c5-3 15-3 20 0M12 6c-4 3-4 9 0 12',
    ring: 'M2 10c0-7 20-7 20 0S2 17 2 10Zm5 0c0-3 10-3 10 0s-10 3-10 0Zm-5 0v4c0 7 20 7 20 0v-4',
    prism: 'm3 16 7-13 7 13Zm7-13 6 4 7 12-6-3m-14 0 6 4 14-1'
  };
  function addShapeButton(type) {
    const button = action(C.TYPES[type], () => addShapeOfType(type));
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS(icon.namespaceURI, 'path');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('aria-hidden', 'true');
    path.setAttribute('d', shapeIcons[type]); icon.append(path); button.prepend(icon);
    return button;
  }
  function addShapeOfType(type) {
    const last = shapes[selected] || shapes[shapes.length - 1];
    const shape = C.newShape(type, last ? last.material : 'si');
    if (last && last.material === 'custom') { shape.customName = last.customName; shape.customN = last.customN; }
    if (last && last.customCode) shape.customCode = last.customCode;     // the same material as the last shape
    if (last && last.meepLibrary) shape.meepLibrary = last.meepLibrary;
    if (add(shape)) $('say-status').textContent = `${C.TYPES[type]} added. Change its numbers below.`;
  }
  $('add-row').append(...Object.keys(C.TYPES).map(addShapeButton));

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

  const codeArea = $('code-area'), codeStatus = $('code-status');
  function codeOptions() {
    const w = Number($('index-wavelength').value), s = Number($('meep-scale').value);
    const wavelength = w >= 1 && w <= 1e7 ? w : 633;            // nm
    const scale = s >= 1e-6 && s <= 1e6 ? s : 1;                // µm per Meep length unit
    return { wavelength, scale, index: lib => { if (!materialsReady) return null; try { return Materials.get(lib, wavelength); } catch (error) { return null; } } };
  }
  /* Who wrote the text in the code box: the Studio (from the shapes) or the user (typed or pasted).
     The user's text is never thrown away silently: if a change to the shapes makes the Studio
     rewrite it, the text is kept in `lostCode` and a button brings it back. */
  let codeOwner = 'studio', lostCode = null, shapeLines = [], shapeOrigins = [], fromCaret = false;
  function inPlace() { return codeOwner === 'user' && tab === 'meep' && shapeOrigins.length === shapes.length && !!shapeOrigins[selected]; }
  /* Take the shapes (with their lines and number places) from a reading of the code box. */
  function adopt(result) {
    const pairs = result.shapes.map(s => ({ shape: clean(s), lines: [s.line, s.endLine], origins: s.origins || null, approx: s.approx || [] })).filter(pair => pair.shape).slice(0, MAX_SHAPES);
    // Code has no figure names: keep each shape's name while its place and type stay the same.
    pairs.forEach((pair, i) => { const before = shapes[i]; if (before && before.label && before.type === pair.shape.type) pair.shape.label = before.label; });
    shapes = pairs.map(pair => pair.shape); shapeLines = pairs.map(pair => pair.lines); shapeOrigins = pairs.map(pair => pair.origins);
    shapeApprox = pairs.map(pair => pair.approx);
    setup = result.setup || null;
    coverage = coverageOf(result, codeArea.value, result.shapes.length - pairs.length);
    return pairs.length;
  }

  let coverage = null, keptCoverage = null, shapeApprox = [];
  function coverageOf(result, text, dropped) {
    const reasons = [].concat(...shapeApprox);
    return {
      approx: shapeApprox.map((list, i) => list.length ? { shape: i + 1, line: (shapeLines[i] || [])[0], reasons: list } : null).filter(Boolean),
      missing: (result.problems && result.problems.length ? result.problems : result.skipped.map(line => `Line ${line}.`))
        .concat(dropped > 0 ? [`${dropped} shape${dropped > 1 ? 's' : ''} with sizes that are not allowed${result.shapes.length > MAX_SHAPES ? ` or beyond the limit of ${MAX_SHAPES} shapes` : ''}.`] : []),
      notes: result.notes.filter(note => !reasons.includes(note)),
      outside: tab === 'meep' ? notShown(C.meepOutside(text), result.setup) : [],
      stale: null
    };
  }
  function notShown(parts, s) {
    if (!s) return parts;
    const drawn = { sources: (s.sources || []).map(src => src.line), monitors: [].concat(...(s.monitors || []).map(m => [m.line, m.addLine])) };
    return parts.filter(part => !((part.label === 'cell' && s.cell) || (part.label === 'boundary layers (PML)' && s.layers.length) || (part.label === 'resolution' && s.resolution)))
      .map(part => drawn[part.label] ? Object.assign({}, part, { lines: part.lines.filter(line => !drawn[part.label].includes(line)) }) : part)
      .filter(part => part.lines.length);
  }
  const STATES = {
    stale: ['Out of date', 'The code cannot be read now; the preview shows the last version that could be read.'],
    partly: ['Partly drawn', 'Some of the geometry in the code is not drawn.'],
    approx: ['Approximated', 'Every object is drawn, some of them approximately.'],
    all: ['All drawn', 'Every object of the geometry is drawn as written.']
  };
  const stateOf = c => c.stale ? 'stale' : c.missing.length ? 'partly' : c.approx.length ? 'approx' : 'all';
  const lineText = lines => `line${lines.length > 1 ? 's' : ''} ${lines.slice(0, 6).join(', ')}${lines.length > 6 ? '…' : ''}`;
  function renderCoverage() {
    const box = $('code-coverage');
    markList();
    if (!box) return;
    const own = codeOwner === 'user' && coverage, kept = !own && lostCode && keptCoverage;
    const c = own ? coverage : kept ? keptCoverage : null;
    box.hidden = !c;
    if (!c) { box.replaceChildren(); return; }
    const state = stateOf(c), head = document.createElement('p'), title = document.createElement('strong'), items = document.createElement('ul');
    box.dataset.state = state;
    title.textContent = `Preview: ${STATES[state][0]}.`;
    head.append(title, ' ', kept ? `This was your own code, kept under "Bring back my code". ${STATES[state][1]}` : STATES[state][1]);
    const add = (label, text) => { const li = document.createElement('li'), b = document.createElement('b'); b.textContent = label + ' '; li.append(b, text); items.append(li); };
    const few = (list, n) => list.slice(0, n).concat(list.length > n ? [`and ${list.length - n} more.`] : []);
    if (c.stale) {
      add('Cannot read now:', c.stale);
      box.replaceChildren(head, items);
      return;
    }
    few(c.missing, 6).forEach(text => add('Not drawn:', text));
    few(c.approx.map(a => `shape ${a.shape}${a.line ? ` (line ${a.line})` : ''}: ${a.reasons.join(' ')}`), 6).forEach(text => add('Approximated:', text));
    const s = own ? activeSetup() : null;
    if (s) {
      const li = document.createElement('li'), b = document.createElement('b'), inner = document.createElement('ul');
      b.textContent = `Setup${setupOn ? ' drawn as outlines' : ' (hidden: “Setup” under the view shows it)'}:`;
      setupItems(s).forEach(item => {
        const row = document.createElement('li'), link = document.createElement('button');
        link.type = 'button'; link.className = 'line-link'; link.textContent = `line ${item.line}`;
        link.addEventListener('click', () => goToLine(item.line));
        row.append(item.text, ' ', link); inner.append(row);
      });
      li.append(b, inner); items.append(li);
    }
    if (c.outside.length) add('Not shown:', `${c.outside.map(part => `${part.label} (${lineText(part.lines)})`).join(', ')}. The preview does not draw these.`);
    few(c.notes, 4).forEach(text => add('Note:', text));
    box.replaceChildren(head, ...(items.children.length ? [items] : []));
  }
  /* A ≈ mark in the shape list for each shape drawn approximately. */
  function markList() {
    [...list.querySelectorAll('li > button')].forEach((button, i) => {
      const old = button.querySelector('.approx-mark'); if (old) old.remove();
      const reasons = codeOwner === 'user' ? shapeApprox[i] : null;
      if (!reasons || !reasons.length) return;
      const mark = document.createElement('span'), hidden = document.createElement('span');
      mark.className = 'approx-mark'; mark.textContent = '≈'; mark.title = 'Drawn approximately: ' + reasons.join(' ');
      hidden.className = 'visually-hidden'; hidden.textContent = ' (drawn approximately)';
      mark.setAttribute('aria-hidden', 'true'); button.append(mark, hidden);
    });
  }
  function editInPlace(key, nm) {
    const where = (shapeOrigins[selected] || {})[key], text = codeArea.value;
    if (!where || !/^-?[\d.eE+_-]+$/.test(text.slice(where.pos, where.end))) return false;
    let written;
    if (nm === Infinity) { if (!/^\s*import\s+meep\s+as\s+mp\b/m.test(text)) return false; written = 'mp.inf'; }
    else written = String(Number((nm / (1000 * codeOptions().scale)).toPrecision(10)));   // in the script's own length unit
    const next = text.slice(0, where.pos) + written + text.slice(where.end), result = parseCode(next), count = shapes.length;
    if (result.shapes.map(clean).filter(Boolean).length !== result.shapes.length || !result.shapes.length) return false;   // the new number would break a shape: leave the text alone
    const sharers = shapeOrigins.filter(o => o && Object.keys(o).some(k => o[k].pos === where.pos)).length;
    codeArea.value = next; adopt(result); selected = Math.min(selected, shapes.length - 1);
    refresh(shapes.length !== count ? 'code-structure' : 'code-form');
    codeStatus.textContent = `Changed ${where.via ? `the variable ${where.via} on line ${where.line}` : `the number on line ${where.line}`} of your code.${sharers > 1 ? ` ${sharers} shapes use it.` : ''}`;
    codeStatus.classList.remove('warning');
    if (key === 'radius') tourMark(2);   // the walkthrough's second step
    return true;
  }
  function putBackCode(text, select) {
    codeArea.value = text; codeOwner = 'user'; codeRemembered = true;
    adopt(parseCode(text)); selected = Math.min(Number.isInteger(select) ? select : selected, shapes.length - 1);
    refresh('code-structure'); codeRemembered = false;
    if (restore) restore.hidden = !(lostCode && lostCode.tab === tab);
    codeStatus.textContent = ''; codeStatus.classList.remove('warning');
  }
  const band = $('code-band'), restore = $('code-restore');
  function parseCode(text) { return tab === 'gds' ? C.fromGds(text) : C.fromMeep(text, codeOptions()); }
  function writeCode(textTab = tab) {
    if (codeOwner === 'user' && codeArea.value.trim()) { lostCode = { text: codeArea.value, tab: textTab }; keptCoverage = coverage; }
    codeArea.value = tab === 'gds' ? C.toGds(shapes) : C.toMeep(shapes, codeOptions());
    codeOwner = 'studio'; shapeOrigins = []; coverage = null; shapeApprox = [];
    // Read our own text back to learn which lines belong to which shape.
    try { const back = parseCode(codeArea.value); shapeLines = back.shapes.length === shapes.length ? back.shapes.map(s => [s.line, s.endLine]) : []; } catch (error) { shapeLines = []; }
    const canRestore = !!lostCode && lostCode.tab === tab;
    if (restore) restore.hidden = !canRestore;
    codeStatus.textContent = canRestore ? 'The Studio rewrote the code from the shapes. Your own text is kept: "Bring back my code" restores it.' : '';
    codeStatus.classList.remove('warning');
    showBand(false);
    renderCoverage();
  }
  /* A band behind the lines of code that made the selected shape. */
  function showBand(scroll) {
    if (!band) return;
    const lines = shapeLines[selected];
    if (!lines || !lines[0]) { band.hidden = true; return; }
    const style = getComputedStyle(codeArea), lineHeight = parseFloat(style.lineHeight) || 20, pad = parseFloat(style.paddingTop) || 0;
    const top = (lines[0] - 1) * lineHeight, height = (lines[1] - lines[0] + 1) * lineHeight;
    if (scroll && (top < codeArea.scrollTop || top + height > codeArea.scrollTop + codeArea.clientHeight - 2 * pad)) codeArea.scrollTop = Math.max(0, top - 2 * lineHeight);
    band.hidden = false; band.style.top = `${pad + top - codeArea.scrollTop}px`; band.style.height = `${height}px`;
  }
  codeArea.addEventListener('scroll', () => showBand(false));
  /* Putting the text cursor on a line selects the shape made by that line. */
  function followCaret() {
    const line = codeArea.value.slice(0, codeArea.selectionStart).split('\n').length;
    const holds = lines => !!lines && lines[0] <= line && line <= lines[1];
    if (holds(shapeLines[selected])) return;
    const hit = shapeLines.findIndex(holds);
    if (hit >= 0) { selected = hit; fromCaret = true; refresh('select'); fromCaret = false; }
  }
  codeArea.addEventListener('click', followCaret);
  codeArea.addEventListener('keyup', event => { if (/^(Arrow|Page|Home|End)/.test(event.key)) followCaret(); });

  let codeTimer = 0, codeRemembered = false;
  codeArea.addEventListener('focus', () => { codeRemembered = false; });
  function readCode() {
    const text = codeArea.value, problems = [], declaredNote = [];
    // A script that states its length unit (the Studio's first line) is read in that unit.
    const declared = tab === 'meep' ? C.meepScaleIn(text) : null;
    if (declared && inRange(declared, 1e-6, 1e6) && declared !== codeOptions().scale) {
      if (!codeRemembered) { remember(); codeRemembered = true; }
      $('meep-scale').value = String(declared); shownSettings = settings(); settingsRemembered = false;
      declaredNote.push(`Your code says 1 Meep unit = ${declared} µm: the Studio now reads it in that unit.`);
    }
    const result = parseCode(text);
    codeOwner = 'user';
    const read = result.shapes.map(clean).filter(Boolean).slice(0, MAX_SHAPES);
    if (result.problems && result.problems.length) { problems.push(...result.problems.slice(0, 3)); if (result.problems.length > 3) problems.push(`And ${result.problems.length - 3} more line(s) with problems.`); }
    else if (result.skipped.length) problems.push(`Could not use line${result.skipped.length > 1 ? 's' : ''} ${result.skipped.slice(0, 8).join(', ')}${result.skipped.length > 8 ? '…' : ''}.`);
    if (read.length < result.shapes.length) problems.push(`${result.shapes.length - read.length} shape(s) had sizes that are not allowed${result.shapes.length > MAX_SHAPES ? ` or were beyond the limit of ${MAX_SHAPES} shapes` : ''}.`);
    problems.push(...result.notes);
    if (!read.length && text.trim()) {
      codeStatus.textContent = ['No shapes found in this code yet.'].concat(declaredNote, problems).join(' '); codeStatus.classList.add('warning');
      // The preview still shows the last shapes: say so until the code can be read again.
      coverage = Object.assign(coverage || { approx: [], missing: [], notes: [], outside: [] }, { stale: problems.length ? problems.slice(0, 2).join(' ') : 'no shapes found in it.' });
      renderCoverage();
      return;
    }
    if (!codeRemembered) { remember(); codeRemembered = true; }
    const countChanged = read.length !== shapes.length;
    adopt(result); selected = Math.min(selected, shapes.length - 1);
    refresh(countChanged ? 'code-structure' : 'code');
    // The details (lines not drawn, approximations, notes) are in the coverage box below.
    const partial = stateOf(coverage) !== 'all' || coverage.notes.length > 0;
    codeStatus.textContent = [`Read ${read.length} shape${read.length === 1 ? '' : 's'}.`].concat(declaredNote, partial ? ['What the preview leaves out or approximates is listed below.'] : []).join(' ');
    codeStatus.classList.toggle('warning', partial);
  }
  codeArea.addEventListener('input', () => { clearTimeout(codeTimer); codeTimer = setTimeout(readCode, 250); });
  if (restore) restore.addEventListener('click', () => {
    if (!lostCode) return;
    if (lostCode.tab !== tab) showTab(lostCode.tab);
    const text = lostCode.text; lostCode = null; remember();
    putBackCode(text);
  });
  /* Select a tab on the page (buttons and the controls that belong to one language). */
  function showTab(next) {
    tab = next;
    ['gds', 'meep'].forEach(language => {
      const button = $('tab-' + language);
      button.setAttribute('aria-selected', String(tab === language));
      button.tabIndex = tab === language ? 0 : -1;
    });
    $('code-panel').setAttribute('aria-labelledby', 'tab-' + tab);
    $('index-label').hidden = tab !== 'meep'; $('scale-label').hidden = tab !== 'meep';
    // What each download is, and its main limit, beside the buttons (more in "How it works").
    if ($('tab-hint')) $('tab-hint').textContent = tab === 'meep'
      ? 'The download is a Meep geometry list (.py), not a runnable simulation: the Studio has not run Meep. Add your own cell, sources, boundaries and run commands.'
      : 'The layout script (.py) rebuilds this layout in gdsfactory; the .gds file is the layout itself, for KLayout. Both store flat outlines, one layer per material: heights appear only as comments in the script, and shapes with an endless size are left out.';
    $('code-download').textContent = tab === 'meep' ? 'Download geometry (.py)' : 'Download layout script (.py)';
    $('code-download').title = tab === 'meep'
      ? 'A Python file with the Meep geometry list and its materials. It does not run a simulation by itself.'
      : 'A Python file that builds the layout with gdsfactory (one layer per material).';
    if ($('gds-download')) $('gds-download').hidden = tab !== 'gds';
  }
  function setTab(next) {
    const leaving = tab;   // the language of the text in the box before the switch
    showTab(next);
    writeCode(leaving); save();
  }
  ['gds', 'meep'].forEach(language => {
    const button = $('tab-' + language);
    button.addEventListener('click', () => { if (tab !== language) setTab(language); });
    button.addEventListener('keydown', event => {
      const next = { ArrowRight: tab === 'gds' ? 'meep' : 'gds', ArrowLeft: tab === 'gds' ? 'meep' : 'gds', Home: 'gds', End: 'meep' }[event.key];
      if (!next) return;
      event.preventDefault();
      if (tab !== next) setTab(next);
      $('tab-' + next).focus();
    });
  });
  function rememberSettings() {
    if (settingsRemembered) return;
    const before = JSON.parse(freeze()); before.settings = shownSettings;
    const text = JSON.stringify(before);
    if (history[history.length - 1] !== text) { history.push(text); if (history.length > 40) history.shift(); }
    settingsRemembered = true;
  }
  ['index-wavelength', 'meep-scale'].forEach(id => {
    $(id).addEventListener('input', rememberSettings, true);   // before the handlers below change anything
    $(id).addEventListener('change', () => { settingsRemembered = false; shownSettings = settings(); });
  });
  $('index-wavelength').addEventListener('input', () => {
    if (tab === 'meep' && codeOwner === 'studio') writeCode();
    if (shapes[selected] && shapes[selected].meepLibrary) renderForm();   // the range warning depends on the wavelength
    save(); $('undo').disabled = !history.length;
  });
  $('meep-scale').addEventListener('input', () => {
    const s = Number($('meep-scale').value);
    if (!inRange(s, 1e-6, 1e6)) return;   // wait for a usable number
    if (tab === 'meep' && codeOwner === 'user' && codeArea.value.trim()) {
      const text = codeArea.value, result = parseCode(text);
      if (result.shapes.length) { adopt(result); selected = Math.min(selected, shapes.length - 1); refresh('code-structure'); }
      const declared = C.meepScaleIn(text);
      codeStatus.textContent = `Your code is now read with 1 Meep unit = ${s} µm.` + (declared && declared !== s ? ` Its first line says ${declared} µm.` : '');
      codeStatus.classList.toggle('warning', !!declared && declared !== s);
    } else if (tab === 'meep') writeCode();
    save(); $('undo').disabled = !history.length;
  });
  $('code-copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(codeArea.value); codeStatus.textContent = 'Copied.'; }
    catch (error) { codeArea.select(); codeStatus.textContent = 'Press Ctrl+C (or ⌘C) to copy the selected code.'; }
    codeStatus.classList.remove('warning');
  });
  if ($('gds-download')) $('gds-download').addEventListener('click', () => {
    const Gds = window.ElyvrisGds; if (!Gds || !C.toLayout) return;
    const layout = C.toLayout(shapes), file = Gds.write(layout, { name: 'elyvris_studio' });
    if (!file.polygons) { codeStatus.textContent = 'Nothing to save: a layout needs at least one shape with a finite outline.'; codeStatus.classList.add('warning'); return; }
    const url = URL.createObjectURL(new Blob([file.bytes], { type: 'application/octet-stream' })), a = document.createElement('a');
    a.href = url; a.download = 'elyvris_studio.gds'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    const left = layout.skipped.length + file.dropped;
    codeStatus.textContent = `Saved elyvris_studio.gds: ${file.polygons} outline${file.polygons === 1 ? '' : 's'} on ${layout.layers.length} layer${layout.layers.length === 1 ? '' : 's'} (${layout.layers.map(l => `${l.layer}/0 ${l.label}`).join(', ')}), corners on a 1 nm grid.${left ? ` ${left} shape${left === 1 ? '' : 's'} left out (endless, or smaller than the grid).` : ''} A layout keeps no heights.`;
    codeStatus.classList.toggle('warning', left > 0);
  });
  $('code-download').addEventListener('click', () => {
    const url = URL.createObjectURL(new Blob([codeArea.value], { type: 'text/x-python' })), a = document.createElement('a');
    a.href = url; a.download = tab === 'gds' ? 'elyvris_studio_layout.py' : 'elyvris_studio_meep.py'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  function refresh(source) {
    const scene = buildScene();
    if (view) view.setScene(scene, source === 'structure' || source === 'code-structure' || source === 'setup');
    if ($('view-setup')) { $('view-setup').hidden = !activeSetup(); $('view-setup').setAttribute('aria-pressed', String(setupOn)); }
    $('stage-scale').textContent = `1 square = ${scene.grid >= 1000 ? scene.grid / 1000 + ' µm' : scene.grid + ' nm'}`;
    renderList();
    if (source !== 'form' && source !== 'code-form') renderForm();   // do not rebuild the field being typed in
    if (source === 'select') tourMark(1);   // the walkthrough's first step
    if (['code', 'code-form', 'code-structure', 'select', 'unit', 'setup'].includes(source)) showBand(source === 'select' && !fromCaret); else writeCode();
    $('undo').disabled = !history.length;
    save();
    renderCoverage();
  }

  try {
    view = View ? View.create($('view3d'), $('view-labels'), {
      onViewChange: name => document.querySelectorAll('[data-view]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.view === name));
      }),
      onPick: index => { if (index !== selected) { selected = index; refresh('select'); } },
      onMove: (index, x, y) => {
        if (!shapes[index]) return;
        if (!dragStarted) { remember(); dragStarted = true; }
        shapes[index].x = Math.round(x); shapes[index].y = Math.round(y); selected = index; refresh('drag');
      },
      onMoveEnd: () => { dragStarted = false; },
      // Ruler: lengths are shown in the unit chosen on the page.
      format: nm => `${show(Number(nm.toFixed(2)))} ${unitLabel()}`,
      onMeasure: m => {
        const out = $('stage-measure'); if (!out) return;
        const f = nm => `${show(Number(nm.toFixed(2)))} ${unitLabel()}`, at = p => `(${p.map(v => show(Number(v.toFixed(2)))).join(', ')})`;
        out.textContent = !m ? 'Ruler: click a first point. Points on shapes are caught when the ring appears.'
          : !m.b ? `Ruler: first point ${at(m.a)} ${unitLabel()}. Click the second point.`
          : `Distance ${f(m.distance)} · Δx ${f(m.delta[0])}, Δy ${f(m.delta[1])}, Δz ${f(m.delta[2])} · from ${at(m.a)} to ${at(m.b)} ${unitLabel()}`;
      }
    }) : null;
  } catch (error) { view = null; }
  if (!view) { $('stage-fallback').hidden = false; $('view3d').hidden = true; document.querySelectorAll('.stage-top, .stage-bottom, .stage-scale').forEach(node => { node.hidden = true; }); }
  else {
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => view.view(button.dataset.view)));
    $('view-zoom-in').addEventListener('click', () => view.zoom(1 / 1.25));
    $('view-zoom-out').addEventListener('click', () => view.zoom(1.25));
    $('view-fit').addEventListener('click', () => view.fit());
    if ($('view-setup')) $('view-setup').addEventListener('click', () => { setupOn = !setupOn; refresh('setup'); });
    const setMode = mode => {
      view.setMode(mode);
      ['orbit', 'move', 'measure'].forEach(name => { const button = $('mode-' + name); if (button) button.setAttribute('aria-pressed', String(mode === name)); });
      const out = $('stage-measure'); if (out) { out.hidden = mode !== 'measure'; if (mode === 'measure') out.textContent = 'Ruler: click a first point. Points on shapes are caught when the ring appears.'; }
    };
    if ($('mode-measure')) $('mode-measure').addEventListener('click', () => setMode($('mode-measure').getAttribute('aria-pressed') === 'true' ? 'orbit' : 'measure'));
    $('mode-orbit').addEventListener('click', () => setMode('orbit'));
    $('mode-move').addEventListener('click', () => setMode('move'));
    const Figure = window.ElyvrisFigure;
    if (Figure && $('figure-save')) $('figure-save').addEventListener('click', () => {
      const background = $('figure-background') ? $('figure-background').value : 'paper';
      const shot = view.snapshot(Number($('figure-size').value) || 2000, { background });
      if (!shot) return;
      const materials = [];
      shapes.forEach(shape => { const label = C.materialLabel(shape); if (!materials.some(m => m.label === label)) materials.push({ label, color: C.materialColor(shape) }); });
      const marks = $('figure-marks') && $('figure-marks').checked ? figureMarks() : null;
      const name = background === 'paper' ? 'elyvris_studio_figure.png' : `elyvris_studio_figure_${background === 'screen' ? 'dark' : 'transparent'}.png`;
      Figure.save(Figure.compose(shot, materials, { marks }), name).catch(() => { /* the browser refused to make the file */ });
    });
  }
  $('unit').addEventListener('change', () => { unit = $('unit').value; refresh('unit'); });

  const make = (type, material, values) => clean(Object.assign(C.newShape(type, material), values));
  const own = (type, name, values) => clean(Object.assign(C.newShape(type, 'custom'), { customName: name, customN: null }, values));
  const range = (count, step) => Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * step);
  const EXAMPLES = {
    film: () => [
      make('box', 'si', { sx: 2000, sy: 2000, sz: 500, z: -250 }),
      make('box', 'tio2', { sx: 2000, sy: 2000, sz: 100, z: 50 })],
    bragg: () => [make('box', 'sio2', { sx: 2000, sy: 2000, sz: 500, z: -250 })].concat(
      Array.from({ length: 6 }).flatMap((_, i) => [
        make('box', 'tio2', { sx: 2000, sy: 2000, sz: 32, z: i * 95 + 16 }),
        make('box', 'sio2', { sx: 2000, sy: 2000, sz: 63, z: i * 95 + 32 + 31.5 })])),
    anapole: () => [make('box', 'sio2', { sx: 2199, sy: 2199, sz: 600, z: -300 })].concat(
      range(3, 733).flatMap(x => range(3, 733).map(y => make('box', 'tio2', { sx: 190, sy: 160, sz: 100, x, y, z: 50 })))),
    msc: () => [own('box', 'Ag', { sx: 2900, sy: 2000, sz: 30, z: 0 })].concat(
      range(5, 580).flatMap(x => [
        own('box', 'MoS2', { sx: 174, sy: 2000, sz: 150, x, z: 15 + 75 }),
        own('box', 'MoS2', { sx: 174, sy: 2000, sz: 150, x, z: -15 - 75 })])),
    /* Two silicon strip waveguides (450 × 220 nm) 200 nm apart on oxide. */
    coupler: () => [
      make('box', 'sio2', { sx: 6000, sy: 3000, sz: 1000, z: -500 }),
      make('box', 'si', { sx: 6000, sy: 450, sz: 220, y: 325, z: 110 }),
      make('box', 'si', { sx: 6000, sy: 450, sz: 220, y: -325, z: 110 })],
    adddrop: () => [
      make('box', 'sio2', { sx: 4600, sy: 5200, sz: 500, z: -250 }),
      make('ring', 'si', { radius: 1500, width: 450, height: 220, z: 110 }),
      make('box', 'si', { sx: 4600, sy: 450, sz: 220, y: -1925, z: 110 }),
      make('box', 'si', { sx: 4600, sy: 450, sz: 220, y: 1925, z: 110 })],
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
    refresh('structure'); $('example').value = ''; $('say-status').textContent = ''; endTour();
  });

  const START_KEY = 'elyvris-studio-start-hidden';
  const STARTER = [
    '# Example: three pillars that share one radius.',
    '# Select a pillar and change its radius in the form: the Studio edits r below, and all three change.',
    'import meep as mp',
    '',
    'r = 0.15       # pillar radius (µm)',
    'h = 0.6        # pillar height (µm)',
    'pitch = 0.5    # distance between pillar centres (µm)',
    'pillar = mp.Medium(index=2.4)   # a constant refractive index, chosen for this example',
    '',
    'geometry = [mp.Cylinder(radius=r, height=h, center=mp.Vector3(x, 0, h / 2), material=pillar)',
    '            for x in (-pitch, 0, pitch)]',
    ''
  ].join('\n');
  function tourMark(step, onlyNow) {
    const box = $('tour'); if (!box || box.hidden) return;
    const now = Number(box.dataset.step);
    if (step < now || (onlyNow && step !== now)) return;
    if (step === 2) { const r = /^r\s*=\s*([^\s#]+)/m.exec(codeArea.value); $('tour-r').textContent = r ? ` (it now says r = ${r[1]})` : ''; }
    box.dataset.step = String(step + 1); renderTour();
  }
  function renderTour() {
    const box = $('tour'), now = Number(box.dataset.step);
    box.querySelectorAll('.tour-steps li').forEach((li, i) => {
      li.classList.toggle('done', i + 1 < now); li.classList.toggle('now', i + 1 === now);
      if (i + 1 === now) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    $('tour-skip').hidden = now > 4;
    $('tour-now').textContent = now > 4
      ? 'Done. You changed one number in a Python script from the form, and the rest of the text stayed as it was written. Undo returns to the example as it was.'
      : '';
  }
  function startTour() { const box = $('tour'); if (!box) return; box.dataset.step = '1'; $('tour-r').textContent = ''; box.hidden = false; renderTour(); }
  function endTour() { if ($('tour')) $('tour').hidden = true; }
  if ($('tour')) {
    $('tour-close').addEventListener('click', endTour);
    $('tour-skip').addEventListener('click', () => tourMark(Number($('tour').dataset.step)));
    codeArea.addEventListener('click', () => tourMark(3, true));
    $('project-save').addEventListener('click', () => tourMark(4, true));
  }

  const startCard = $('start-card');
  function hideStart() { if (startCard) startCard.hidden = true; try { localStorage.setItem(START_KEY, '1'); } catch (error) { /* storage may be unavailable */ } }
  if (startCard) {
    try { startCard.hidden = localStorage.getItem(START_KEY) === '1'; } catch (error) { startCard.hidden = false; }
    $('start-hide').addEventListener('click', hideStart);
    $('start-example').addEventListener('click', () => {
      hideStart(); remember();
      setTab('meep');                         // your own text, if any, is kept under "Bring back my code"
      putBackCode(STARTER, 0);
      codeStatus.textContent = 'Example loaded. Select a pillar and change its radius in the form: the Studio edits r in the code, and all three pillars change.';
      startTour();
      $('view3d').scrollIntoView({ block: 'nearest' });
    });
    $('start-paste').addEventListener('click', () => {
      hideStart(); endTour();
      if (tab !== 'meep') setTab('meep');
      codeArea.scrollIntoView({ block: 'center' }); codeArea.focus(); codeArea.select();
      codeStatus.textContent = 'Paste your Meep script now (Ctrl+V or ⌘V): it replaces the selected text. Undo brings the previous design back.';
      codeStatus.classList.remove('warning');
    });
    $('start-new').addEventListener('click', () => {
      hideStart(); endTour(); remember();
      shapes = []; selected = -1; refresh('structure');
      $('say-input').focus();
      $('say-status').textContent = 'Empty design. Add a shape with the buttons above, or type a sentence such as "TiO2 cylinder, radius 150 nm, height 200 nm". Undo brings the previous design back.';
    });
    $('start-again').addEventListener('click', () => {
      startCard.hidden = false;
      try { localStorage.removeItem(START_KEY); } catch (error) { /* storage may be unavailable */ }
      startCard.scrollIntoView({ block: 'start' }); $('start-example').focus({ preventScroll: true });
    });
  }

  let restored = false;
  try {
    const saved = JSON.parse(localStorage.getItem(PROJECT_KEY) || 'null'), old = saved ? null : JSON.parse(localStorage.getItem(STORE) || 'null');
    const start = saved ? readProject(saved).project : old && old.design ? fromOldSave(old) : null;
    if (start) {
      restored = true;
      shapes = start.shapes; selected = start.selected; storedCode = start.code; lostCode = start.kept;
      applySettings(start.settings);
      unit = start.unit; $('unit').value = unit;
      tab = start.tab;
    }
  } catch (error) { shapes = []; restored = false; }
  if (!restored) { shapes = EXAMPLES.disk(); selected = 1; }
  window.ElyvrisStudioView = view;   // for the checks in scripts/
  window.ElyvrisStudio = { shapes: () => JSON.parse(freeze()).shapes, project: projectData, openProjectText, addFromSentence, load: next => { shapes = next.map(clean).filter(Boolean); selected = shapes.length - 1; refresh('structure'); } };
  setTab(tab);
  refresh('structure');
  if (storedCode && storedCode.tab === tab && storedCode.text.trim()) { const select = selected; putBackCode(storedCode.text, select); }
  if (Materials) Materials.load().then(() => { materialsReady = true; if (tab === 'meep' && codeOwner === 'studio' && document.activeElement !== codeArea) writeCode(); }).catch(() => { /* Meep code then asks the user to define materials */ });
})();

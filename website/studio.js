/* Elyvris Studio — page logic.
 *
 * Flow:  sentence -> assistant (studio-assistant.js) -> design
 *        design   -> 3D view (studio-view3d.js)
 *        design   -> spectrum with Mie theory (mie.js), for a sphere or a 2D cylinder
 *
 * All lengths are in nanometres. Nothing leaves the browser.
 */
(() => {
  'use strict';
  const A = window.ElyvrisAssistant, Mie = window.ElyvrisMie, Materials = window.OpticalMaterials, View = window.ElyvrisView3D;
  const $ = id => document.getElementById(id);
  if (!$('studio') || !A || !Mie || !Materials) return;

  const POINTS = 480;                              // wavelengths per spectrum
  const DEFAULT_RANGE = { min: 300, max: 1000 };   // nm
  const SIZE_DEFAULTS = { radius: 90, height: 200, sx: 300, sy: 200, sz: 100 };
  const COLORS = { ext: '#2a78d6', sca: '#eb6834', abs: '#1baf7a', parts: ['#e87ba4', '#008300', '#6250d6', '#e34948'] };
  const SVG = 'http://www.w3.org/2000/svg';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const swatches = Object.fromEntries((window.ELYVRIS_GEOMETRY_MATERIALS || []).map(item => [item.id, item.color]));

  let draft = A.emptyState();   // what the assistant is still building
  let applied = null;           // last complete design: drawn and calculated
  let uploaded = null;          // { name, rows: [[nm, n, k]], minNm, maxNm, unit }
  let result = null;            // last calculated spectrum
  let probeIndex = 0, probePinned = false;
  let view = null, motion = !reduceMotion, demoToken = 0;

  const clone = value => JSON.parse(JSON.stringify(value));
  // Three significant figures; very small values use powers of ten (3.2e-7).
  const fmt = (value, digits = 3) => !Number.isFinite(value) ? '—' : value !== 0 && Math.abs(value) < 1e-3 ? value.toExponential(digits - 1) : String(Number(value.toPrecision(digits)));
  const fmtNm = value => String(Math.round(value * 10) / 10);
  const fmtK = value => fmt(value, 2);

  /* ------------------------------------------------------------------ *
   * Materials
   * ------------------------------------------------------------------ */
  function interpolate(rows, nm) {
    let low = 0, high = rows.length - 1;
    while (high - low > 1) { const mid = (low + high) >> 1; if (rows[mid][0] > nm) high = mid; else low = mid; }
    const f = (nm - rows[low][0]) / (rows[high][0] - rows[low][0]);
    return { n: rows[low][1] + f * (rows[high][1] - rows[low][1]), k: rows[low][2] + f * (rows[high][2] - rows[low][2]) };
  }
  function resolveMaterial(material) {
    if (material.kind === 'library') {
      const record = Materials.getRecord(material.id);
      return { label: `${material.name} (${material.formula})`, short: material.formula, minNm: record.minNm, maxNm: record.maxNm,
        nk: nm => Materials.get(material.id, nm), source: `${record.label}. ${record.citation}`, color: swatches[material.id] || '#7f66a7' };
    }
    if (material.kind === 'file') {
      if (!uploaded) throw new Error('No material file is loaded. Use “Upload n, k file”.');
      return { label: `your file “${uploaded.name}”`, short: uploaded.name, minNm: uploaded.minNm, maxNm: uploaded.maxNm,
        nk: nm => interpolate(uploaded.rows, nm), source: `User file “${uploaded.name}”, read locally (${uploaded.rows.length} rows).`, color: '#7f66a7' };
    }
    const n = material.n, k = material.k || 0;
    return { label: `a constant index n = ${n}${k ? `, k = ${k}` : ''}`, short: `n = ${n}`, minNm: 1, maxNm: 1e7,
      nk: () => ({ n, k }), source: 'Constant index typed by the user; no change with wavelength.', color: '#8c9cbd' };
  }

  /* Read a text file of optical constants: columns wavelength, n, k.
   * Also accepts the two-block CSV exported by refractiveindex.info
   * (a "wl,n" block followed by a "wl,k" block). */
  function parseOpticalConstants(text) {
    const blocks = [[]];
    text.split(/\r?\n/).slice(0, 60000).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || /^[#%!;]|^\/\//.test(trimmed)) return;
      const numbers = trimmed.split(/[\s,;]+/).filter(Boolean).map(Number);
      if (numbers.length >= 2 && Number.isFinite(numbers[0]) && Number.isFinite(numbers[1])) blocks[blocks.length - 1].push(numbers.slice(0, 3));
      else if (blocks[blocks.length - 1].length) blocks.push([]);   // a header line starts a new block
    });
    const filled = blocks.filter(block => block.length);
    if (!filled.length) throw new Error('I found no rows of numbers. Each row needs: wavelength, n and (optionally) k.');
    let rows;
    const twoColumns = block => block.every(row => row.length === 2 || !Number.isFinite(row[2]));
    if (filled.length >= 2 && twoColumns(filled[0]) && twoColumns(filled[1])) {
      const kRows = filled[1].map(row => [row[0], row[1], row[1]]).sort((a, b) => a[0] - b[0]);
      rows = filled[0].filter(row => row[0] >= kRows[0][0] && row[0] <= kRows[kRows.length - 1][0])
        .map(row => [row[0], row[1], kRows.length > 1 ? interpolate(kRows, row[0]).n : kRows[0][1]]);
    } else {
      rows = filled[0].map(row => [row[0], row[1], Number.isFinite(row[2]) ? row[2] : 0]);
    }
    rows.sort((a, b) => a[0] - b[0]);
    rows = rows.filter((row, i) => i === 0 || row[0] > rows[i - 1][0]);
    if (rows.length < 2) throw new Error('I need at least two different wavelengths.');
    if (rows.some(row => !(row[0] > 0) || !(row[1] > 0) || !(row[2] >= 0) || row[1] > 50 || row[2] > 50)) throw new Error('Some rows are not physical: wavelength and n must be positive, k must be zero or positive.');
    // Wavelength unit: values below 50 are read as micrometres, otherwise nanometres.
    const unit = rows[rows.length - 1][0] < 50 ? 'µm' : 'nm';
    if (unit === 'µm') rows.forEach(row => { row[0] *= 1000; });
    return { rows, minNm: rows[0][0], maxNm: rows[rows.length - 1][0], unit };
  }

  /* ------------------------------------------------------------------ *
   * Calculation
   * ------------------------------------------------------------------ */
  function partNames(design) {
    return design.shape === 'sphere'
      ? ['Electric dipole', 'Magnetic dipole', 'Electric quadrupole', 'Magnetic quadrupole']
      : ['Order n = 0', 'Order n = 1', 'Order n = 2', 'Order n = 3'];
  }
  function calculate(design) {
    const material = resolveMaterial(design.material), notes = [];
    const wanted = design.range || (design.material.kind === 'file' ? { min: material.minNm, max: material.maxNm } : DEFAULT_RANGE);
    const min = Math.max(wanted.min, material.minNm), max = Math.min(wanted.max, material.maxNm);
    if (!(max > min)) throw new RangeError(`The optical constants of ${material.short} cover ${fmtNm(material.minNm)}–${fmtNm(material.maxNm)} nm. That does not overlap the range ${fmtNm(wanted.min)}–${fmtNm(wanted.max)} nm, and values are never extrapolated.`);
    if (min > wanted.min || max < wanted.max) notes.push(`The range was shortened to ${fmtNm(min)}–${fmtNm(max)} nm, where the optical constants of ${material.short} are available.`);
    const nMedium = design.medium.n, radius = design.radius, isSphere = design.shape === 'sphere';
    const out = { design: clone(design), material, min, max, notes, wavelength: [], n: [], k: [], x: [], qext: [], qsca: [], qabs: [], parts: [[], [], [], []], names: partNames(design) };
    for (let i = 0; i < POINTS; i++) {
      const lambda = Math.min(max, Math.max(min, min + (max - min) * i / (POINTS - 1)));
      const nk = material.nk(lambda), x = 2 * Math.PI * nMedium * radius / lambda, m = [nk.n / nMedium, nk.k / nMedium];
      let q, parts;
      if (isSphere) {
        q = Mie.sphere(x, m);
        parts = [q.electric[1], q.magnetic[1], q.electric[2] || 0, q.magnetic[2] || 0];
      } else {
        const both = Mie.cylinder(x, m), a = both.parallel, b = both.perpendicular;
        if (design.polarization === 'unpolarized') {
          q = { qext: (a.qext + b.qext) / 2, qsca: (a.qsca + b.qsca) / 2, qabs: (a.qabs + b.qabs) / 2 };
          parts = [0, 1, 2, 3].map(order => ((a.orders[order] || 0) + (b.orders[order] || 0)) / 2);
        } else {
          q = design.polarization === 'perpendicular' ? b : a;
          parts = [0, 1, 2, 3].map(order => q.orders[order] || 0);
        }
      }
      out.wavelength.push(lambda); out.n.push(nk.n); out.k.push(nk.k); out.x.push(x);
      out.qext.push(q.qext); out.qsca.push(q.qsca); out.qabs.push(q.qabs);
      parts.forEach((value, index) => out.parts[index].push(value));
    }
    // Scattering peaks: local maxima above 8% of the largest value, strongest three.
    const top = Math.max(...out.qsca), peaks = [];
    for (let i = 1; i < POINTS - 1; i++) if (out.qsca[i] > out.qsca[i - 1] && out.qsca[i] >= out.qsca[i + 1] && out.qsca[i] > 0.08 * top) peaks.push(i);
    out.peaks = peaks.sort((a, b) => out.qsca[b] - out.qsca[a]).slice(0, 3).map(index => {
      const values = out.parts.map(part => part[index]), best = values.indexOf(Math.max(...values));
      return { index, name: out.names[best], share: values[best] / out.qsca[index] };
    });
    return out;
  }

  /* ------------------------------------------------------------------ *
   * Plots (SVG drawn at real pixel size, so text stays readable on phones)
   * ------------------------------------------------------------------ */
  function svgEl(name, attributes, text) {
    const node = document.createElementNS(SVG, name);
    Object.keys(attributes || {}).forEach(key => node.setAttribute(key, attributes[key]));
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function niceStep(span, target) {
    const raw = span / target, power = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / power;
    return (f <= 1.1 ? 1 : f <= 2.2 ? 2 : f <= 5.5 ? 5 : 10) * power;
  }
  const plots = [
    { svg: $('plot-total'), tip: $('tip-total'), legend: $('legend-total'), series: [] },
    { svg: $('plot-parts'), tip: $('tip-parts'), legend: $('legend-parts'), series: [] }
  ];
  function seriesFor(index) {
    if (index === 0) return [
      { name: 'Extinction', color: COLORS.ext, values: result.qext },
      { name: 'Scattering', color: COLORS.sca, values: result.qsca },
      { name: 'Absorption', color: COLORS.abs, values: result.qabs }];
    return result.parts.map((values, i) => ({ name: result.names[i], color: COLORS.parts[i], values }))
      .concat([{ name: 'All terms (total scattering)', color: COLORS.sca, values: result.qsca, dashed: true }]);
  }
  function drawPlot(plot) {
    const svg = plot.svg, series = plot.series, r = result;
    const W = Math.max(260, Math.round(svg.parentNode.clientWidth)), H = W < 520 ? 240 : 290;
    const margin = { l: 46, r: 14, t: 28, b: 42 }, pw = W - margin.l - margin.r, ph = H - margin.t - margin.b;
    let top = 0; series.forEach(s => s.values.forEach(v => { if (v > top) top = v; }));
    if (!(top > 0)) top = 1;
    const yStep = niceStep(top, 5), yMax = Math.ceil(top / yStep - 1e-9) * yStep;
    const X = nm => margin.l + (nm - r.min) / (r.max - r.min) * pw, Y = v => margin.t + ph - v / yMax * ph;
    svg.setAttribute('width', W); svg.setAttribute('height', H); svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    Array.from(svg.children).forEach(child => { if (child.tagName !== 'title' && child.tagName !== 'desc') child.remove(); });
    svg.append(svgEl('rect', { x: margin.l, y: margin.t, width: pw, height: ph, class: 'plot-surface' }));
    const decimals = yStep >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(yStep)));
    for (let v = 0; v <= yMax + yStep / 2; v += yStep) {
      svg.append(svgEl('line', { x1: margin.l, x2: margin.l + pw, y1: Y(v), y2: Y(v), class: v === 0 ? 'plot-axis' : 'plot-grid' }));
      svg.append(svgEl('text', { x: margin.l - 7, y: Y(v) + 4, 'text-anchor': 'end', class: 'plot-tick' }, v.toFixed(decimals)));
    }
    const xStep = niceStep(r.max - r.min, W < 520 ? 4 : 7);
    for (let nm = Math.ceil(r.min / xStep) * xStep; nm <= r.max + 1e-9; nm += xStep) {
      svg.append(svgEl('line', { x1: X(nm), x2: X(nm), y1: margin.t + ph, y2: margin.t + ph + 5, class: 'plot-axis' }));
      svg.append(svgEl('text', { x: X(nm), y: margin.t + ph + 19, 'text-anchor': 'middle', class: 'plot-tick' }, String(Number(nm.toPrecision(6)))));
    }
    svg.append(svgEl('text', { x: margin.l + pw / 2, y: H - 6, 'text-anchor': 'middle', class: 'plot-title' }, 'Wavelength in vacuum (nm)'));
    svg.append(svgEl('text', { x: 4, y: 15, class: 'plot-title' }, 'Efficiency Q (no unit)'));
    series.forEach(s => {
      let d = '';
      for (let i = 0; i < POINTS; i++) d += (i ? 'L' : 'M') + X(r.wavelength[i]).toFixed(1) + ' ' + Y(s.values[i]).toFixed(1);
      svg.append(svgEl('path', { d, fill: 'none', stroke: s.color, 'stroke-width': s.dashed ? 1.6 : 2.2, 'stroke-linejoin': 'round', 'stroke-dasharray': s.dashed ? '5 4' : 'none' }));
    });
    const px = X(r.wavelength[probeIndex]);
    svg.append(svgEl('line', { x1: px, x2: px, y1: margin.t, y2: margin.t + ph, class: 'plot-probe' }));
    series.forEach(s => { if (!s.dashed) svg.append(svgEl('circle', { cx: px, cy: Y(s.values[probeIndex]), r: 4.5, fill: s.color, class: 'plot-dot' })); });
    plot.hover = svgEl('line', { x1: 0, x2: 0, y1: margin.t, y2: margin.t + ph, class: 'plot-hover', visibility: 'hidden' });
    svg.append(plot.hover);
    plot.box = { left: margin.l, width: pw, X };
  }
  function drawLegend(plot) {
    plot.legend.replaceChildren(...plot.series.map(s => {
      const item = document.createElement('span'), mark = document.createElement('i');
      mark.style.background = s.dashed ? `repeating-linear-gradient(90deg, ${s.color} 0 5px, transparent 5px 9px)` : s.color;
      item.append(mark, s.name); return item;
    }));
  }
  function indexFromEvent(plot, event) {
    const rect = plot.svg.getBoundingClientRect(), fraction = (event.clientX - rect.left - plot.box.left) / plot.box.width;
    return Math.max(0, Math.min(POINTS - 1, Math.round(fraction * (POINTS - 1))));
  }
  function showTip(plot, index, event) {
    const rect = plot.svg.getBoundingClientRect(), x = plot.box.X(result.wavelength[index]);
    plot.hover.setAttribute('x1', x); plot.hover.setAttribute('x2', x); plot.hover.setAttribute('visibility', 'visible');
    const title = document.createElement('strong'); title.textContent = `${fmtNm(result.wavelength[index])} nm`;
    const rows = plot.series.map(s => {
      const row = document.createElement('span'), mark = document.createElement('i'), value = document.createElement('b');
      mark.style.background = s.color; value.textContent = fmt(s.values[index]);
      row.append(mark, s.name, value); return row;
    });
    plot.tip.replaceChildren(title, ...rows); plot.tip.hidden = false;
    const right = x > rect.width / 2;
    plot.tip.style.left = right ? '' : `${x + 12}px`; plot.tip.style.right = right ? `${rect.width - x + 12}px` : '';
    plot.tip.style.top = `${Math.max(4, Math.min(rect.height - plot.tip.offsetHeight - 4, event.clientY - rect.top - 20))}px`;
  }
  plots.forEach(plot => {
    const svg = plot.svg; let dragging = false;
    svg.addEventListener('pointermove', event => {
      if (!result || !plot.box) return;
      const index = indexFromEvent(plot, event);
      if (dragging) setProbe(index, true);
      if (event.pointerType === 'mouse') showTip(plot, index, event);
    });
    svg.addEventListener('pointerdown', event => { if (!result || !plot.box) return; dragging = true; setProbe(indexFromEvent(plot, event), true); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => svg.addEventListener(type, () => { dragging = false; plot.tip.hidden = true; if (plot.hover) plot.hover.setAttribute('visibility', 'hidden'); }));
    svg.addEventListener('keydown', event => {
      if (!result || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return;
      event.preventDefault();
      setProbe(Math.max(0, Math.min(POINTS - 1, probeIndex + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1))), true);
    });
  });

  /* ------------------------------------------------------------------ *
   * Results panel
   * ------------------------------------------------------------------ */
  function areaText(nm2) { return nm2 >= 1e5 ? `${fmt(nm2 / 1e6)} µm²` : `${fmt(nm2)} nm²`; }
  function renderReadout() {
    const r = result, i = probeIndex, design = r.design, isSphere = design.shape === 'sphere';
    const shadow = isSphere ? Math.PI * design.radius * design.radius : 2 * design.radius;
    const cross = isSphere ? areaText(r.qsca[i] * shadow) : `${fmt(r.qsca[i] * shadow)} nm per nm of length`;
    const items = [
      ['Selected wavelength', `${fmtNm(r.wavelength[i])} nm`],
      [`${r.material.short} index`, `n = ${fmt(r.n[i])}, k = ${fmtK(r.k[i])}`],
      ['Extinction Q', fmt(r.qext[i])], ['Scattering Q', fmt(r.qsca[i])], ['Absorption Q', fmt(r.qabs[i])],
      [isSphere ? 'Scattering cross section' : 'Scattering width', cross]
    ];
    $('readout').replaceChildren(...items.map(([label, value]) => {
      const cell = document.createElement('div'), small = document.createElement('span'), strong = document.createElement('strong');
      small.textContent = label; strong.textContent = value; cell.append(small, strong); return cell;
    }));
  }
  function renderReading() {
    const r = result, box = $('reading'); box.replaceChildren();
    const heading = document.createElement('h3'); heading.textContent = 'Reading the result'; box.append(heading);
    if (!r.peaks.length) {
      const p = document.createElement('p'); p.textContent = 'There is no scattering peak inside this wavelength range: the curve only rises or falls. Try a wider range or a different size.'; box.append(p);
    } else {
      const p = document.createElement('p'); p.textContent = 'Strongest scattering peaks in this range. Select one to move the marker and the light wave in the 3D view:'; box.append(p);
      const list = document.createElement('div'); list.className = 'peak-list';
      r.peaks.slice().sort((a, b) => a.index - b.index).forEach(peak => {
        const button = document.createElement('button'); button.type = 'button';
        button.textContent = `${fmtNm(r.wavelength[peak.index])} nm · mostly ${peak.name.toLowerCase()} (${Math.round(peak.share * 100)}% of the scattering)`;
        button.addEventListener('click', () => setProbe(peak.index, true)); list.append(button);
      });
      box.append(list);
    }
    const i = probeIndex, inside = r.wavelength[i] / r.design.medium.n, note = document.createElement('p');
    note.textContent = `At ${fmtNm(r.wavelength[i])} nm the diameter (${fmt(2 * r.design.radius)} nm) is ${fmt(2 * r.design.radius / inside, 2)} times the wavelength in the surrounding medium (${fmtNm(inside)} nm).`;
    box.append(note);
  }
  function renderTable() {
    const r = result, table = $('values-table'), step = Math.floor(POINTS / 24);
    const head = document.createElement('tr');
    ['Wavelength (nm)', 'n', 'k', 'Q extinction', 'Q scattering', 'Q absorption'].forEach(text => { const th = document.createElement('th'); th.scope = 'col'; th.textContent = text; head.append(th); });
    const rows = [head];
    for (let i = 0; i < POINTS; i += step) {
      const tr = document.createElement('tr');
      [fmtNm(r.wavelength[i]), fmt(r.n[i]), fmtK(r.k[i]), fmt(r.qext[i]), fmt(r.qsca[i]), fmt(r.qabs[i])].forEach(text => { const td = document.createElement('td'); td.textContent = text; tr.append(td); });
      rows.push(tr);
    }
    table.replaceChildren(...rows);
  }
  function polarisationText(design) {
    if (design.shape !== 'cylinder') return '';
    return design.polarization === 'unpolarized' ? ' Unpolarised light (mean of both polarisations).'
      : design.polarization === 'perpendicular' ? ' Electric field perpendicular to the cylinder axis.' : ' Electric field along the cylinder axis.';
  }
  function renderCaptions() {
    const r = result, d = r.design, isSphere = d.shape === 'sphere';
    const shadow = isSphere ? 'the geometric shadow πr²' : 'the geometric width 2r (per unit length)';
    $('caption-total').textContent = `Calculated extinction, scattering and absorption efficiency of ${A.describe(d)}, for a plane wave arriving ${isSphere ? 'from one side' : 'perpendicular to the axis'}, from ${fmtNm(r.min)} to ${fmtNm(r.max)} nm (${POINTS} wavelengths).${polarisationText(d)} Efficiency is the cross section divided by ${shadow}. Optical constants: ${r.material.source} Exact Mie calculation for one isolated particle. This is a simulation, not a measurement.`;
    $('caption-parts').textContent = isSphere
      ? 'Scattering efficiency of the same sphere, split into the first four terms of the Mie series. The dashed line is the sum of all terms. Where one coloured curve follows the dashed line, that resonance does most of the scattering.'
      : 'Scattering efficiency of the same cylinder, split into the angular orders n = 0 to 3 of the series (orders +n and −n counted together). The dashed line is the sum of all orders.';
    $('parts-heading').textContent = isSphere ? 'Which resonance does the scattering' : 'Which term of the series does the scattering';
  }
  function renderResults() {
    plots.forEach((plot, index) => { plot.series = seriesFor(index); drawLegend(plot); drawPlot(plot); });
    renderReadout(); renderReading(); renderTable(); renderCaptions();
  }
  function setProbe(index, pinned) {
    if (!result) return;
    probeIndex = index; if (pinned) probePinned = true;
    plots.forEach(drawPlot); renderReadout(); renderReading(); updateScene(false);
  }

  /* ------------------------------------------------------------------ *
   * 3D scene
   * ------------------------------------------------------------------ */
  function updateScene(refit) {
    const d = applied; if (!d) return;
    const material = (() => { try { return resolveMaterial(d.material); } catch (error) { return { color: '#7f66a7', short: 'material' }; } })();
    const exact = A.mode(d) === 'exact';
    let parts, radius, caption;
    if (d.shape === 'sphere') {
      parts = [{ mesh: 'sphere', size: [2 * d.radius, 2 * d.radius, 2 * d.radius], color: material.color }]; radius = d.radius;
      caption = `${material.short} sphere · radius ${A.formatLength(d.radius)}`;
    } else if (d.shape === 'cylinder' && d.dim === '2d') {
      parts = [{ mesh: 'cylinder', size: [2 * d.radius, 2 * d.radius, 9 * d.radius], color: material.color, fade: true }]; radius = 1.5 * d.radius;
      caption = `${material.short} cylinder · radius ${A.formatLength(d.radius)} · infinitely long along z (drawn cut, fading at the ends)`;
    } else if (d.shape === 'cylinder') {
      parts = [{ mesh: 'cylinder', size: [2 * d.radius, 2 * d.radius, d.height], color: material.color }]; radius = Math.hypot(d.radius, d.height / 2);
      caption = `${material.short} cylinder · radius ${A.formatLength(d.radius)} · height ${A.formatLength(d.height)}`;
    } else if (d.dim === '2d') {
      const long = 4.5 * Math.max(d.sx, d.sy);
      parts = [{ mesh: 'box', size: [d.sx, d.sy, long], color: material.color, fade: true }]; radius = 0.75 * Math.hypot(d.sx, d.sy);
      caption = `${material.short} rectangle · ${A.formatLength(d.sx)} × ${A.formatLength(d.sy)} · infinitely long along z (drawn cut)`;
    } else {
      parts = [{ mesh: 'box', size: [d.sx, d.sy, d.sz], color: material.color }]; radius = Math.hypot(d.sx, d.sy, d.sz) / 2;
      caption = `${material.short} box · ${A.formatLength(d.sx)} × ${A.formatLength(d.sy)} × ${A.formatLength(d.sz)} (x × y × z)`;
    }
    let light = null;
    if (exact && result) {
      const lambda = result.wavelength[probeIndex], inMedium = lambda / d.medium.n;
      const e = d.shape === 'sphere' || d.polarization === 'parallel' ? [0, 0, 1] : d.polarization === 'perpendicular' ? [0, 1, 0] : [0, 0.7071, 0.7071];
      light = { k: [1, 0, 0], e, wavelength: inMedium };
      caption += ` · light wave at ${fmtNm(lambda)} nm drawn to scale${d.medium.n !== 1 ? ` (${fmtNm(inMedium)} nm inside the medium)` : ''}`;
      if (d.shape === 'cylinder' && d.polarization === 'unpolarized') caption += ' · unpolarised: the wave is drawn at 45° only as a sketch';
    }
    $('viewer-caption').textContent = caption + '.';
    $('viewer-mode').textContent = exact ? 'Light travels along +x' : 'Shape only';
    $('view-motion').hidden = !light; $('stage-key').hidden = !light;
    if (view) view.setScene({ parts, radius, light }, refit);
  }

  /* ------------------------------------------------------------------ *
   * Apply a complete design: draw, calculate, report
   * ------------------------------------------------------------------ */
  function apply(design, options) {
    options = options || {};
    const shapeChanged = !applied || applied.shape !== design.shape || applied.dim !== design.dim;
    applied = clone(design); applied.asking = null; draft = clone(applied);
    const exact = A.mode(applied) === 'exact', sentences = [];
    $('results-error').hidden = true;
    $('results-exact').hidden = !exact; $('results-geometry').hidden = exact;
    $('results-mode').textContent = exact ? 'Exact Mie calculation · simulation' : 'Not calculated for this shape';
    result = null;
    if (exact) {
      try {
        const previous = options.keepWavelength;
        result = calculate(applied);
        if (probePinned && Number.isFinite(previous)) {
          probeIndex = Math.max(0, Math.min(POINTS - 1, Math.round((previous - result.min) / (result.max - result.min) * (POINTS - 1))));
        } else {
          probeIndex = result.peaks.length ? result.peaks[0].index : Math.floor(POINTS / 2);
        }
        renderResults();
        sentences.push(`I calculated ${POINTS} wavelengths from ${fmtNm(result.min)} to ${fmtNm(result.max)} nm with exact Mie theory.`);
        if (result.peaks.length) { const peak = result.peaks[0]; sentences.push(`The strongest scattering peak is at ${fmtNm(result.wavelength[peak.index])} nm, mostly ${peak.name.toLowerCase()} (${Math.round(peak.share * 100)}%).`); }
        result.notes.forEach(note => sentences.push(note));
        if (applied.material.kind === 'library') sentences.push(`Optical constants: ${Materials.getRecord(applied.material.id).label}.`);
      } catch (error) {
        result = null;
        $('results-error').textContent = error.message; $('results-error').hidden = false; $('results-exact').hidden = true;
        sentences.push(`I could not calculate this: ${error.message}`);
      }
    } else {
      sentences.push('This shape has no exact formula, so I draw it without a spectrum. You can download a gdsfactory layout script under “Adjust”.');
    }
    $('export-csv').disabled = !result;
    const layout = applied.shape !== 'sphere';
    $('export-python').disabled = !layout;
    $('export-note').textContent = layout ? 'The script draws the outline seen from above (along z) and saves a GDS file that opens in KLayout. It is a drawing, not a simulation.'
      : 'A sphere has no layout script: a GDS layout stores flat outlines for lithography, and a sphere is not made that way.';
    if (!options.fromControls) syncControls();
    updateScene(shapeChanged);
    return sentences;
  }

  /* ------------------------------------------------------------------ *
   * "Adjust" controls
   * ------------------------------------------------------------------ */
  const fields = {};
  ['shape', 'material', 'n', 'k', 'radius', 'radius-slider', 'height', 'sx', 'sy', 'sz', 'medium', 'pol', 'from', 'to'].forEach(name => { fields[name] = $('f-' + name); });
  function fillMaterialSelect() {
    const select = fields.material, current = select.value; select.replaceChildren();
    A.materials.filter(material => material.id).forEach(material => {
      const option = document.createElement('option'); option.value = 'lib:' + material.id;
      option.textContent = `${material.formula} · ${material.name}`; select.append(option);
    });
    if (uploaded) { const option = document.createElement('option'); option.value = 'file'; option.textContent = `Your file · ${uploaded.name}`; select.append(option); }
    const constant = document.createElement('option'); constant.value = 'constant'; constant.textContent = 'Constant index (type n and k)'; select.append(constant);
    if (current) select.value = current;
  }
  function syncControls() {
    const d = applied; if (!d) return;
    fields.shape.value = d.shape === 'sphere' ? 'sphere' : d.shape + d.dim;
    fields.material.value = d.material.kind === 'library' ? 'lib:' + d.material.id : d.material.kind;
    if (d.material.kind === 'constant') { fields.n.value = d.material.n; fields.k.value = d.material.k || 0; }
    ['radius', 'height', 'sx', 'sy', 'sz'].forEach(key => { if (d[key]) fields[key].value = Number(d[key].toPrecision(6)); });
    if (d.radius) fields['radius-slider'].value = Math.max(10, Math.min(400, d.radius));
    fields.medium.value = d.medium.n; fields.pol.value = d.polarization;
    if (result) { fields.from.value = fmtNm(result.min); fields.to.value = fmtNm(result.max); }
    showFields();
  }
  function showFields() {
    const d = applied; if (!d) return;
    const round = d.shape !== 'box', exact = A.mode(d) === 'exact';
    $('f-radius-field').hidden = !round;
    $('f-height-field').hidden = !(d.shape === 'cylinder' && d.dim === '3d');
    $('f-box-fields').hidden = round; $('f-sz-field').hidden = d.dim === '2d';
    $('f-pol-field').hidden = !(d.shape === 'cylinder' && d.dim === '2d');
    $('f-constant').hidden = d.material.kind !== 'constant';
    $('f-range-fields').hidden = !exact;
    let note = '';
    try { const material = resolveMaterial(d.material); note = d.material.kind === 'constant' ? material.source : `${material.source} Valid from ${fmtNm(material.minNm)} to ${fmtNm(material.maxNm)} nm.`; } catch (error) { note = error.message; }
    $('f-material-note').textContent = note;
    $('f-range-note').textContent = exact && result && result.notes.length ? result.notes.join(' ') : '';
  }
  function readControls(event) {
    if (!applied) return;
    const d = clone(applied), source = event && event.target;
    const shape = fields.shape.value;
    d.shape = shape === 'sphere' ? 'sphere' : shape.slice(0, -2); d.dim = shape === 'sphere' ? '3d' : shape.slice(-2);
    const material = fields.material.value;
    if (material === 'file') d.material = { kind: 'file' };
    else if (material === 'constant') {
      const n = Number(fields.n.value), k = Number(fields.k.value);
      d.material = { kind: 'constant', n: n > 0 && n <= 20 ? n : 2.4, k: k >= 0 && k <= 20 ? k : 0 };
    } else {
      const known = A.materials.find(item => 'lib:' + item.id === material);
      d.material = { kind: 'library', id: known.id, name: known.name, formula: known.formula };
    }
    if (source === fields['radius-slider']) fields.radius.value = fields['radius-slider'].value;
    ['radius', 'height', 'sx', 'sy', 'sz'].forEach(key => {
      const value = Number(fields[key].value), valid = value >= 1 && value <= 1e6;
      fields[key].setAttribute('aria-invalid', String(!valid && fields[key].value !== ''));
      d[key] = valid ? value : (d[key] || SIZE_DEFAULTS[key]);
    });
    const nMedium = Number(fields.medium.value), mediumValid = nMedium >= 1 && nMedium <= 5;
    fields.medium.setAttribute('aria-invalid', String(!mediumValid));
    if (mediumValid && nMedium !== d.medium.n) d.medium = { n: nMedium, label: nMedium === 1 ? 'air' : nMedium === 1.33 ? 'water' : 'a medium' };
    d.polarization = fields.pol.value;
    if (source === fields.from || source === fields.to) {
      const from = Number(fields.from.value), to = Number(fields.to.value);
      if (from > 0 && to > from) d.range = { min: from, max: to };
    }
    if (source === fields.material) d.range = applied.range;   // keep the user's range; it is clipped to the new material
    const keep = result ? result.wavelength[probeIndex] : NaN;
    apply(d, { fromControls: true, keepWavelength: keep });
    showFields();
    if (result && source !== fields.from && source !== fields.to) { fields.from.value = fmtNm(result.min); fields.to.value = fmtNm(result.max); }
    setChips([]);
  }
  $('adjust-form').addEventListener('input', readControls);
  $('adjust-form').addEventListener('submit', event => event.preventDefault());

  /* ------------------------------------------------------------------ *
   * Conversation
   * ------------------------------------------------------------------ */
  const chat = $('chat'), chips = $('chips'), input = $('chat-input');
  function say(role, sentences) {
    const message = document.createElement('div'); message.className = 'message ' + role;
    const who = document.createElement('span'); who.className = 'who'; who.textContent = role === 'user' ? 'You' : 'Assistant';
    message.append(who);
    sentences.forEach(sentence => { const p = document.createElement('p'); p.textContent = sentence; message.append(p); });
    chat.append(message);
    while (chat.children.length > 60) chat.firstChild.remove();
    chat.scrollTop = chat.scrollHeight;
  }
  function setChips(list) {
    chips.replaceChildren(...list.map(chip => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = chip.label;
      button.addEventListener('click', () => { if (chip.send === '@upload') $('nk-file').click(); else handle(chip.send); });
      return button;
    }));
  }
  function followUps() {
    const d = applied, list = [];
    if (d.shape !== 'box') list.push({ label: `Radius ${Math.round(d.radius * 1.3)} nm`, send: `radius ${Math.round(d.radius * 1.3)} nm` });
    list.push(d.material.kind === 'library' && d.material.id === 'tio2-siefke' ? { label: 'Make it Si', send: 'make it Si' } : { label: 'Make it TiO₂', send: 'make it TiO2' });
    list.push(d.medium.n === 1 ? { label: 'Put it in water', send: 'in water' } : { label: 'Put it in air', send: 'in air' });
    if (d.shape === 'sphere') list.push({ label: '2D cylinder instead', send: 'a 2D cylinder' });
    else list.push({ label: 'Sphere instead', send: 'a sphere' });
    return list;
  }
  function handle(text) {
    text = String(text || '').trim(); if (!text) return;
    say('user', [text]);
    const keep = result ? result.wavelength[probeIndex] : NaN;
    const out = A.interpret(text, draft, { hasFile: !!uploaded });
    draft = out.state;
    if (out.reset) probePinned = false;
    if (out.ready) { const extra = apply(draft, { keepWavelength: keep }); say('bot', out.reply.concat(extra)); setChips(followUps()); }
    else { say('bot', out.reply); setChips(out.chips); }
  }
  $('chat-form').addEventListener('submit', event => { event.preventDefault(); demoToken++; const text = input.value; input.value = ''; handle(text); });
  $('chat-help').addEventListener('click', () => { demoToken++; handle('help'); });
  $('chat-reset').addEventListener('click', () => { demoToken++; handle('start again'); });

  $('nk-file').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    demoToken++;
    try {
      if (file.size > 2e6) throw new Error('The file is larger than 2 MB.');
      const parsed = parseOpticalConstants(await file.text());
      uploaded = { name: file.name.slice(0, 60), rows: parsed.rows, minNm: parsed.minNm, maxNm: parsed.maxNm, unit: parsed.unit };
      fillMaterialSelect();
      const first = parsed.rows[0];
      say('bot', [`I read “${uploaded.name}”: ${parsed.rows.length} rows from ${fmtNm(parsed.minNm)} to ${fmtNm(parsed.maxNm)} nm. I read the wavelength column as ${parsed.unit}.`,
        `First row: ${fmtNm(first[0])} nm, n = ${fmt(first[1])}, k = ${fmtK(first[2])}. Please check that this matches your file. It stays on your device.`]);
      const out = A.interpret('use my file', draft, { hasFile: true });
      draft = out.state;
      if (out.ready) { say('bot', out.reply.concat(apply(draft, {}))); setChips(followUps()); }
      else { say('bot', out.reply); setChips(out.chips); }
    } catch (error) {
      say('bot', [`I could not use that file. ${error.message}`]);
    } finally { event.target.value = ''; }
  });

  /* ------------------------------------------------------------------ *
   * Example: types three messages so visitors can see how it works
   * ------------------------------------------------------------------ */
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  async function playExample() {
    const token = ++demoToken, steps = ['Design a 3D sphere of Si', 'radius 90 nm', 'now make it TiO2'];
    $('studio').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    draft = A.emptyState(); probePinned = false; chat.replaceChildren(); setChips([]);
    say('bot', ['Example: three messages are typed for you. Type or tap anywhere in the studio to stop.']);
    for (const step of steps) {
      await wait(reduceMotion ? 300 : 900); if (token !== demoToken) return;
      if (reduceMotion) input.value = step;
      else for (let i = 1; i <= step.length; i++) { input.value = step.slice(0, i); await wait(38); if (token !== demoToken) return; }
      await wait(reduceMotion ? 300 : 500); if (token !== demoToken) return;
      input.value = ''; handle(step);
    }
  }
  $('play-example').addEventListener('click', playExample);
  // Any typing or tapping inside the studio stops the example.
  ['pointerdown', 'keydown'].forEach(type => $('studio').addEventListener(type, event => { if (event.isTrusted) demoToken++; }));

  /* ------------------------------------------------------------------ *
   * Exports
   * ------------------------------------------------------------------ */
  function download(filename, content, type) {
    const url = URL.createObjectURL(new Blob([content], { type })), a = document.createElement('a');
    a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function spectrumCsv() {
    const r = result, d = r.design, isSphere = d.shape === 'sphere';
    const lines = [
      '# Elyvris Studio spectrum. Simulation (exact Mie theory for one isolated particle), not a measurement.',
      `# Design: ${A.describe(d)}`,
      `# Polarisation:${isSphere ? ' not relevant for a sphere' : polarisationText(d)}`,
      `# Surrounding medium index (constant): ${d.medium.n}`,
      `# Optical constants: ${r.material.source}`.replace(/\s*\n\s*/g, ' '),
      `# Efficiency Q = cross section / ${isSphere ? '(pi r^2)' : '(2 r), per unit length'}; r = ${d.radius} nm`,
      '# Size parameter x = 2 pi n_medium r / wavelength',
      '# Method: Bohren and Huffman, Absorption and Scattering of Light by Small Particles (Wiley, 1983)',
      ['wavelength_nm', 'n', 'k', 'size_parameter_x', 'Q_ext', 'Q_sca', 'Q_abs'].concat(r.names.map(name => 'Q_sca_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_'))).join(',')
    ];
    for (let i = 0; i < POINTS; i++) lines.push([r.wavelength[i], r.n[i], r.k[i], r.x[i], r.qext[i], r.qsca[i], r.qabs[i]].concat(r.parts.map(part => part[i])).map(v => Number(v.toPrecision(8))).join(','));
    return lines.join('\n') + '\n';
  }
  function layoutScript() {
    const d = applied, um = nm => Number((nm / 1000).toPrecision(9));
    const lines = [
      '# Elyvris Studio layout script. Dimensions in micrometres (um).',
      '# Requires gdsfactory. A layout is a drawing for fabrication; it does not simulate light.',
      `# Design: ${A.describe(d)}`.replace(/[^\x20-\x7E]/g, '?'),
      '# The outline is the view from above (along z), drawn on GDS layer 1/0.'];
    if (d.shape === 'cylinder' && d.dim === '3d') lines.push(`# Height ${d.height} nm is a film thickness set during fabrication; a GDS file stores only the flat outline.`);
    if (d.shape === 'box' && d.dim === '3d') lines.push(`# z size ${d.sz} nm is a film thickness set during fabrication; a GDS file stores only the flat outline.`);
    if (d.dim === '2d') lines.push('# The 2D shape is the cross-section; along z the structure is treated as infinitely long.');
    lines.push('import gdsfactory as gf', '', 'gf.gpdk.PDK.activate()', 'layout = gf.Component(name="elyvris_studio")', '');
    if (d.shape === 'cylinder') lines.push(`element = gf.components.circle(radius=${um(d.radius)}, layer=(1, 0))`, 'layout.add_ref(element)');
    else { const x = um(d.sx / 2), y = um(d.sy / 2); lines.push(`layout.add_polygon([(${-x}, ${-y}), (${x}, ${-y}), (${x}, ${y}), (${-x}, ${y})], layer=(1, 0))`); }
    lines.push('', 'layout.write_gds("elyvris_studio_layout.gds")', 'print("Saved elyvris_studio_layout.gds")', '');
    return lines.join('\n');
  }
  $('export-csv').addEventListener('click', () => { if (result) download('elyvris-studio-spectrum.csv', spectrumCsv(), 'text/csv'); });
  $('export-python').addEventListener('click', () => { if (applied && applied.shape !== 'sphere') download('elyvris_studio_layout.py', layoutScript(), 'text/x-python'); });

  /* ------------------------------------------------------------------ *
   * 3D view buttons
   * ------------------------------------------------------------------ */
  try { view = View ? View.create($('view3d'), $('view-labels')) : null; } catch (error) { view = null; }
  if (!view) { $('stage-fallback').hidden = false; $('view3d').hidden = true; $('stage-hint').hidden = true; document.querySelector('.stage-buttons').hidden = true; }
  else {
    view.setMotion(motion);
    $('view-zoom-in').addEventListener('click', () => view.zoom(1 / 1.25));
    $('view-zoom-out').addEventListener('click', () => view.zoom(1.25));
    $('view-reset').addEventListener('click', () => view.reset());
    const motionButton = $('view-motion');
    const label = () => { motionButton.textContent = motion ? 'Pause' : 'Play'; motionButton.setAttribute('aria-pressed', String(motion)); };
    motionButton.addEventListener('click', () => { motion = !motion; view.setMotion(motion); label(); }); label();
    $('view3d').addEventListener('pointerdown', () => { $('stage-hint').hidden = true; }, { once: true });
  }

  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (result) plots.forEach(drawPlot); }, 120); });

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */
  function listReferences() {
    const box = $('material-references');
    box.replaceChildren(...A.materials.filter(material => material.id).map(material => {
      const record = Materials.getRecord(material.id), item = document.createElement('p');
      const strong = document.createElement('strong'); strong.textContent = `${material.formula} · ${material.name}. `;
      const link = document.createElement('a'); link.href = record.sourceUrl; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.textContent = 'Source ↗';
      item.append(strong, `${record.citation}. ${record.conditions} Valid from ${fmtNm(record.minNm)} to ${fmtNm(record.maxNm)} nm. `, link);
      return item;
    }));
  }
  window.ElyvrisStudio = { parseOpticalConstants, layoutScript, spectrumCsv, state: () => ({ applied, draft, result, probeIndex }) };

  Materials.load().then(() => {
    fillMaterialSelect(); listReferences();
    const start = A.interpret('Design a 3D sphere of Si, radius 90 nm', null, {});
    const extra = apply(start.state, {});
    say('bot', ['Hello. Tell me what to design and I will draw it and, for a sphere or a 2D cylinder, calculate its spectrum. I know common materials by name or formula: Si is silicon, TiO2 is titanium dioxide.',
      `To start, I loaded an example: ${A.describe(applied)}.`].concat(extra.slice(1, 2)));
    setChips([{ label: 'TiO₂ 2D cylinder, radius 100 nm', send: 'Design a 2D cylinder of TiO2, radius 100 nm' }, { label: 'Gold sphere in water', send: 'Design a gold sphere, radius 40 nm, in water' }, { label: '3D cylinder', send: 'Design a 3D cylinder of TiO2, diameter 300 nm, height 150 nm' }]);
  }).catch(error => {
    say('bot', [`The material data could not be loaded (${error.message}). Please reload the page.`]);
  });
})();

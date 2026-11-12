// Material explorer for the n and k page.
// Reads the curated refractiveindex.info records through OpticalMaterials (materials.js),
// plots n(λ) and k(λ), and converts them at one wavelength into:
//   wavelength inside      λ / n
//   absorption depth       δ = λ / (4π k)          (intensity falls to 1/e)
//   normal reflectance     R = ((n−1)² + k²) / ((n+1)² + k²)   (air, one thick flat surface)
//   permittivity           ε1 = n² − k²,  ε2 = 2 n k
// No extrapolation: the wavelength range is limited to each record's measured range.
(() => {
  'use strict';
  const select = document.getElementById('ex-material');
  const slider = document.getElementById('ex-wavelength');
  const plot = document.getElementById('ex-plot');
  if (!select || !slider || !plot || !window.OpticalMaterials) return;

  const NS = 'http://www.w3.org/2000/svg';
  const $ = id => document.getElementById(id);
  const VIEW_MIN = 200, VIEW_MAX = 1600;                 // nm shown on the plot
  const box = { x0: 52, x1: 585, y0: 22, y1: 262 };
  const el = (tag, attrs, parent = plot) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    parent.appendChild(node);
    return node;
  };
  const txt = (x, y, s, attrs = {}) => { const t = el('text', { x, y, ...attrs }); t.textContent = s; return t; };

  const fmtLength = nm => {
    if (!Number.isFinite(nm) || nm > 1e9) return 'over 1 m';
    if (nm < 1000) return nm.toFixed(nm < 10 ? 1 : 0) + ' nm';
    if (nm < 1e6) return (nm / 1000).toFixed(nm < 1e4 ? 2 : 1) + ' µm';
    return (nm / 1e6).toFixed(1) + ' mm';
  };
  const fmt = (v, d) => (Math.abs(v) < 10 ** -d / 2 ? (0).toFixed(d) : v.toFixed(d));

  let record = null, samples = [], scaleY = 1;

  function regime(n, k, eps1, depth) {
    if (eps1 < 0) return 'Metal-like (ε₁ < 0): most light is reflected and what enters is absorbed within about ' + fmtLength(depth) + '. This is the regime of plasmonics.';
    if (k < 1e-3) return n >= 2
      ? 'Transparent with a high index: good for dielectric resonators, metasurfaces and waveguide cores.'
      : 'Transparent with a low index: typical of lenses, substrates, claddings and anti-reflection layers.';
    if (depth < 100) return 'Strongly absorbing: light is gone within ' + fmtLength(depth) + '. Useful for detectors and absorbers; a problem for resonators.';
    return 'Weakly absorbing: about ' + fmtLength(depth) + ' of material absorbs most of the light. Thin structures are nearly transparent, long waveguides are not.';
  }

  function drawPlot() {
    while (plot.firstChild) plot.removeChild(plot.firstChild);
    const lo = Math.max(VIEW_MIN, record.minNm), hi = Math.min(VIEW_MAX, record.maxNm);
    samples = [];
    for (let i = 0; i <= 280; i++) {
      const wl = lo + (hi - lo) * i / 280;
      try { samples.push({ wl, ...OpticalMaterials.get(record.id, wl) }); } catch (e) { /* outside a sub-range */ }
    }
    const top = Math.max(...samples.map(s => Math.max(s.n, s.k)));
    scaleY = top <= 2 ? 2 : top <= 4 ? 4 : top <= 8 ? 8 : Math.ceil(top / 4) * 4;
    const X = wl => box.x0 + (wl - VIEW_MIN) / (VIEW_MAX - VIEW_MIN) * (box.x1 - box.x0);
    const Y = v => box.y1 - v / scaleY * (box.y1 - box.y0);
    // Ultraviolet and visible bands for orientation.
    el('rect', { x: X(200), y: box.y0, width: X(400) - X(200), height: box.y1 - box.y0, fill: 'rgba(143,183,217,.07)' });
    txt(X(210), box.y0 + 14, 'ultraviolet', { 'font-size': 12 });
    el('rect', { x: X(400), y: box.y0, width: X(700) - X(400), height: box.y1 - box.y0, fill: 'rgba(245,242,235,.05)' });
    txt(X(410), box.y0 + 14, 'visible', { 'font-size': 12 });
    el('path', { d: `M${box.x0} ${box.y0}V${box.y1}H${box.x1}`, stroke: 'rgba(245,242,235,.45)', fill: 'none' });
    for (let v = 0; v <= scaleY; v += scaleY / 4) {
      el('path', { d: `M${box.x0 - 4} ${Y(v)}H${box.x1}`, stroke: 'rgba(245,242,235,.08)' });
      txt(box.x0 - 10, Y(v) + 4, String(v), { 'text-anchor': 'end' });
    }
    for (let wl = 200; wl <= 1600; wl += 200) txt(X(wl), box.y1 + 18, String(wl), { 'text-anchor': 'middle' });
    txt(box.x1, box.y1 + 34, 'wavelength (nm)', { 'text-anchor': 'end' });
    if (lo > VIEW_MIN) el('rect', { x: X(VIEW_MIN), y: box.y0, width: X(lo) - X(VIEW_MIN), height: box.y1 - box.y0, fill: 'rgba(0,0,0,.35)' });
    if (hi < VIEW_MAX) el('rect', { x: X(hi), y: box.y0, width: X(VIEW_MAX) - X(hi), height: box.y1 - box.y0, fill: 'rgba(0,0,0,.35)' });
    const line = key => 'M' + samples.map(s => X(s.wl).toFixed(1) + ' ' + Y(s[key]).toFixed(1)).join('L');
    el('path', { d: line('n'), class: 'ex-plot-n' });
    el('path', { d: line('k'), class: 'ex-plot-k' });
    txt(box.x1 - 4, box.y0 + 14, 'n', { 'text-anchor': 'end', fill: '#8FB7D9', class: 'big' });
    txt(box.x1 - 22, box.y0 + 14, 'k', { 'text-anchor': 'end', fill: '#E3A646', class: 'big' });
    plot.cursor = el('path', { stroke: '#fff', 'stroke-width': 1.2, 'stroke-dasharray': '3 3' });
    plot.dotN = el('circle', { r: 4.5, fill: '#8FB7D9' });
    plot.dotK = el('circle', { r: 4.5, fill: '#E3A646' });
    plot.X = X; plot.Y = Y;
    slider.min = String(Math.ceil(lo));
    slider.max = String(Math.floor(hi));
  }

  function update() {
    const wl = Number(slider.value);
    let value;
    try { value = OpticalMaterials.get(record.id, wl); } catch (e) { return; }
    const { n, k } = value;
    const eps1 = n * n - k * k, eps2 = 2 * n * k;
    const depth = k > 1e-7 ? wl / (4 * Math.PI * k) : Infinity;
    const R = ((n - 1) ** 2 + k * k) / ((n + 1) ** 2 + k * k);
    $('ex-wl-out').textContent = wl + ' nm';
    $('ex-n').textContent = n.toFixed(3);
    $('ex-k').textContent = k < 1e-4 ? (k === 0 ? '0' : k.toExponential(1)) : k.toFixed(k < 0.1 ? 4 : 3);
    $('ex-inside').textContent = fmtLength(wl / n);
    $('ex-depth').textContent = k === 0 ? 'no absorption in data' : fmtLength(depth);
    $('ex-r').textContent = (R * 100).toFixed(R < 0.1 ? 1 : 0) + '%';
    $('ex-eps').textContent = fmt(eps1, 2) + ' + ' + fmt(eps2, 2) + 'i';
    $('ex-regime').textContent = regime(n, k, eps1, depth);
    plot.cursor.setAttribute('d', `M${plot.X(wl)} ${box.y0}V${box.y1}`);
    plot.dotN.setAttribute('cx', plot.X(wl)); plot.dotN.setAttribute('cy', plot.Y(Math.min(n, scaleY)));
    plot.dotK.setAttribute('cx', plot.X(wl)); plot.dotK.setAttribute('cy', plot.Y(Math.min(k, scaleY)));
  }

  function choose(id) {
    record = OpticalMaterials.getRecord(id);
    drawPlot();
    const wl = Number(slider.value);
    if (wl < Number(slider.min) || wl > Number(slider.max)) slider.value = String(Math.round((Number(slider.min) + Number(slider.max)) / 2));
    const src = $('ex-source');
    src.textContent = 'Data: ' + record.label + ', ' + Math.round(record.minNm) + '–' + Math.round(record.maxNm) + ' nm. ' + (record.conditions || '') + ' ' + (record.absorptionNote || '') + ' ';
    if (record.sourceUrl) {
      const a = document.createElement('a');
      a.href = record.sourceUrl; a.textContent = 'Original publication'; a.rel = 'noopener noreferrer';
      src.appendChild(a);
    }
    update();
  }

  OpticalMaterials.load('materials-data.json').then(list => {
    select.textContent = '';
    list.forEach(rec => {
      const option = document.createElement('option');
      option.value = rec.id; option.textContent = rec.label;
      select.appendChild(option);
    });
    select.value = list.some(r => r.id === 'tio2-siefke') ? 'tio2-siefke' : list[0].id;
    select.disabled = false; slider.disabled = false;
    slider.value = '366';
    choose(select.value);
    select.addEventListener('change', () => choose(select.value));
    slider.addEventListener('input', update);
  }).catch(error => {
    $('ex-regime').textContent = 'The material data could not be loaded: ' + error.message;
  });
})();

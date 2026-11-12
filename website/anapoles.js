// Two small interactives for the anapole explainer.
// 1. Cancel the dipole: the far field of the total electric dipole D = p + (ik/c)T.
//    With r = |(ik/c)T| / |p| and phi the angle between the two terms in the complex plane,
//    |D|^2 / |p|^2 = 1 + r^2 + 2 r cos(phi). Other multipoles are left out on purpose.
// 2. Tolerance check: a Lorentzian dip of width 370/34 nm whose centre moves by
//    0.78 nm per nm of width error (slope from the end points of the thesis width scan).
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent) => {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
  };
  const text = (parent, x, y, content, cls) => {
    const node = el('text', { x, y }, parent);
    if (cls) node.setAttribute('class', cls);
    node.textContent = content;
    return node;
  };

  // ---------- 1. Cancel the dipole ----------
  const cx = document.getElementById('cx-svg');
  if (cx) {
    cx.setAttribute('viewBox', '0 0 600 300');
    const ratio = document.getElementById('cx-ratio');
    const phase = document.getElementById('cx-phase');
    const ratioOut = document.getElementById('cx-ratio-out');
    const phaseOut = document.getElementById('cx-phase-out');
    const power = document.getElementById('cx-power');

    const defs = el('defs', {}, cx);
    [['cx-a-white', '#F5F2EB'], ['cx-a-blue', '#8FB7D9'], ['cx-a-amber', '#E3A646']].forEach(([id, colour]) => {
      const m = el('marker', { id, markerWidth: 8, markerHeight: 8, refX: 6, refY: 4, orient: 'auto' }, defs);
      el('path', { d: 'M0 0L7 4L0 8Z', fill: colour }, m);
    });
    text(cx, 14, 22, 'Phase diagram (complex plane)');
    text(cx, 410, 22, 'Radiation pattern of D');
    el('path', { d: 'M380 30V285', stroke: 'rgba(245,242,235,.15)' }, cx);

    const O = { x: 150, y: 150 }, unit = 95;
    const pArrow = el('path', { stroke: '#F5F2EB', 'stroke-width': 3, 'marker-end': 'url(#cx-a-white)', fill: 'none' }, cx);
    const tArrow = el('path', { stroke: '#8FB7D9', 'stroke-width': 3, 'marker-end': 'url(#cx-a-blue)', fill: 'none' }, cx);
    const dArrow = el('path', { stroke: '#E3A646', 'stroke-width': 3, 'stroke-dasharray': '7 4', 'marker-end': 'url(#cx-a-amber)', fill: 'none' }, cx);
    const pLabel = text(cx, 0, 0, 'p', 'big');
    const tLabel = text(cx, 0, 0, '(ik/c) T', 'big');
    tLabel.style.fill = '#8FB7D9';
    const dLabel = text(cx, 0, 0, 'D', 'big');
    dLabel.style.fill = '#E3A646';

    const P = { x: 490, y: 160 }, R0 = 40, CAP = 2.3;
    el('path', { d: `M${P.x} ${P.y - 22}V${P.y + 22}`, stroke: '#F5F2EB', 'stroke-width': 2, 'marker-end': 'url(#cx-a-white)' }, cx);
    const lobe = s => {
      let d = '';
      for (let i = 0; i <= 120; i++) {
        const th = (i / 120) * 2 * Math.PI, r = s * Math.sin(th) ** 2;
        d += (i ? 'L' : 'M') + (P.x + r * Math.sin(th)).toFixed(1) + ' ' + (P.y - r * Math.cos(th)).toFixed(1);
      }
      return d + 'Z';
    };
    el('path', { d: lobe(R0), fill: 'none', stroke: 'rgba(245,242,235,.45)', 'stroke-dasharray': '3 4' }, cx);
    const pattern = el('path', { fill: 'rgba(227,166,70,.35)', stroke: '#E3A646', 'stroke-width': 1.5 }, cx);
    text(cx, 410, 285, 'dashed: p alone');
    const offScale = text(cx, 410, 268, 'off scale');

    const draw = () => {
      const r = Number(ratio.value), phi = Number(phase.value) * Math.PI / 180;
      const p = { x: O.x + unit, y: O.y };
      const t = { x: p.x + unit * r * Math.cos(phi), y: p.y - unit * r * Math.sin(phi) };
      pArrow.setAttribute('d', `M${O.x} ${O.y}L${p.x - 6} ${p.y}`);
      // When the toroidal term points back along p, draw it slightly below p so both stay visible.
      const lift = Math.cos(phi) < 0 && Math.abs(Math.sin(phi)) < 0.12 ? 9 : 0;
      tArrow.setAttribute('d', r > 0.04 ? `M${p.x} ${p.y + lift}L${t.x} ${t.y + lift}` : '');
      const dLen = Math.hypot(t.x - O.x, t.y - O.y);
      dArrow.setAttribute('d', dLen > 6 ? `M${O.x} ${O.y}L${t.x} ${t.y}` : '');
      pLabel.setAttribute('x', O.x + unit / 2 - 6); pLabel.setAttribute('y', O.y + 24);
      tLabel.setAttribute('x', (p.x + t.x) / 2 - 20); tLabel.setAttribute('y', (p.y + t.y) / 2 + (lift ? 32 : -10));
      dLabel.setAttribute('x', (O.x + t.x) / 2 - 18); dLabel.setAttribute('y', (O.y + t.y) / 2 - 8);
      dLabel.style.opacity = dLen > 14 ? 1 : 0;
      const rel = 1 + r * r + 2 * r * Math.cos(phi);
      pattern.setAttribute('d', lobe(R0 * Math.min(rel, CAP)));
      offScale.style.opacity = rel > CAP ? 1 : 0;
      ratioOut.textContent = r.toFixed(2);
      phaseOut.textContent = Math.round(Number(phase.value)) + '°';
      power.textContent = (rel < 0.0005 ? '0' : rel < 0.1 ? (rel * 100).toFixed(1) : Math.round(rel * 100)) + '%';
    };
    ratio.addEventListener('input', draw);
    phase.addEventListener('input', draw);
    document.getElementById('cx-anapole').addEventListener('click', () => { ratio.value = 1; phase.value = 180; draw(); });
    draw();
  }

  // ---------- 2. Tolerance check ----------
  const tol = document.getElementById('tol-svg');
  if (tol) {
    const slider = document.getElementById('tol-error');
    const errorOut = document.getElementById('tol-error-out');
    const shiftOut = document.getElementById('tol-shift');
    const verdict = document.getElementById('tol-verdict');
    const SLOPE = 0.78, CENTRE = 370, WIDTH = 370 / 34;   // nm per nm; nm; nm (full width at half depth)
    const x0 = 40, x1 = 540, yTop = 30, yBase = 210, L0 = 340, L1 = 400;
    const X = l => x0 + (l - L0) / (L1 - L0) * (x1 - x0);
    const Y = v => yBase - v * (yBase - yTop);
    const dip = c => l => 0.9 - 0.7 / (1 + ((l - c) / (WIDTH / 2)) ** 2);
    const curve = f => { let d = ''; for (let l = L0; l <= L1 + 1e-9; l += 0.25) d += (d ? 'L' : 'M') + X(l).toFixed(1) + ' ' + Y(f(l)).toFixed(1); return d; };

    el('path', { d: `M${x0} ${yTop}V${yBase}H${x1}`, stroke: 'rgba(245,242,235,.45)', fill: 'none' }, tol);
    [340, 355, 370, 385, 400].forEach(l => {
      el('path', { d: `M${X(l)} ${yBase}v5`, stroke: 'rgba(245,242,235,.45)' }, tol);
      text(tol, X(l) - 11, yBase + 20, String(l));
    });
    text(tol, x1 - 112, yBase + 42, 'wavelength (nm)');
    text(tol, x0, yTop - 10, 'transmission (schematic)');
    const band = el('rect', { y: yTop, height: yBase - yTop, fill: 'rgba(227,166,70,.18)' }, tol);
    const low = el('path', { fill: 'none', stroke: '#E3A646', 'stroke-width': 1.6, 'stroke-opacity': 0.75 }, tol);
    const high = el('path', { fill: 'none', stroke: '#E3A646', 'stroke-width': 1.6, 'stroke-opacity': 0.75 }, tol);
    el('path', { d: curve(dip(CENTRE)), fill: 'none', stroke: '#F5F2EB', 'stroke-width': 2, 'stroke-dasharray': '6 4' }, tol);
    el('path', { d: `M${X(CENTRE - WIDTH / 2)} ${Y(0.55) }H${X(CENTRE + WIDTH / 2)}`, stroke: '#8FB7D9', 'stroke-width': 2 }, tol);
    text(tol, X(381), Y(0.12), 'blue bar: line width ≈ 11 nm').style.fill = '#8FB7D9';
    text(tol, X(381), Y(0.12) + 18, 'dashed: as designed').style.fill = 'rgba(245,242,235,.8)';

    const draw = () => {
      const err = Number(slider.value), shift = SLOPE * err;
      errorOut.textContent = '± ' + err + ' nm';
      shiftOut.textContent = '± ' + shift.toFixed(1) + ' nm';
      band.setAttribute('x', X(CENTRE - shift));
      band.setAttribute('width', Math.max(0, X(CENTRE + shift) - X(CENTRE - shift)));
      low.setAttribute('d', err ? curve(dip(CENTRE - shift)) : '');
      high.setAttribute('d', err ? curve(dip(CENTRE + shift)) : '');
      const fraction = shift / WIDTH;
      verdict.textContent = fraction < 0.25
        ? 'Less than a quarter of the line width: the design tolerates this error.'
        : fraction < 0.5
          ? 'Up to half the line width: measure each sample and adjust the laser wavelength to it.'
          : 'More than half the line width: light at the designed wavelength may miss the resonance.';
    };
    slider.addEventListener('input', draw);
    draw();
  }
})();

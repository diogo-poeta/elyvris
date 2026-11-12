// Elyvris home page: a short animated tour in six scenes.
// Each scene draws into one SVG (800 x 420 units) and is redrawn every frame from two numbers:
//   p = progress through the scene, from 0 to 1 (drives what appears and when)
//   s = seconds since the scene started (drives the oscillations)
// The drawings are illustrations, not simulations. Scenes 2 and 3 use the textbook formulas
// for a damped wave and for two-beam interference, with rounded illustrative values.
(() => {
  'use strict';

  const dialog = document.getElementById('tour');
  const svg = document.getElementById('tour-svg');
  if (!dialog || !svg || typeof dialog.showModal !== 'function') return;

  const NS = 'http://www.w3.org/2000/svg';
  const SCENE_MS = 10000;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const TAU = Math.PI * 2;

  const $ = id => document.getElementById(id);
  const heading = $('tour-heading');
  const text = $('tour-text');
  const indexOut = $('tour-index');
  const actions = $('tour-actions');
  const playBtn = $('tour-play');
  const progress = $('tour-progress');

  // ---- small drawing helpers ----
  function el(tag, attrs = {}, parent = svg) {
    const node = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    parent.appendChild(node);
    return node;
  }
  function label(x, y, content, cls = 't-label', parent = svg) {
    const node = el('text', { x, y, class: cls }, parent);
    node.textContent = content;
    return node;
  }
  // Path through (x, f(x)) from x0 to x1.
  function curve(x0, x1, f, step = 3) {
    let d = '';
    for (let x = x0; x <= x1 + 0.01; x += step) d += (d ? 'L' : 'M') + x.toFixed(1) + ' ' + f(x).toFixed(1);
    return d;
  }
  const clamp01 = v => Math.min(1, Math.max(0, v));
  const ramp = (p, a, b) => clamp01((p - a) / (b - a));              // 0 before a, 1 after b
  const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

  // ---- the six scenes ----
  const scenes = [
    {
      title: 'Light is a wave',
      text: 'An electric and magnetic field that oscillates as it travels. Its wavelength λ sets the colour: 400 to 700 nm is visible light; below 400 nm is the ultraviolet, where most of my work happens.',
      build() {
        const lambda = 160;
        el('path', { d: 'M40 220 H760', class: 't-dash' });
        const wave = el('path', { class: 't-wave' });
        el('path', { d: `M240 96 V108 H${240 + lambda} V96`, class: 't-line' });
        const sym = label(240 + lambda / 2 - 6, 88, 'λ', 't-sym');
        label(44, 360, 'electric field', 't-small');
        label(612, 360, 'direction of travel →', 't-small');
        return (p, s) => {
          const front = 40 + 720 * ease(ramp(p, 0, 0.35));
          wave.setAttribute('d', curve(40, front, x => 220 - 90 * Math.sin(TAU * x / lambda - s * 2.4)));
          sym.style.opacity = ramp(p, 0.3, 0.45);
        };
      }
    },
    {
      title: 'Matter answers with two numbers',
      text: 'The refractive index n tells how much light slows down inside a material; the extinction coefficient k tells how fast it is absorbed. Both change with wavelength, and together they feed almost every optical simulation.',
      build() {
        // Damped wave: phase grows n times faster inside the slab, amplitude falls as exp(-k k0 x).
        const x0 = 330, x1 = 570, lambda = 120, n = 2, k = 0.12, k0 = TAU / lambda;
        el('rect', { x: x0, y: 70, width: x1 - x0, height: 300, class: 't-slab' });
        label(x0 + 12, 94, 'material', 't-small');
        label(150, 94, 'air', 't-small');
        label(650, 94, 'air', 't-small');
        const wave = el('path', { class: 't-wave' });
        const nNote = label(x0 + 12, 322, 'n = 2: wavelength shrinks to λ/n', 't-label');
        const kNote = label(x0 + 12, 348, 'k: the wave is absorbed and fades', 't-label');
        label(40, 404, 'Sketch: the light reflected at each surface is left out.', 't-small');
        const phase = x => x < x0 ? k0 * x : x < x1 ? k0 * x0 + k0 * n * (x - x0) : k0 * x0 + k0 * n * (x1 - x0) + k0 * (x - x1);
        const amp = x => x < x0 ? 1 : Math.exp(-k0 * k * (Math.min(x, x1) - x0));
        return (p, s) => {
          const front = 40 + 720 * ease(ramp(p, 0, 0.45));
          wave.setAttribute('d', curve(40, front, x => 200 - 80 * amp(x) * Math.sin(phase(x) - s * 2.4), 2));
          nNote.style.opacity = ramp(p, 0.3, 0.45);
          kNote.style.opacity = ramp(p, 0.5, 0.65);
        };
      }
    },
    {
      title: 'Thin layers make light interfere',
      text: 'Reflections from the top and the bottom of a film add up or cancel, depending on its thickness, n and k, and on the wavelength. That is why soap bubbles are coloured, and why a few nanometres matter in a coating.',
      build() {
        const top = 200, n = 2;
        const sinT = Math.sin(Math.PI / 4) / n, tanT = sinT / Math.sqrt(1 - sinT * sinT), cosT = Math.sqrt(1 - sinT * sinT);
        const film = el('rect', { x: 40, y: top, width: 380, height: 60, class: 't-slab' });
        const sub = el('rect', { x: 40, y: 260, width: 380, height: 110, class: 't-sub' });
        const subLabel = label(52, 360, 'substrate', 't-small');
        const filmLabel = label(52, top + 22, 'film, thickness d', 't-small');
        el('path', { d: `M80 60 L220 ${top}`, class: 't-wave' });
        el('path', { d: `M220 ${top} L360 60`, class: 't-wave' });
        const inside = el('path', { class: 't-wave', 'stroke-opacity': 0.7 });
        const out2 = el('path', { class: 't-wave-2' });
        label(352, 56, '1', 't-label');
        const two = label(0, 56, '2', 't-label');
        // Right: the two reflected waves and their sum.
        const xs = 480, xe = 760, lam = 70;
        label(xs, 98, 'reflection 1', 't-small');
        label(xs, 178, 'reflection 2', 't-small');
        label(xs, 268, 'what you see: their sum', 't-small');
        const w1 = el('path', { class: 't-wave' });
        const w2 = el('path', { class: 't-wave-2' });
        const ws = el('path', { class: 't-wave-sum' });
        const bar = el('rect', { x: xs, y: 380, height: 8, rx: 4, fill: '#E3A646' });
        label(xs, 372, 'reflected brightness', 't-small');
        return (p, s) => {
          const d = 50 + 32 * Math.sin(s * 0.75);                     // drawn thickness in SVG units
          film.setAttribute('height', d.toFixed(1));
          sub.setAttribute('y', (top + d).toFixed(1));
          sub.setAttribute('height', (370 - top - d).toFixed(1));
          const bx = 220 + d * tanT, ex = 220 + 2 * d * tanT;
          inside.setAttribute('d', `M220 ${top} L${bx.toFixed(1)} ${(top + d).toFixed(1)} L${ex.toFixed(1)} ${top}`);
          out2.setAttribute('d', `M${ex.toFixed(1)} ${top} L${(ex + 140).toFixed(1)} 60`);
          two.setAttribute('x', (ex + 146).toFixed(1));
          // Extra optical path 2 n d cos(theta_t), with 1 drawn unit = 2 nm and a 500 nm wavelength.
          const dPhi = TAU * (2 * n * d * 2 * cosT) / 500;
          const a1 = 0.55, a2 = 0.45, w = s * 2.4;
          const show = ramp(p, 0.15, 0.35);
          w1.setAttribute('d', curve(xs, xe, x => 125 - 26 * a1 / 0.55 * Math.sin(TAU * x / lam - w)));
          w2.setAttribute('d', curve(xs, xe, x => 205 - 26 * a2 / 0.55 * Math.sin(TAU * x / lam - w - dPhi)));
          ws.setAttribute('d', curve(xs, xe, x => 315 - 26 / 0.55 * (a1 * Math.sin(TAU * x / lam - w) + a2 * Math.sin(TAU * x / lam - w - dPhi))));
          const brightness = (a1 * a1 + a2 * a2 + 2 * a1 * a2 * Math.cos(dPhi)) / ((a1 + a2) ** 2);
          bar.setAttribute('width', (280 * brightness).toFixed(1));
          [w1, w2, ws, bar].forEach(node => { node.style.opacity = show; });
          filmLabel.setAttribute('y', (top + Math.min(22, d - 6)).toFixed(1));
          subLabel.style.opacity = 1;
        };
      }
    },
    {
      title: 'Small particles resonate',
      text: 'Light drives currents inside a nanoparticle. Split into multipoles, two of them, the electric and the toroidal dipole, can cancel each other outside. Scattering drops while light stays inside: the anapole state, which I studied in TiO₂ under ultraviolet light.',
      build() {
        const cx = 250, cy = 210, R = 78;
        const defs = el('defs');
        const glow = el('radialGradient', { id: 'tour-glow' }, defs);
        el('stop', { offset: '0', 'stop-color': '#E3A646', 'stop-opacity': '0.75' }, glow);
        el('stop', { offset: '1', 'stop-color': '#E3A646', 'stop-opacity': '0' }, glow);
        const fronts = [0, 1, 2, 3].map(() => el('path', { class: 't-line' }));
        const rings = [0, 1, 2, 3].map(() => el('circle', { cx, cy, fill: 'none', stroke: '#E3A646', 'stroke-width': 2 }));
        el('circle', { cx, cy, r: R, class: 't-slab' });
        el('circle', { cx, cy, r: R - 8, fill: 'url(#tour-glow)' });
        const loops = [-36, 36].map(dx => el('circle', { cx: cx + dx, cy, r: 22, fill: 'none', stroke: '#8FB7D9', 'stroke-width': 2.4, 'stroke-dasharray': '10 6' }));
        const arrow = el('path', { fill: 'none', stroke: '#fff', 'stroke-width': 3, 'stroke-linecap': 'round' });
        const pLabel = label(cx + 96, cy - 40, 'p  electric dipole', 't-label');
        const tLabel = label(cx + 96, cy - 14, 'T  toroidal dipole', 't-label');
        tLabel.setAttribute('fill', '#8FB7D9');
        // Right: two bars, light scattered out and light kept inside.
        const bx = 600, base = 340;
        el('path', { d: `M${bx - 10} ${base} H770`, class: 't-line' });
        const outBar = el('rect', { x: bx, width: 50, fill: '#E3A646' });
        const inBar = el('rect', { x: bx + 90, width: 50, fill: '#E9E4D8', 'fill-opacity': 0.75 });
        label(bx - 10, base + 24, 'scattered', 't-small');
        label(bx + 82, base + 24, 'inside', 't-small');
        const verdict = label(cx - 90, 392, 'Anapole: outside, the two dipoles cancel.', 't-label');
        return (p, s) => {
          const T = ease(ramp(p, 0.25, 0.7));                 // toroidal dipole grows in
          const scatter = Math.max(0.06, 1 - 0.94 * T);       // far field ~ |p + (toroidal term)|
          fronts.forEach((node, i) => {
            const x = 30 + ((s * 55 + i * 40) % 140);
            node.setAttribute('d', `M${x.toFixed(1)} 110 V310`);
            node.style.opacity = 0.7 * (1 - (x - 30) / 160);
          });
          rings.forEach((node, i) => {
            const r = R + ((s * 45 + i * 55) % 220);
            node.setAttribute('r', r.toFixed(1));
            node.style.opacity = (scatter * (1 - (r - R) / 220) * 0.9).toFixed(3);
          });
          const len = 46 * Math.cos(s * 3);
          arrow.setAttribute('d', `M${cx} ${cy + len / 2} V${cy - len / 2} M${cx - 7} ${cy - len / 2 + Math.sign(len) * 9} L${cx} ${cy - len / 2} L${cx + 7} ${cy - len / 2 + Math.sign(len) * 9}`);
          loops.forEach((node, i) => {
            node.style.opacity = T;
            node.setAttribute('stroke-dashoffset', ((i ? 1 : -1) * s * 30 * Math.cos(s * 3)).toFixed(1));
          });
          tLabel.style.opacity = T;
          outBar.setAttribute('height', (150 * scatter).toFixed(1));
          outBar.setAttribute('y', (base - 150 * scatter).toFixed(1));
          inBar.setAttribute('height', '130');
          inBar.setAttribute('y', String(base - 130));
          verdict.style.opacity = ramp(p, 0.7, 0.82);
          pLabel.style.opacity = 1;
        };
      }
    },
    {
      title: 'Design what can be made',
      text: 'Real fabrication rounds corners and shifts sizes by nanometres. Before choosing a complex design, check how far its resonance moves within those tolerances, and whether a similar structure has already been made.',
      build() {
        // Fixed small offsets so the "fabricated" array looks irregular but the same every time.
        const jitter = [[3, -4], [-5, 2], [4, 5], [-2, -5], [5, 1], [-4, 4]];
        const designed = [], made = [];
        label(40, 80, 'as designed', 't-small');
        label(280, 80, 'as fabricated', 't-small');
        for (let i = 0; i < 6; i++) {
          const col = i % 3, row = Math.floor(i / 3);
          designed.push(el('rect', { x: 40 + col * 66, y: 100 + row * 96, width: 44, height: 70, class: 't-slab' }));
          made.push(el('rect', { x: 280 + col * 66, y: 100 + row * 96, width: 44, height: 70, fill: '#E9E4D8', 'fill-opacity': 0.22, stroke: '#E9E4D8', 'stroke-opacity': 0.6 }));
        }
        const px = 520, pw = 250, py = 90, ph = 220;
        el('path', { d: `M${px} ${py} V${py + ph} H${px + pw}`, class: 't-line' });
        label(px + pw - 108, py + ph + 22, 'wavelength →', 't-small');
        label(px, py - 12, 'reflection', 't-small');
        const band = el('rect', { y: py, height: ph, fill: '#E3A646', 'fill-opacity': 0.12 });
        const bandLabel = label(px + 8, py + ph + 44, 'shaded: where the resonance can land', 't-small');
        const lorentz = x0 => x => py + 30 + 150 / (1 + ((x - x0) / 16) ** 2);
        const centre = px + 130;
        el('path', { d: curve(px + 4, px + pw, lorentz(centre), 2), class: 't-dash' });
        const real = el('path', { class: 't-wave' });
        return (p, s) => {
          const m = ease(ramp(p, 0.1, 0.45));
          made.forEach((node, i) => {
            const col = i % 3, row = Math.floor(i / 3);
            const [dw, dh] = jitter[i];
            node.setAttribute('rx', (12 * m).toFixed(1));
            node.setAttribute('x', (280 + col * 66 - dw * m / 2).toFixed(1));
            node.setAttribute('y', (100 + row * 96 - dh * m / 2).toFixed(1));
            node.setAttribute('width', (44 + dw * m).toFixed(1));
            node.setAttribute('height', (70 + dh * m).toFixed(1));
          });
          const spread = 30 * ramp(p, 0.4, 0.6);
          band.setAttribute('x', (centre - spread).toFixed(1));
          band.setAttribute('width', (2 * spread).toFixed(1));
          bandLabel.style.opacity = ramp(p, 0.5, 0.65);
          real.setAttribute('d', curve(px + 4, px + pw, lorentz(centre + spread * Math.sin(s * 1.4)), 2));
          real.style.opacity = ramp(p, 0.35, 0.5);
        };
      }
    },
    {
      title: 'Learn, design, check',
      text: 'Elyvris brings these steps together: the physics in plain words, free tools that turn a sketch into gdsfactory, KLayout and Meep code, and published research with every claim linked to its source.',
      build() {
        const defs = el('defs');
        const mask = el('mask', { id: 'tour-cut', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 320, height: 340 }, defs);
        const pathD = 'M214 12L181 100V155L157 214V250L135 310';
        el('rect', { width: 320, height: 340, fill: 'white' }, mask);
        el('path', { d: pathD, stroke: 'black', 'stroke-width': 23, 'stroke-linejoin': 'round', fill: 'none' }, mask);
        const logo = el('g', { transform: 'translate(60 44) scale(0.98)' });
        const layers = el('g', { mask: 'url(#tour-cut)' }, logo);
        const shapes = [
          ['M32 103L176 34L289 91L145 161Z', '#F2EEE5', -60],
          ['M57 151L145 195L267 136V176L145 235L57 191Z', '#A38CD9', 0],
          ['M83 235L145 266L242 219V256L145 303L83 272Z', '#F2EEE5', 60]
        ].map(([d, fill, from]) => ({ node: el('path', { d, fill }, layers), from }));
        const beam = el('path', { d: pathD, stroke: '#EFB653', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'square', fill: 'none' }, logo);
        const beamLength = 330;
        beam.setAttribute('stroke-dasharray', String(beamLength));
        const word = label(440, 120, 'Elyvris', 't-sym');
        word.style.font = '500 46px var(--serif)';
        const items = [
          ['Learn', 'the physics, in plain words'],
          ['Design', 'sketch in Studio, export to gdsfactory and Meep'],
          ['Check', 'against published, referenced work']
        ].map(([a, b], i) => {
          const g = el('g', { transform: `translate(440 ${190 + i * 62})` });
          label(0, 0, a, 't-label', g).setAttribute('fill', '#E3A646');
          label(0, 24, b, 't-small', g);
          return g;
        });
        return (p) => {
          shapes.forEach(({ node, from }, i) => {
            const t = ease(ramp(p, 0.04 + i * 0.08, 0.3 + i * 0.08));
            node.setAttribute('transform', `translate(0 ${(from * (1 - t)).toFixed(1)})`);
            node.style.opacity = t;
          });
          beam.setAttribute('stroke-dashoffset', (beamLength * (1 - ease(ramp(p, 0.3, 0.55)))).toFixed(1));
          word.style.opacity = ramp(p, 0.35, 0.5);
          items.forEach((g, i) => { g.style.opacity = ramp(p, 0.5 + i * 0.1, 0.6 + i * 0.1); });
        };
      }
    }
  ];

  // ---- player ----
  let index = 0, update = null, elapsed = 0, last = 0, playing = false, frame = 0;

  $('tour-total').textContent = String(scenes.length);
  const bars = scenes.map((_, i) => {
    const seg = document.createElement('span');
    const fill = document.createElement('i');
    seg.appendChild(fill);
    seg.addEventListener('click', () => { go(i); });
    progress.appendChild(seg);
    return fill;
  });

  function render() {
    const p = clamp01(elapsed / SCENE_MS);
    update(p, reduceMotion && !playing ? 1.3 : elapsed / 1000);
    bars.forEach((fill, i) => { fill.style.width = i < index ? '100%' : i > index ? '0%' : (p * 100).toFixed(1) + '%'; });
  }

  function go(i) {
    index = Math.max(0, Math.min(scenes.length - 1, i));
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const scene = scenes[index];
    update = scene.build();
    heading.textContent = scene.title;
    text.textContent = scene.text;
    indexOut.textContent = String(index + 1);
    actions.hidden = index !== scenes.length - 1;
    elapsed = reduceMotion && !playing ? SCENE_MS : 0;
    render();
  }

  function setPlaying(on) {
    playing = on;
    const atEnd = index === scenes.length - 1 && elapsed >= SCENE_MS;
    playBtn.textContent = on ? '❚❚' : atEnd ? '↻' : '▶';
    playBtn.setAttribute('aria-label', on ? 'Pause' : atEnd ? 'Play again' : 'Play');
    cancelAnimationFrame(frame);
    if (on) { last = performance.now(); frame = requestAnimationFrame(tick); }
  }

  function tick(now) {
    elapsed += Math.min(100, now - last);   // cap the step so a background tab does not skip scenes
    last = now;
    if (elapsed >= SCENE_MS) {
      if (index < scenes.length - 1) { go(index + 1); }
      else { elapsed = SCENE_MS; render(); setPlaying(false); return; }
    }
    render();
    frame = requestAnimationFrame(tick);
  }

  function open() {
    dialog.showModal();
    go(0);
    setPlaying(!reduceMotion);
  }

  document.querySelectorAll('[aria-controls="tour"]').forEach(button => button.addEventListener('click', open));
  dialog.querySelector('.tour-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => { cancelAnimationFrame(frame); playing = false; });
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  $('tour-prev').addEventListener('click', () => { go(index - 1); if (playing) setPlaying(true); });
  $('tour-next').addEventListener('click', () => { go(index + 1); if (playing) setPlaying(true); });
  playBtn.addEventListener('click', () => {
    if (playing) { setPlaying(false); return; }
    if (index === scenes.length - 1 && elapsed >= SCENE_MS) go(0);
    else if (reduceMotion && elapsed >= SCENE_MS) elapsed = 0;
    setPlaying(true);
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); $('tour-next').click(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); $('tour-prev').click(); }
  });
})();

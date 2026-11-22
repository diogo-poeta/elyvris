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
      title: 'Elyvris',
      text: 'Elyvris is an open project in computational photonics: how light behaves when it meets structures smaller than its wavelength, such as nanoparticles, thin films and metasurfaces.',
      build() {
        const cx = 470, cy = 210, R = 34, lambda = 120;
        const defs = el('defs');
        const glow = el('radialGradient', { id: 'tour-glow-1' }, defs);
        el('stop', { offset: '0', 'stop-color': '#E3A646', 'stop-opacity': '0.8' }, glow);
        el('stop', { offset: '1', 'stop-color': '#E3A646', 'stop-opacity': '0' }, glow);
        const rings = [0, 1, 2, 3].map(() => el('circle', { cx, cy, fill: 'none', stroke: '#E3A646', 'stroke-width': 2 }));
        el('path', { d: `M40 ${cy} H${cx - R}`, class: 't-dash' });
        const wave = el('path', { class: 't-wave' });
        el('circle', { cx, cy, r: R, class: 't-slab' });
        const core = el('circle', { cx, cy, r: R - 4, fill: 'url(#tour-glow-1)' });
        const lightLabel = label(48, 128, 'light, wavelength λ', 't-label');
        const partLabel = label(cx - 112, cy + R + 42, 'a particle smaller than λ', 't-label');
        const outLabel = label(626, 96, 'scattered light', 't-small');
        return (p, s) => {
          const front = 40 + (cx - R - 40) * ease(ramp(p, 0, 0.3));
          wave.setAttribute('d', curve(40, front, x => cy - 44 * Math.sin(TAU * x / lambda - s * 2.4)));
          const on = ramp(p, 0.28, 0.4);
          rings.forEach((node, i) => {
            const r = R + ((s * 48 + i * 60) % 240);
            node.setAttribute('r', r.toFixed(1));
            node.style.opacity = (on * (1 - (r - R) / 240) * 0.9).toFixed(3);
          });
          core.style.opacity = (on * (0.6 + 0.4 * Math.cos(s * 2.4))).toFixed(3);
          lightLabel.style.opacity = ramp(p, 0.08, 0.2);
          partLabel.style.opacity = ramp(p, 0.3, 0.42);
          outLabel.style.opacity = ramp(p, 0.5, 0.62);
        };
      }
    },
    {
      title: 'One question',
      text: 'Give a material, a shape and a wavelength. Which resonance will appear: a plasmon in a metal, an electric or magnetic Mie mode in a dielectric, an anapole, a Fano or a Kerker effect?',
      build() {
        const cards = [
          ['material', 'Au, Si, TiO₂ …'],
          ['shape', 'sphere, disk, rod …'],
          ['wavelength', '300 to 1200 nm']
        ].map(([a, b], i) => {
          const g = el('g');
          el('rect', { x: 40, y: 92 + i * 86, width: 200, height: 62, rx: 10, class: 't-slab' }, g);
          label(58, 118 + i * 86, a, 't-label', g).setAttribute('fill', '#E3A646');
          label(58, 140 + i * 86, b, 't-small', g);
          return g;
        });
        const arrows = [0, 1, 2].map(i => el('path', { d: `M248 ${123 + i * 86} L350 210`, class: 't-line' }));
        const box = el('g');
        el('rect', { x: 354, y: 150, width: 120, height: 120, rx: 14, fill: 'rgba(227,166,70,.12)', stroke: '#E3A646', 'stroke-width': 1.5 }, box);
        const q = label(395, 232, '?', 't-sym', box);
        q.style.font = 'italic 64px var(--serif)';
        const out = el('path', { d: 'M482 210 H540', class: 't-line' });
        const names = ['plasmon', 'electric dipole (Mie)', 'magnetic dipole (Mie)', 'anapole', 'Fano line shape', 'Kerker effect']
          .map((n, i) => label(556, 84 + i * 54, n, 't-label'));
        return (p, s) => {
          cards.forEach((g, i) => {
            const t = ease(ramp(p, 0.02 + i * 0.07, 0.2 + i * 0.07));
            g.setAttribute('transform', `translate(${(-30 * (1 - t)).toFixed(1)} 0)`);
            g.style.opacity = t;
          });
          arrows.forEach(a => { a.style.opacity = ramp(p, 0.3, 0.38); });
          box.style.opacity = ramp(p, 0.32, 0.42);
          out.style.opacity = ramp(p, 0.42, 0.48);
          const lit = Math.floor(s * 1.2) % names.length;
          names.forEach((node, i) => {
            const shown = ramp(p, 0.45 + i * 0.06, 0.5 + i * 0.06);
            node.style.opacity = shown;
            node.setAttribute('fill', p > 0.85 && i === lit ? '#E3A646' : 'rgba(233,228,216,.85)');
          });
        };
      }
    },
    {
      title: 'Physics first',
      text: 'Today each answer needs its own simulation and an expert to read it. We know of no tool that gives the resonance type directly. Elyvris starts from exact solutions, splits them into multipoles, and names each resonance with written, versioned rules.',
      build() {
        const step = (x, w, title, sub) => {
          const g = el('g');
          el('rect', { x, y: 110, width: w, height: 150, rx: 12, class: 't-slab' }, g);
          label(x + 14, 136, title, 't-label', g).setAttribute('fill', '#E3A646');
          label(x + 14, 156, sub, 't-small', g);
          return g;
        };
        const s1 = step(30, 160, 'exact solution', 'Mie theory, spheres');
        // A small spectrum inside the first box.
        el('path', { d: curve(46, 176, x => 236 - 56 / (1 + ((x - 120) / 12) ** 2) - 20 / (1 + ((x - 78) / 8) ** 2), 2), class: 't-wave' }, s1);
        const s2 = step(230, 170, 'multipoles', 'how much of each');
        const bars = [['ED', 0.35, '#E3A646'], ['MD', 0.9, '#8FB7D9'], ['EQ', 0.25, '#E9E4D8'], ['MQ', 0.5, '#A38CD9']].map(([n, h, c], i) => {
          const r = el('rect', { x: 250 + i * 36, width: 22, fill: c, 'fill-opacity': 0.8 }, s2);
          label(250 + i * 36, 252, n, 't-small', s2);
          return { r, h };
        });
        const s3 = step(440, 140, 'rule', 'written, versioned');
        label(454, 196, 'if … and …', 't-small', s3);
        label(454, 216, 'then: name it', 't-small', s3);
        const s4 = step(620, 150, 'label', 'named by the rule');
        const tag = label(634, 210, 'anapole, 680 nm', 't-label', s4);
        tag.setAttribute('fill', '#fff');
        label(634, 232, '(example)', 't-small', s4);
        const arrows = [[194, 226], [404, 436], [584, 616]].map(([a, b]) => el('path', { d: `M${a} 185 H${b} M${b - 7} 179 L${b} 185 L${b - 7} 191`, class: 't-line' }));
        const check = label(30, 330, 'Checked against exact theory and published results:', 't-small');
        const refs = label(30, 354, 'Bohren & Huffman · Fu et al. 2013 (Si) · Miroshnichenko et al. 2015 (anapole)', 't-label');
        return (p, s) => {
          [s1, s2, s3, s4].forEach((g, i) => { g.style.opacity = ramp(p, 0.04 + i * 0.14, 0.14 + i * 0.14); });
          arrows.forEach((a, i) => { a.style.opacity = ramp(p, 0.12 + i * 0.14, 0.18 + i * 0.14); });
          bars.forEach(({ r, h }, i) => {
            const hh = 70 * h * (0.85 + 0.15 * Math.sin(s * 1.5 + i)) * ease(ramp(p, 0.2, 0.32));
            r.setAttribute('y', (234 - hh).toFixed(1));
            r.setAttribute('height', hh.toFixed(1));
          });
          check.style.opacity = refs.style.opacity = ramp(p, 0.65, 0.78);
        };
      }
    },
    {
      title: 'The Resonance Atlas',
      text: 'The first Atlas covers spheres: seven materials (Au, Ag, Al, Si, Ge, GaP, TiO₂) in air, water and silica, radius 5 to 300 nm, wavelength 300 to 1200 nm. That is about 8 000 spectra, being computed now. Its methods already match the published silicon and anapole results to within 2 nm.',
      build() {
        // Map: wavelength (x) against radius (y). Bands follow the rough rule λ ≈ c·r of a high-index sphere.
        const X0 = 90, X1 = 590, Y0 = 360, Y1 = 70;
        const xOf = l => X0 + (X1 - X0) * (l - 300) / 900;
        const yOf = r => Y0 - (Y0 - Y1) * (r - 5) / 295;
        const defs = el('defs');
        const clip = el('clipPath', { id: 'tour-atlas-clip' }, defs);
        const clipRect = el('rect', { x: X0, y: Y1, height: Y0 - Y1, width: 0 }, clip);
        el('rect', { x: X0, y: Y1, width: X1 - X0, height: Y0 - Y1, class: 't-sub' });
        const bandsG = el('g', { 'clip-path': 'url(#tour-atlas-clip)' });
        const bands = [
          ['magnetic dipole', 7.0, '#8FB7D9'],
          ['electric dipole', 5.2, '#E3A646'],
          ['anapole', 3.9, '#A38CD9'],
          ['magnetic quadrupole', 4.6, '#E9E4D8']
        ];
        bands.forEach(([, c, colour]) => {
          let d = '';
          for (let r = 5; r <= 300; r += 3) {
            const l = c * r;
            if (l < 300 || l > 1200) continue;
            d += (d ? 'L' : 'M') + xOf(l).toFixed(1) + ' ' + yOf(r).toFixed(1);
          }
          el('path', { d, fill: 'none', stroke: colour, 'stroke-width': 9, 'stroke-opacity': 0.55, 'stroke-linecap': 'round' }, bandsG);
        });
        const scan = el('path', { stroke: '#E3A646', 'stroke-width': 1.5 });
        label(X1 - 128, Y0 + 26, 'wavelength (nm) →', 't-small');
        label(X0 - 4, Y0 + 26, '300', 't-small');
        label(X1 - 30, Y0 + 44, '1200', 't-small');
        const ry = label(X0 - 76, Y1 + 10, 'radius', 't-small');
        label(X0 - 76, Y1 + 28, '300 nm', 't-small');
        label(X0 - 70, Y0, '5 nm', 't-small');
        ry.setAttribute('fill', 'rgba(233,228,216,.6)');
        const legend = bands.map(([name, , colour], i) => {
          const g = el('g', { transform: `translate(612 ${96 + i * 34})` });
          el('rect', { x: 0, y: -10, width: 18, height: 10, rx: 2, fill: colour, 'fill-opacity': 0.75 }, g);
          label(26, 0, name, 't-small', g);
          return g;
        });
        label(612, 262, 'one material,', 't-small');
        label(612, 280, 'one medium', 't-small');
        label(X0, 50, 'Sketch, not Atlas data.', 't-small');
        return (p) => {
          const w = (X1 - X0) * ease(ramp(p, 0.05, 0.75));
          clipRect.setAttribute('width', w.toFixed(1));
          scan.setAttribute('d', `M${(X0 + w).toFixed(1)} ${Y1} V${Y0}`);
          scan.style.opacity = p < 0.78 ? 1 : 1 - ramp(p, 0.78, 0.86);
          legend.forEach((g, i) => { g.style.opacity = ramp(p, 0.2 + i * 0.1, 0.3 + i * 0.1); });
        };
      }
    },
    {
      title: 'The Studio',
      text: 'Draw a nanostructure in 3D, in the browser, with nothing to install. The Studio writes the matching gdsfactory, KLayout and Meep code, saves a .gds layout and exports a figure for a paper.',
      build() {
        // Isometric view: screen = (x - y)·cos30, (x + y)·sin30 - z.
        const k = 26, ox = 220, oy = 150;
        const iso = (x, y, z = 0) => [ox + (x - y) * 0.866 * k, oy + (x + y) * 0.5 * k - z * k];
        const pt = a => a.map(v => v.toFixed(1)).join(' ');
        for (let i = -4; i <= 4; i++) {
          el('path', { d: `M${pt(iso(i, -4))} L${pt(iso(i, 4))}`, class: 't-dash' });
          el('path', { d: `M${pt(iso(-4, i))} L${pt(iso(4, i))}`, class: 't-dash' });
        }
        // Waveguide: a long box.
        const box = (x0, x1, y0, y1, h) => {
          const g = el('g');
          const face = (pts, op) => el('path', { d: 'M' + pts.map(q => pt(iso(...q))).join(' L') + 'Z', fill: '#E9E4D8', 'fill-opacity': op, stroke: 'rgba(233,228,216,.6)', 'stroke-width': 1 }, g);
          face([[x1, y0, 0], [x1, y1, 0], [x1, y1, h], [x1, y0, h]], 0.18);
          face([[x0, y1, 0], [x1, y1, 0], [x1, y1, h], [x0, y1, h]], 0.28);
          face([[x0, y0, h], [x1, y0, h], [x1, y1, h], [x0, y1, h]], 0.42);
          return g;
        };
        const guide = box(-3.5, 3.5, 1.6, 2.4, 0.8);
        // Disk: a short cylinder.
        const disk = el('g');
        const [dx, dy] = iso(-0.6, -1.2), dz = 0.8 * k, rx = 1.6 * k * 1.2247, ry = 1.6 * k * 0.7071;
        el('path', { d: `M${dx - rx} ${dy} V${dy - dz} A${rx} ${ry} 0 0 0 ${dx + rx} ${dy - dz} V${dy} A${rx} ${ry} 0 0 1 ${dx - rx} ${dy} Z`, fill: '#E3A646', 'fill-opacity': 0.35, stroke: '#E3A646', 'stroke-width': 1.2 }, disk);
        el('ellipse', { cx: dx, cy: dy - dz, rx, ry, fill: '#E3A646', 'fill-opacity': 0.55, stroke: '#E3A646', 'stroke-width': 1.2 }, disk);
        // Code panel.
        el('rect', { x: 440, y: 64, width: 330, height: 250, rx: 10, fill: 'rgba(0,0,0,.25)', stroke: 'rgba(233,228,216,.25)' });
        const lines = [
          ['# gdsfactory', 1],
          ['c = gf.Component()', 0],
          ['c << gf.components.circle(radius=0.6)', 0],
          ['c << gf.components.straight(length=7)', 0],
          ['', 0],
          ['# Meep', 1],
          ['mp.Cylinder(radius=0.6, height=0.22,', 0],
          ['            material=mp.Medium(index=3.5))', 0]
        ];
        const code = lines.map(([t, comment], i) => {
          const node = label(456, 92 + i * 26, '', 't-small');
          node.style.font = '12.5px ui-monospace, SFMono-Regular, Consolas, monospace';
          node.setAttribute('fill', comment ? '#8FB7D9' : 'rgba(233,228,216,.9)');
          return { node, t };
        });
        const total = lines.reduce((n, [t]) => n + t.length, 0);
        const tags = ['.gds layout', 'paper figure', 'no install'].map((t, i) => {
          const g = el('g', { transform: `translate(${440 + i * 114} 342)` });
          el('rect', { x: 0, y: 0, width: 104, height: 30, rx: 15, fill: 'none', stroke: '#E3A646', 'stroke-width': 1.2 }, g);
          const tx = label(14, 20, t, 't-small', g);
          tx.setAttribute('fill', '#E3A646');
          return g;
        });
        return (p) => {
          [guide, disk].forEach((g, i) => {
            const t = ease(ramp(p, 0.05 + i * 0.12, 0.25 + i * 0.12));
            g.style.opacity = t;
            g.setAttribute('transform', `translate(0 ${(-24 * (1 - t)).toFixed(1)})`);
          });
          let left = Math.floor(total * ramp(p, 0.25, 0.7));
          code.forEach(({ node, t }) => {
            const n = Math.min(t.length, left);
            node.textContent = t.slice(0, n);
            left -= n;
          });
          tags.forEach((g, i) => { g.style.opacity = ramp(p, 0.72 + i * 0.05, 0.8 + i * 0.05); });
        };
      }
    },
    {
      title: 'Where it is going',
      text: 'Next: a predictor trained on the Atlas and tested on materials it has never seen, then other shapes, then agents that run and check the pipeline. Every answer stays traceable to the physics.',
      build() {
        // Roadmap along the top.
        const stops = ['Atlas of spheres', 'predictor', 'other shapes', 'agents'];
        el('path', { d: 'M110 50 H690', class: 't-dash' });
        const road = stops.map((name, i) => {
          const g = el('g', { transform: `translate(${110 + i * 193} 50)` });
          el('circle', { r: 7, fill: i === 0 ? '#E3A646' : 'none', stroke: i === 0 ? '#E3A646' : 'rgba(233,228,216,.6)', 'stroke-width': 1.5 }, g);
          const t = label(-46, 30, name, 't-small', g);
          if (i === 0) { t.setAttribute('fill', '#E3A646'); label(-46, 48, 'now', 't-small', g); }
          return g;
        });
        // The Elyvris mark assembles, as in the old last scene.
        const defs = el('defs');
        const mask = el('mask', { id: 'tour-cut', maskUnits: 'userSpaceOnUse', x: 0, y: 0, width: 320, height: 340 }, defs);
        const pathD = 'M214 12L181 100V155L157 214V250L135 310';
        el('rect', { width: 320, height: 340, fill: 'white' }, mask);
        el('path', { d: pathD, stroke: 'black', 'stroke-width': 23, 'stroke-linejoin': 'round', fill: 'none' }, mask);
        const logo = el('g', { transform: 'translate(150 128) scale(0.8)' });
        const layers = el('g', { mask: 'url(#tour-cut)' }, logo);
        const shapes = [
          ['M32 103L176 34L289 91L145 161Z', '#F2EEE5', -60],
          ['M57 151L145 195L267 136V176L145 235L57 191Z', '#A38CD9', 0],
          ['M83 235L145 266L242 219V256L145 303L83 272Z', '#F2EEE5', 60]
        ].map(([d, fill, from]) => ({ node: el('path', { d, fill }, layers), from }));
        const beam = el('path', { d: pathD, stroke: '#EFB653', 'stroke-width': 7, 'stroke-linejoin': 'round', 'stroke-linecap': 'square', fill: 'none' }, logo);
        const beamLength = 330;
        beam.setAttribute('stroke-dasharray', String(beamLength));
        const word = label(460, 252, 'Elyvris', 't-sym');
        word.style.font = '500 46px var(--serif)';
        const motto = label(462, 286, 'Light, unfolded.', 't-label');
        return (p) => {
          road.forEach((g, i) => { g.style.opacity = ramp(p, 0.02 + i * 0.08, 0.1 + i * 0.08); });
          shapes.forEach(({ node, from }, i) => {
            const t = ease(ramp(p, 0.36 + i * 0.07, 0.56 + i * 0.07));
            node.setAttribute('transform', `translate(0 ${(from * (1 - t)).toFixed(1)})`);
            node.style.opacity = t;
          });
          beam.setAttribute('stroke-dashoffset', (beamLength * (1 - ease(ramp(p, 0.6, 0.8)))).toFixed(1));
          word.style.opacity = ramp(p, 0.65, 0.78);
          motto.style.opacity = ramp(p, 0.75, 0.88);
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

'use strict';
(() => {
  const Coating = window.GridCoating, Optics = window.GridOptics;
  const SVG = 'http://www.w3.org/2000/svg';
  const SAVE = 'elyvris-grid-coating-v1';
  const TICK_MS = 600, BURST = 200, POLL_MS = 60000;
  const number = new Intl.NumberFormat();
  const MATERIAL_CLASS = { MgF2: 'mgf2', SiO2: 'sio2', Al2O3: 'al2o3', TiO2: 'tio2' };
  let active = null;

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    node.append(...children);
    return node;
  }
  function svg(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, fn) {
    const result = el('button', { type: 'button' }, text);
    result.addEventListener('click', fn);
    return result;
  }
  const pct = (value, digits = 3) => `${(value * 100).toFixed(digits)} %`;
  const newSeed = () => {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    return values[0] || 1;
  };

  function load(key) {
    try {
      const data = localStorage.getItem(key);
      if (data && data.length <= 262144) return Coating.restoreCoating(JSON.parse(data)) || Coating.createCoating(newSeed());
    } catch (_) { /* A blocked or corrupt save starts a fresh run. */ }
    return Coating.createCoating(newSeed());
  }
  function save(key, lab) {
    try { localStorage.setItem(key, JSON.stringify(lab.snapshot())); } catch (_) { /* optional */ }
  }

  // Reflectance chart: x = wavelength 400-700 nm, y = reflectance 0-5 %.
  const CHART = { left: 34, right: 312, top: 10, bottom: 150, rMax: 0.05 };
  const cx = wavelength => CHART.left + (wavelength - 400) / 300 * (CHART.right - CHART.left);
  const cy = r => CHART.bottom - Math.min(r, CHART.rMax) / CHART.rMax * (CHART.bottom - CHART.top);
  function spectrumPath(points) {
    return points.map((p, i) => `${i ? 'L' : 'M'}${cx(p.wavelength).toFixed(1)},${cy(p.reflectance).toFixed(1)}`).join('');
  }
  function drawSpectrum(chart, view) {
    const parts = [];
    for (let r = 0; r <= 5; r += 1) {
      const y = cy(r / 100);
      parts.push(svg('line', { x1: CHART.left, x2: CHART.right, y1: y, y2: y, class: 'cl-grid' }));
      parts.push(svg('text', { x: CHART.left - 5, y: y + 3, 'text-anchor': 'end' }, `${r}`));
    }
    for (let w = 400; w <= 700; w += 100) {
      parts.push(svg('line', { x1: cx(w), x2: cx(w), y1: CHART.top, y2: CHART.bottom, class: 'cl-grid' }));
      parts.push(svg('text', { x: cx(w), y: CHART.bottom + 13, 'text-anchor': 'middle' }, `${w}`));
    }
    parts.push(svg('text', { x: (CHART.left + CHART.right) / 2, y: CHART.bottom + 27, 'text-anchor': 'middle', class: 'cl-axis' }, 'Wavelength (nm)'));
    parts.push(svg('text', { x: 9, y: (CHART.top + CHART.bottom) / 2, 'text-anchor': 'middle', class: 'cl-axis', transform: `rotate(-90 9 ${(CHART.top + CHART.bottom) / 2})` }, 'Reflectance (%)'));
    for (const ref of view.references) {
      parts.push(svg('path', { d: spectrumPath(ref.spectrum), class: `cl-curve cl-ref-${ref.id}` }));
    }
    parts.push(svg('path', { d: spectrumPath(view.best.spectrum), class: 'cl-curve cl-best' }));
    chart.replaceChildren(...parts);
  }

  // Progress chart: best score after each improvement, on a log scale (4.3 % down to 0.01 %).
  function drawProgress(chart, view) {
    const W = 320, H = 92, L = 34, R = 312, T = 8, B = 70;
    const top = Math.log10(0.05), bottom = Math.log10(0.0001);
    const y = score => T + (top - Math.log10(Math.max(score, 0.0001))) / (top - bottom) * (B - T);
    const end = Math.max(view.tick, 1);
    const x = tick => L + tick / end * (R - L);
    const parts = [];
    for (const level of [0.01, 0.001]) {
      parts.push(svg('line', { x1: L, x2: R, y1: y(level), y2: y(level), class: 'cl-grid' }));
      parts.push(svg('text', { x: L - 5, y: y(level) + 3, 'text-anchor': 'end' }, level === 0.01 ? '1 %' : '0.1 %'));
    }
    let d = '';
    view.history.forEach((point, i) => {
      d += i ? `H${x(point.tick).toFixed(1)}V${y(point.score).toFixed(1)}` : `M${x(point.tick).toFixed(1)},${y(point.score).toFixed(1)}`;
    });
    d += `H${R}`;
    parts.push(svg('path', { d, class: 'cl-curve cl-best' }));
    parts.push(svg('text', { x: L, y: B + 14 }, 'Cycle 0'));
    parts.push(svg('text', { x: R, y: B + 14, 'text-anchor': 'end' }, `Cycle ${number.format(view.tick)}`));
    chart.setAttribute('viewBox', `0 0 ${W} ${H}`);
    chart.replaceChildren(...parts);
  }

  function verificationText(view) {
    const v = view.best.verification;
    if (!view.best.layers.length) return 'Nothing to verify yet: bare glass.';
    if (!v) return 'Not verified yet: this design was saved before verification records existed.';
    return `Verified by Auditor at cycle ${number.format(v.tick)}: re-scored every ${v.fineGridNm} nm, layer rules ${v.layerRules ? 'met' : 'BROKEN'}, `
      + `energy conservation R + T = 1 within ${v.energyError.toExponential(0)}, ${v.toleranceSamples} runs with ±${Math.round(v.toleranceError * 100)} % thickness errors. `
      + 'The optics engine itself is checked against two independent methods and physics rules on every site update.';
  }

  function drawStack(stack, table, view) {
    const layers = view.best.layers;
    const total = layers.reduce((sum, layer) => sum + layer.thickness, 0);
    const bar = el('div', { class: 'cl-bar', 'aria-hidden': 'true' }, el('span', { class: 'cl-air' }, 'Air'));
    for (const layer of layers) {
      const part = el('span', { class: `cl-layer cl-${MATERIAL_CLASS[layer.material]}`, title: `${layer.label} ${layer.thickness.toFixed(1)} nm` });
      part.style.flexGrow = String(Math.max(layer.thickness, 4) / Math.max(total, 1) * 100);
      bar.append(part);
    }
    if (!layers.length) bar.append(el('span', { class: 'cl-empty' }, 'no coating yet'));
    bar.append(el('span', { class: 'cl-glass' }, 'Glass'));
    stack.replaceChildren(bar);
    table.replaceChildren(
      el('caption', {}, `Best design, listed from the air side (total ${total.toFixed(1)} nm)`),
      el('tr', {}, el('th', { scope: 'col' }, '#'), el('th', { scope: 'col' }, 'Material'), el('th', { scope: 'col' }, 'Index n'), el('th', { scope: 'col' }, 'Thickness')),
      ...(layers.length ? layers.map((layer, i) => el('tr', {},
        el('td', {}, String(i + 1)),
        el('td', {}, el('span', { class: `cl-swatch cl-${MATERIAL_CLASS[layer.material]}` }), layer.label),
        el('td', {}, layer.index.toFixed(2)),
        el('td', {}, `${layer.thickness.toFixed(1)} nm`))) : [el('tr', {}, el('td', { colspan: '4' }, 'Bare glass: the agents have not found a better design yet.'))]));
  }

  function drawAgents(roster, view) {
    roster.replaceChildren(...view.agents.map(agent => {
      const card = el('article', { class: 'gn-agent', 'data-agent': agent.id },
        el('div', { class: 'gn-agent-head' }, el('h3', {}, agent.label), el('span', {}, agent.role)),
        el('p', {}, agent.action));
      if (agent.moves) {
        // A move that has not been tried yet only has its starting guess, so it is listed last.
        const tried = agent.moves.filter(m => m.count > 0);
        const best = Math.max(...tried.map(m => m.value), 1e-9);
        const ranked = [...agent.moves].sort((a, b) => (b.count > 0) - (a.count > 0) || b.value - a.value);
        card.append(el('p', { class: 'cl-learned' }, 'What it has learned (average gain per try):'),
          el('ul', { class: 'cl-moves' }, ...ranked.map(move => {
            const meter = el('span', { class: 'cl-meter' }, el('span', {}));
            meter.firstChild.style.width = move.count ? `${Math.max(0, move.value) / best * 100}%` : '0%';
            return el('li', {}, el('span', {}, move.name), meter,
              el('small', {}, move.count ? `${(move.value * 100).toFixed(2)} % · won ${move.wins} of ${move.count}` : 'not tried yet'));
          })));
      } else {
        const trial = view.trial
          ? `Trial in progress: ${view.trial.layers} layer${view.trial.layers === 1 ? '' : 's'}, ${pct(view.trial.score)}.`
          : 'No trial waiting.';
        const plural = (n, word) => `${number.format(n)} ${word}${n === 1 ? '' : 's'}`;
        card.append(el('small', {}, `${plural(agent.promoted, 'new best')} accepted · ${plural(agent.discarded, 'trial')} discarded. ${trial}`));
      }
      return card;
    }));
  }

  function csv(view) {
    const lines = ['# Elyvris Grid coating lab - simulated design (not measured)',
      '# Normal incidence, lossless layers, fixed indices, air n=1.00 above, glass n=1.52 below',
      `# Cycle ${view.tick}; mean reflectance 400-700 nm: ${(view.best.score * 100).toFixed(4)} %`,
      `# ${verificationText(view)}`,
      'position_from_air,material,index,thickness_nm',
      ...view.best.layers.map((layer, i) => `${i + 1},${layer.material},${layer.index},${layer.thickness.toFixed(1)}`),
      '', 'wavelength_nm,reflectance_percent',
      ...view.best.spectrum.map(p => `${p.wavelength},${(p.reflectance * 100).toFixed(5)}`)];
    return lines.join('\r\n') + '\r\n';
  }

  function open(root) {
    close();
    if (!Coating || !Optics || !window.GridAPI?.user()) return;
    const saveKey = SAVE + ':' + GridAPI.user().id;
    let lab = load(saveKey);
    let running = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const status = el('p', { class: 'gn-status', role: 'status' });
    const counter = el('span', { class: 'gn-clock' });
    const metrics = [
      ['Best reflectance', v => pct(v.best.score)],
      ['Vs bare glass', v => `${(v.references[0].score / v.best.score).toFixed(1)}× less`],
      ['Layers', v => String(v.best.layers.length)],
      ['With ±2 % errors', v => pct(v.best.tolerance.mean)],
      ['Designs tested', v => number.format(v.evaluations)],
      ['New bests', v => number.format(v.agents[2].promoted)],
    ].map(([label, format]) => {
      const value = el('dd');
      return { format, value, node: el('div', {}, el('dt', {}, label), value) };
    });
    const chart = svg('svg', { viewBox: '0 0 320 182', class: 'cl-chart', role: 'img', 'aria-label': 'Reflectance of the best design compared with bare glass and two textbook coatings, 400 to 700 nm' });
    const legend = el('ul', { class: 'cl-legend' });
    const progress = svg('svg', { class: 'cl-progress', role: 'img', 'aria-label': 'Best reflectance found so far at each cycle, logarithmic scale' });
    const stack = el('div', { class: 'cl-stack' });
    const table = el('table', { class: 'cl-table' });
    const verified = el('p', { class: 'cl-verified' });
    const roster = el('div', { class: 'gn-roster' });
    const feed = el('ol', { class: 'gn-log', 'aria-label': 'Recent coating lab activity' });

    const caption = el('p', { class: 'gn-caption' });
    const notebook = el('ol', { class: 'cl-notebook', 'aria-label': 'Lab notebook: every improved design saved by the shared lab' });
    const notebookNote = el('p', { class: 'cl-notebook-note' });
    let shared = null, sharedNotebook = [], useLocal = false, checked = false, issue = false, pending = false, lastPoll = 0;
    const isShared = () => Boolean(shared) && !useLocal;
    const currentView = () => isShared() ? shared.view : lab.view();

    const pause = button('Pause', () => { running = !running; updateMode(); });
    const modeButton = button('Open my practice run', () => {
      useLocal = !useLocal;
      updateMode();
      draw(currentView());
    });
    const download = button('Download design (CSV)', () => {
      const link = el('a', { href: URL.createObjectURL(new Blob([csv(currentView())], { type: 'text/csv' })), download: 'elyvris-coating-design.csv' });
      document.body.append(link);
      link.click();
      setTimeout(() => { URL.revokeObjectURL(link.href); link.remove(); }, 0);
    });
    const practice = el('span', { class: 'cl-practice' },
      pause, button('Step once', () => tick(1)), button(`Run ${BURST} cycles`, () => tick(BURST)),
      button('Start a new run', () => {
        if (!window.confirm('Start again from bare glass? The current best design will be replaced.')) return;
        lab = Coating.createCoating(newSeed());
        save(saveKey, lab);
        draw(lab.view());
      }));
    const controls = el('div', { class: 'gn-controls', 'aria-label': 'Coating lab controls' }, practice, download, modeButton);

    root.replaceChildren(
      el('div', { class: 'gn-console' },
        el('div', { class: 'gn-console-bar' }, status, counter),
        el('dl', { class: 'gn-metrics', 'aria-label': 'Coating performance' }, ...metrics.map(m => m.node)),
        el('div', { class: 'gn-layout' },
          el('section', { class: 'gn-topology', 'aria-label': 'Best coating' },
            el('h2', {}, 'Reflectance of the best coating'), chart, legend,
            el('h2', { class: 'cl-sub' }, 'Layer stack'), stack, table, verified,
            el('h2', { class: 'cl-sub' }, 'Progress'), progress),
          el('section', { class: 'gn-agents', 'aria-label': 'Coating agents' }, el('h2', {}, 'Agents at work'), roster)),
        el('div', { class: 'gn-console-foot' }, caption, controls)),
      el('details', { class: 'gn-panel', open: '' }, el('summary', {}, 'Lab notebook (permanent memory)'), notebookNote, notebook),
      el('details', { class: 'gn-panel', open: '' }, el('summary', {}, 'Lab log'), feed),
      el('details', { class: 'gn-panel' }, el('summary', {}, 'What the agents are doing'),
        el('p', {}, 'Bare glass reflects about 4.3 % of visible light at each surface. A coating made of thin transparent layers can cancel those reflections by interference. The agents search for layer materials and thicknesses that make the average reflectance from 400 to 700 nm as small as possible.'),
        el('p', {}, 'Every design is scored with the transfer-matrix method, the standard calculation for thin films (H. A. Macleod, Thin-Film Optical Filters, ch. 2). The engine reproduces the textbook results for bare glass (4.26 %), a quarter-wave MgF₂ layer (1.26 % at 550 nm) and a quarter-wave mirror, and agrees with an independent NumPy calculation to 10⁻¹⁵.'),
        el('p', {}, 'Explorer changes the structure of a trial design. Refiner tunes the trial\'s thicknesses with 24 small tries per cycle. Auditor re-scores the trial on a 1 nm grid, accepts it only if it beats the best design, discards it after 6 cycles without success, and tests the best design against random ±2 % thickness errors, as in a real coating machine.'),
        el('p', {}, 'Explorer and Refiner learn which of their moves pay off: each move keeps a running average of the improvement it produced, and the agents choose good moves more often while still trying others now and then. Inserting thin layers inside the stack usually wins; this is the idea behind the needle method used in real coating design (A. V. Tikhonravov et al., Applied Optics 35, 5493, 1996).'),
        el('p', {}, 'Limits: each material has one fixed refractive index (MgF₂ 1.38, SiO₂ 1.46, Al₂O₃ 1.63, TiO₂ 2.35), with no dispersion or absorption; light arrives straight on; the back surface of the glass is ignored; at most 8 layers of 5 to 400 nm. These are simulated designs, not measurements.')));
    root.hidden = false;

    function updateMode() {
      const sharedMode = isShared();
      const stale = shared && Date.now() - Date.parse(shared.last_tick_at) > shared.cadence_seconds * 2000;
      status.textContent = sharedMode ? (stale ? 'Shared lab · delayed' : 'Shared lab · online')
        : running ? 'My practice run · running' : 'My practice run · paused';
      status.dataset.mode = sharedMode ? (stale ? 'delayed' : 'shared') : 'local';
      pause.textContent = running ? 'Pause' : 'Resume';
      practice.hidden = sharedMode;
      modeButton.hidden = !shared;
      modeButton.textContent = sharedMode ? 'Open my practice run' : 'View the shared lab';
      const model = ' Simulation only: fixed refractive indices, no absorption, light at normal incidence.';
      if (sharedMode) {
        const last = new Date(shared.last_tick_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        const every = shared.cadence_seconds >= 120 ? `${Math.round(shared.cadence_seconds / 60)} minutes` : `${shared.cadence_seconds} seconds`;
        caption.textContent = `Shared lab: the agents run on the server every ${every}, even when nobody is signed in, and every member sees the same run. Last server tick: ${last}.` + (issue ? ' Showing the last update received.' : '') + model;
      } else {
        const availability = !checked ? 'Checking for the shared lab… ' : !shared ? 'The shared lab is not running on the server yet. ' : '';
        caption.textContent = availability + 'My practice run: runs in this tab while it is visible and is saved only in this browser.' + model;
      }
      drawNotebook();
    }

    function drawNotebook() {
      if (!shared) {
        notebookNote.textContent = checked
          ? 'The notebook starts when the shared lab runs on the server. Each improved design will be kept here permanently, with how it was verified.'
          : 'Loading the notebook…';
        notebook.replaceChildren();
        return;
      }
      notebookNote.textContent = sharedNotebook.length
        ? `The ${sharedNotebook.length} most recent improvements found by the shared lab, newest first. Nothing here is ever deleted.`
        : 'No improvements recorded yet.';
      notebook.replaceChildren(...sharedNotebook.map(entry => {
        const when = new Date(entry.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
        const layers = entry.layers.map(layer => `${Optics.MATERIALS[layer.material]?.label || layer.material} ${Number(layer.thickness).toFixed(1)}`).join(' / ');
        const v = entry.verification;
        const check = v && v.layerRules && v.energyError <= 1e-12 ? `verified (1 nm re-score, R + T = 1 within ${v.energyError.toExponential(0)})` : 'not verified';
        return el('li', {},
          el('span', { class: 'cl-nb-score' }, pct(entry.score)),
          el('span', {}, `Cycle ${number.format(entry.cycle)} · ${when} · ${entry.layers.length} layers · ${check}`),
          el('small', {}, layers ? layers + ' nm (from the air side)' : 'bare glass'));
      }));
    }

    // Checks the shape of what the server sends before drawing it.
    const finite = value => Number.isFinite(value);
    function validShared(status) {
      const v = status?.view;
      return status?.version === 1 && Number.isSafeInteger(status.revision) && finite(status.cadence_seconds)
        && Number.isFinite(Date.parse(status.last_tick_at)) && v && Number.isSafeInteger(v.tick) && Number.isSafeInteger(v.evaluations)
        && v.best && finite(v.best.score) && Array.isArray(v.best.layers) && v.best.layers.length <= 8
        && v.best.layers.every(l => Optics.MATERIALS[l?.material] && finite(l.thickness) && finite(l.index))
        && Array.isArray(v.best.spectrum) && v.best.spectrum.every(p => finite(p?.wavelength) && finite(p.reflectance))
        && v.best.tolerance && finite(v.best.tolerance.mean)
        && Array.isArray(v.references) && v.references.every(r => typeof r?.label === 'string' && finite(r.score) && Array.isArray(r.spectrum))
        && Array.isArray(v.agents) && v.agents.length === 3 && v.agents[2] && Number.isSafeInteger(v.agents[2].promoted)
        && Array.isArray(v.history) && v.history.every(p => finite(p?.tick) && finite(p.score))
        && Array.isArray(v.events) && v.events.every(e => typeof e?.text === 'string' && typeof e.actor === 'string');
    }
    const validNotebook = rows => Array.isArray(rows) && rows.length <= 200 && rows.every(r => r && finite(r.score) && Number.isSafeInteger(r.cycle)
      && Number.isFinite(Date.parse(r.created_at)) && Array.isArray(r.layers) && r.layers.every(l => typeof l?.material === 'string' && finite(Number(l.thickness))));

    async function poll(force) {
      if (pending || document.hidden || (!force && Date.now() - lastPoll < POLL_MS)) return;
      pending = true;
      lastPoll = Date.now();
      try {
        const [status, rows] = await Promise.all([GridAPI.coating.status(), GridAPI.coating.notebook(40)]);
        if (validShared(status)) {
          shared = status;
          sharedNotebook = validNotebook(rows) ? rows : [];
          issue = false;
        } else {
          issue = Boolean(shared);
        }
      } catch (_) { issue = Boolean(shared); }
      finally {
        pending = false;
        checked = true;
        if (active?.root === root) {
          updateMode();
          draw(currentView());
        }
      }
    }

    function draw(view) {
      counter.textContent = 'Cycle ' + number.format(view.tick);
      for (const metric of metrics) metric.value.textContent = metric.format(view);
      drawSpectrum(chart, view);
      legend.replaceChildren(
        el('li', { class: 'cl-key-best' }, `Agents' best: ${pct(view.best.score)}`),
        ...view.references.map(ref => el('li', { class: `cl-key-${ref.id}` }, `${ref.label}: ${pct(ref.score, 2)}`)));
      drawStack(stack, table, view);
      verified.textContent = verificationText(view);
      verified.dataset.state = view.best.verification?.layerRules && view.best.verification.energyError <= 1e-12 ? 'ok' : 'pending';
      drawProgress(progress, view);
      drawAgents(roster, view);
      feed.replaceChildren(...(view.events.length ? view.events.slice(0, 10).map(event => el('li', {},
        el('span', { class: 'gn-log-tick' }, '#' + event.tick),
        el('strong', { 'data-agent': event.actor }, view.agents.find(a => a.id === event.actor)?.label || 'Lab'),
        el('span', {}, event.text))) : [el('li', {}, 'Waiting for the first cycle.')]));
    }

    function tick(cycles) {
      let view;
      for (let i = 0; i < cycles; i += 1) view = lab.step();
      save(saveKey, lab);
      if (!isShared()) draw(view);
    }

    const timer = setInterval(() => {
      if (document.hidden) return;
      if (!isShared() && running) tick(1);
      void poll(false);
    }, TICK_MS);
    active = { root, timer };
    updateMode();
    draw(lab.view());
    void poll(true);
  }

  function close() {
    if (!active) return;
    clearInterval(active.timer);
    active.root.replaceChildren();
    active = null;
  }

  window.GridCoatingLab = Object.freeze({ open, close });
})();

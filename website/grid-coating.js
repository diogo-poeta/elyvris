(function exposeGridCoating(root, build) {
  'use strict';

  if (typeof module === 'object' && module.exports) {
    module.exports = build(require('./grid-optics.js'));
  } else {
    root.GridCoating = build(root.GridOptics);
  }
})(globalThis, function buildGridCoating(optics) {
  'use strict';

  const VERSION = 1;
  const DEFAULT_SEED = 0x41524347;
  const MAX_TICK = 1_000_000_000;
  const MIN_THICKNESS = 5;
  const MAX_LAYERS = optics.MAX_LAYERS;
  const MAX_THICKNESS = optics.MAX_THICKNESS;
  const REFINE_TRIES = 24;
  const PATIENCE = 6;
  const TOLERANCE_SAMPLES = 12;
  const TOLERANCE_ERROR = 0.02;
  const LEARNING_RATE = 0.15;
  const MAX_EVENTS = 14;
  const MAX_HISTORY = 80;
  const REWARD_WINDOW = 30;
  const FINE_BAND = Object.freeze({ from: 400, to: 700, step: 1 });
  const MATERIAL_KEYS = Object.freeze(Object.keys(optics.MATERIALS));

  const AGENTS = Object.freeze([
    { id: 'explorer', label: 'Explorer', role: 'Changes the layer structure' },
    { id: 'refiner', label: 'Refiner', role: 'Tunes layer thicknesses' },
    { id: 'auditor', label: 'Auditor', role: 'Verifies and keeps the best design' },
  ].map(Object.freeze));
  const EXPLORER_MOVES = Object.freeze(['Insert thin layer', 'Add top layer', 'Remove a layer', 'Swap material', 'Keep structure']);
  const REFINER_MOVES = Object.freeze(['Fine nudge (1 nm)', 'Medium nudge (5 nm)', 'Large nudge (20 nm)', 'Shift a boundary']);
  const REFINER_STEP = [1, 5, 20, 8];

  const round = value => Math.round(value * 10) / 10;
  const percent = value => `${(value * 100).toFixed(3)} %`;
  const copyLayers = layers => layers.map(layer => ({ material: layer.material, thickness: layer.thickness }));
  const fineScore = layers => optics.meanReflectance(layers, FINE_BAND);

  function random(state) {
    let value = state.randomState;
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    state.randomState = value >>> 0;
    return state.randomState / 0x1_0000_0000;
  }
  const randomInt = (state, n) => Math.floor(random(state) * n);
  function gauss(state) {
    const u = Math.max(random(state), 1e-12);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random(state));
  }
  function otherMaterial(state, current) {
    const options = MATERIAL_KEYS.filter(key => key !== current);
    return options[randomInt(state, options.length)];
  }

  function record(state, actor, text) {
    state.events.unshift({ tick: state.tick, actor, text });
    if (state.events.length > MAX_EVENTS) state.events.pop();
  }

  function tidy(layers) {
    const out = [];
    for (const layer of layers) {
      if (layer.thickness < MIN_THICKNESS) continue;
      const last = out[out.length - 1];
      if (last && last.material === layer.material) {
        last.thickness = Math.min(MAX_THICKNESS, round(last.thickness + layer.thickness));
      } else {
        out.push({ material: layer.material, thickness: round(layer.thickness) });
      }
    }
    return out;
  }

  function describe(layers) {
    if (!layers.length) return 'bare glass';
    return layers.map(layer => `${optics.MATERIALS[layer.material].label} ${layer.thickness.toFixed(1)} nm`).join(' / ');
  }

  function chooseArm(state, arms, allowed) {
    const rate = explorationRate(state.tick);
    if (random(state) < rate) return allowed[randomInt(state, allowed.length)];
    return allowed.reduce((best, arm) => arms[arm].value > arms[best].value ? arm : best, allowed[0]);
  }
  function explorationRate(tick) {
    return 0.1 + 0.4 / (1 + tick / 50);
  }
  function learn(arm, reward) {
    arm.value += LEARNING_RATE * (reward - arm.value);
    arm.count += 1;
    if (reward > 0) arm.wins += 1;
  }

  function explorerMove(state) {
    const explorer = state.explorer;
    const layers = copyLayers(state.best.layers);
    const n = layers.length;
    // Inserting inside a layer splits it, so it adds two layers; on bare glass it adds one.
    const room = [n === 0 ? 1 : 2, 1, 0, 0, 0];
    const allowed = [0, 1, 2, 3, 4].filter(arm =>
      arm <= 1 ? n + room[arm] <= MAX_LAYERS : n > 0);
    const arm = chooseArm(state, explorer.arms, allowed);
    let text;
    if (arm === 0) {
      // The needle idea: put a thin layer inside or between existing layers.
      const material = MATERIAL_KEYS[randomInt(state, MATERIAL_KEYS.length)];
      const thickness = round(8 + random(state) * 12);
      if (n === 0) {
        layers.push({ material, thickness });
      } else {
        const index = randomInt(state, n);
        const host = layers[index];
        const split = round(host.thickness * (0.2 + 0.6 * random(state)));
        layers.splice(index, 1,
          { material: host.material, thickness: split },
          { material, thickness },
          { material: host.material, thickness: round(host.thickness - split) });
      }
      text = `Inserted a ${thickness.toFixed(1)} nm ${optics.MATERIALS[material].label} layer.`;
    } else if (arm === 1) {
      const material = MATERIAL_KEYS[randomInt(state, MATERIAL_KEYS.length)];
      const thickness = round(optics.quarterWave(material) * (0.5 + random(state)));
      layers.unshift({ material, thickness });
      text = `Added a ${thickness.toFixed(1)} nm ${optics.MATERIALS[material].label} layer on top.`;
    } else if (arm === 2) {
      const index = randomInt(state, n);
      text = `Removed the ${optics.MATERIALS[layers[index].material].label} layer (position ${index + 1}).`;
      layers.splice(index, 1);
    } else if (arm === 3) {
      const index = randomInt(state, n);
      const material = otherMaterial(state, layers[index].material);
      text = `Changed layer ${index + 1} from ${optics.MATERIALS[layers[index].material].label} to ${optics.MATERIALS[material].label}.`;
      layers[index].material = material;
    } else {
      text = 'Kept the structure so Refiner can polish the best design.';
    }
    const trialLayers = tidy(layers);
    state.trial = { layers: trialLayers, score: optics.meanReflectance(trialLayers), arm, age: 0 };
    state.evaluations += 1;
    explorer.action = arm;
    record(state, 'explorer', text);
  }

  function refinerMove(state) {
    const refiner = state.refiner;
    const trial = state.trial;
    if (!trial.layers.length) {
      refiner.action = -1;
      refiner.reward = 0;
      return;
    }
    const arm = chooseArm(state, refiner.arms, [0, 1, 2, 3]);
    const start = trial.score;
    const sigma = REFINER_STEP[arm];
    for (let attempt = 0; attempt < REFINE_TRIES; attempt += 1) {
      const layers = copyLayers(trial.layers);
      const index = randomInt(state, layers.length);
      const delta = sigma * gauss(state);
      const clamp = value => Math.min(MAX_THICKNESS, Math.max(MIN_THICKNESS, round(value)));
      if (arm === 3 && layers.length > 1) {
        const neighbour = index === layers.length - 1 ? index - 1 : index + 1;
        layers[index].thickness = clamp(layers[index].thickness + delta);
        layers[neighbour].thickness = clamp(layers[neighbour].thickness - delta);
      } else {
        layers[index].thickness = clamp(layers[index].thickness + delta);
      }
      const score = optics.meanReflectance(layers);
      state.evaluations += 1;
      if (score < trial.score) {
        trial.layers = layers;
        trial.score = score;
      }
    }
    const reward = start > 0 ? (start - trial.score) / start : 0;
    learn(refiner.arms[arm], reward);
    refiner.action = arm;
    refiner.reward = reward;
    if (reward > 0) record(state, 'refiner', `${REFINER_MOVES[arm]}: trial improved from ${percent(start)} to ${percent(trial.score)}.`);
  }

  function tolerance(state, layers) {
    if (!layers.length) return { mean: state.best.fine, worst: state.best.fine };
    let sum = 0, worst = 0;
    for (let sample = 0; sample < TOLERANCE_SAMPLES; sample += 1) {
      const shaken = layers.map(layer => ({
        material: layer.material,
        thickness: layer.thickness * (1 + TOLERANCE_ERROR * gauss(state)),
      }));
      const score = optics.meanReflectance(shaken);
      sum += score;
      worst = Math.max(worst, score);
    }
    state.evaluations += TOLERANCE_SAMPLES;
    return { mean: sum / TOLERANCE_SAMPLES, worst };
  }

  function auditorCheck(state) {
    const auditor = state.auditor;
    const trial = state.trial;
    const explorerArm = state.explorer.arms[trial.arm];
    if (!optics.validStack(trial.layers)) {
      state.trial = null;
      auditor.action = 2;
      learn(explorerArm, 0);
      record(state, 'auditor', 'Rejected a trial that broke the layer rules.');
      return;
    }
    const fine = fineScore(trial.layers);
    state.evaluations += 1;
    if (fine < state.best.fine - 1e-7) {
      const previous = state.best.fine;
      const gain = (previous - fine) / previous;
      state.best = { layers: copyLayers(trial.layers), fine, tolerance: { mean: fine, worst: fine } };
      state.best.tolerance = tolerance(state, state.best.layers);
      state.best.verification = verificationRecord(state.best.layers, state.tick);
      state.trial = null;
      state.history.push({ tick: state.tick, score: fine });
      // Keep the starting point (bare glass, cycle 0) so the progress chart always begins there.
      if (state.history.length > MAX_HISTORY) state.history.splice(1, 1);
      auditor.promoted += 1;
      auditor.action = 0;
      learn(explorerArm, gain);
      state.explorer.reward = gain;
      state.rewards.push(gain);
      record(state, 'auditor', `New best design: ${percent(previous)} → ${percent(fine)} (${state.best.layers.length} layers).`);
    } else {
      trial.age += 1;
      auditor.action = 1;
      if (trial.age >= PATIENCE) {
        state.trial = null;
        auditor.discarded += 1;
        auditor.action = 2;
        learn(explorerArm, 0);
        state.explorer.reward = 0;
        state.rewards.push(0);
        record(state, 'auditor', `Discarded a trial after ${PATIENCE} cycles (${percent(fine)}, best is ${percent(state.best.fine)}).`);
      }
    }
    if (state.rewards.length > REWARD_WINDOW) state.rewards.shift();
  }

  function verificationRecord(layers, tick) {
    const layerRules = optics.validStack(layers) && layers.length <= MAX_LAYERS
      && layers.every((layer, i) => layer.thickness >= MIN_THICKNESS && (i === 0 || layer.material !== layers[i - 1].material));
    let energyError = 0;
    for (let wavelength = FINE_BAND.from; wavelength <= FINE_BAND.to; wavelength += FINE_BAND.step) {
      const total = optics.reflectance(layers, wavelength) + optics.transmittance(layers, wavelength);
      energyError = Math.max(energyError, Math.abs(total - 1));
    }
    return { tick, fineGridNm: FINE_BAND.step, layerRules, energyError, toleranceSamples: TOLERANCE_SAMPLES, toleranceError: TOLERANCE_ERROR };
  }

  function createState(seedValue) {
    const seed = Number.isInteger(seedValue) && seedValue > 0 && seedValue <= 0xffffffff
      ? seedValue : DEFAULT_SEED;
    const bare = fineScore([]);
    return {
      version: VERSION,
      randomState: seed,
      tick: 0,
      evaluations: 1,
      best: { layers: [], fine: bare, tolerance: { mean: bare, worst: bare } },
      trial: null,
      explorer: { action: -1, reward: 0, arms: EXPLORER_MOVES.map(() => ({ value: 0.05, count: 0, wins: 0 })) },
      refiner: { action: -1, reward: 0, arms: REFINER_MOVES.map(() => ({ value: 0.05, count: 0, wins: 0 })) },
      auditor: { action: -1, promoted: 0, discarded: 0 },
      history: [{ tick: 0, score: bare }],
      rewards: [],
      events: [],
    };
  }

  const references = (() => {
    const qw = material => ({ material, thickness: round(optics.quarterWave(material)) });
    return Object.freeze([
      { id: 'bare', label: 'Bare glass', layers: [] },
      { id: 'single', label: 'Single MgF₂ quarter-wave', layers: [qw('MgF2')] },
      { id: 'vcoat', label: 'Two-layer MgF₂ / Al₂O₃', layers: [qw('MgF2'), qw('Al2O3')] },
    ].map(entry => Object.freeze({ ...entry, score: fineScore(entry.layers) })));
  })();

  function runningCoating(state) {
    function view() {
      const armView = (names, arms) => names.map((name, index) => ({ name, value: arms[index].value, count: arms[index].count, wins: arms[index].wins }));
      return {
        tick: state.tick,
        evaluations: state.evaluations,
        explorationRate: explorationRate(state.tick),
        meanReward: state.rewards.reduce((sum, reward) => sum + reward, 0) / (state.rewards.length || 1),
        best: {
          layers: state.best.layers.map(layer => ({ ...layer, label: optics.MATERIALS[layer.material].label, index: optics.MATERIALS[layer.material].index })),
          description: describe(state.best.layers),
          score: state.best.fine,
          tolerance: { ...state.best.tolerance },
          verification: state.best.verification ? { ...state.best.verification } : null,
          spectrum: optics.spectrum(state.best.layers),
        },
        trial: state.trial && { layers: state.trial.layers.length, score: state.trial.score, age: state.trial.age },
        references: references.map(entry => ({ id: entry.id, label: entry.label, score: entry.score, description: describe(entry.layers), spectrum: optics.spectrum(entry.layers) })),
        agents: [
          { ...AGENTS[0], action: EXPLORER_MOVES[state.explorer.action] || 'Awaiting cycle', reward: state.explorer.reward, moves: armView(EXPLORER_MOVES, state.explorer.arms) },
          { ...AGENTS[1], action: REFINER_MOVES[state.refiner.action] || 'Awaiting cycle', reward: state.refiner.reward, moves: armView(REFINER_MOVES, state.refiner.arms) },
          { ...AGENTS[2], action: ['Promoted a new best', 'Checked the trial', 'Discarded the trial'][state.auditor.action] || 'Awaiting cycle', promoted: state.auditor.promoted, discarded: state.auditor.discarded },
        ],
        history: state.history.map(point => ({ ...point })),
        events: state.events.map(entry => ({ ...entry })),
      };
    }

    function cycle() {
      if (state.tick === MAX_TICK) return;
      state.tick += 1;
      if (!state.trial) explorerMove(state);
      refinerMove(state);
      auditorCheck(state);
    }

    function step() {
      cycle();
      return view();
    }

    // Run several cycles without building a view after each one (used by the server tick).
    function advance(cycles) {
      for (let i = 0; i < cycles; i += 1) cycle();
      return view();
    }

    return Object.freeze({ view, step, advance, snapshot: () => JSON.parse(JSON.stringify(state)) });
  }

  const finite = value => Number.isFinite(value);
  const armsValid = (arms, length) => Array.isArray(arms) && arms.length === length
    && arms.every(arm => arm && finite(arm.value) && Math.abs(arm.value) <= 1 && Number.isInteger(arm.count) && arm.count >= 0
    && Number.isInteger(arm.wins) && arm.wins >= 0 && arm.wins <= arm.count);
  function validState(state) {
    return Boolean(state) && state.version === VERSION
      && Number.isInteger(state.tick) && state.tick >= 0 && state.tick <= MAX_TICK
      && Number.isInteger(state.randomState) && state.randomState >= 1 && state.randomState <= 0xffffffff
      && Number.isInteger(state.evaluations) && state.evaluations >= 1
      && state.best && optics.validStack(state.best.layers) && finite(state.best.fine)
      && (state.best.verification === undefined || (state.best.verification
        && Number.isInteger(state.best.verification.tick) && typeof state.best.verification.layerRules === 'boolean'
        && finite(state.best.verification.energyError) && finite(state.best.verification.fineGridNm)
        && Number.isInteger(state.best.verification.toleranceSamples) && finite(state.best.verification.toleranceError)))
      && (state.trial === null || (optics.validStack(state.trial.layers) && finite(state.trial.score)
        && Number.isInteger(state.trial.arm) && state.trial.arm >= 0 && state.trial.arm < EXPLORER_MOVES.length))
      && armsValid(state.explorer?.arms, EXPLORER_MOVES.length) && armsValid(state.refiner?.arms, REFINER_MOVES.length)
      && Array.isArray(state.history) && state.history.length <= MAX_HISTORY
      && Array.isArray(state.rewards) && state.rewards.length <= REWARD_WINDOW
      && Array.isArray(state.events) && state.events.length <= MAX_EVENTS;
  }

  function createCoating(seed) {
    return runningCoating(createState(seed));
  }
  function restoreCoating(snapshot) {
    return validState(snapshot) ? runningCoating(JSON.parse(JSON.stringify(snapshot))) : null;
  }

  return Object.freeze({ createCoating, restoreCoating, AGENTS, EXPLORER_MOVES, REFINER_MOVES, references, FINE_BAND });
});

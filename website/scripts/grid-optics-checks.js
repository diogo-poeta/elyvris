// Verification checks for the Grid coating lab (grid-optics.js and grid-coating.js).
// The same checks run in Node (check-grid-optics.cjs, on every pull request) and in a browser.
// They never change the engines; the engines never read this file.
(function exposeChecks(root, build) {
  'use strict';

  if (typeof module === 'object' && module.exports) module.exports = build;
  else root.GridOpticsChecks = build;
})(globalThis, function buildChecks(context) {
  'use strict';

  const { optics, coating, reference, assert } = context;
  const TIGHT = 1e-12;
  const MATERIALS = Object.keys(optics.MATERIALS);

  // Small seeded random generator (mulberry32), separate from the engines' own.
  function generator(seed) {
    let state = seed >>> 0;
    return () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randomStack(random, maxLayers = 8) {
    const count = Math.floor(random() * (maxLayers + 1));
    return Array.from({ length: count }, () => ({
      material: MATERIALS[Math.floor(random() * MATERIALS.length)],
      thickness: random() * 400,
    }));
  }
  function forRandomStacks(seed, count, check) {
    const random = generator(seed);
    for (let i = 0; i < count; i += 1) check(randomStack(random), 300 + random() * 900, random);
  }
  function close(actual, expected, tolerance, message) {
    assert.ok(Math.abs(actual - expected) <= tolerance,
      `${message}: got ${actual}, expected ${expected} (difference ${Math.abs(actual - expected)})`);
  }

  function rouard(layers, wavelength, ambient = optics.AMBIENT_INDEX, substrate = optics.SUBSTRATE_INDEX) {
    const n = [ambient, ...layers.map(layer => optics.MATERIALS[layer.material].index)];
    let re = (n[n.length - 1] - substrate) / (n[n.length - 1] + substrate), im = 0;
    for (let j = layers.length; j >= 1; j -= 1) {
      const rho = (n[j - 1] - n[j]) / (n[j - 1] + n[j]);
      const angle = -4 * Math.PI * n[j] * layers[j - 1].thickness / wavelength;
      const pr = re * Math.cos(angle) - im * Math.sin(angle);
      const pi = re * Math.sin(angle) + im * Math.cos(angle);
      const numRe = rho + pr, numIm = pi;
      const denRe = 1 + rho * pr, denIm = rho * pi;
      const den = denRe * denRe + denIm * denIm;
      re = (numRe * denRe + numIm * denIm) / den;
      im = (numIm * denRe - numRe * denIm) / den;
    }
    return re * re + im * im;
  }

  const qw = (material, wavelength = 550) => ({ material, thickness: wavelength / (4 * optics.MATERIALS[material].index) });
  const n0 = optics.AMBIENT_INDEX, ns = optics.SUBSTRATE_INDEX, idx = m => optics.MATERIALS[m].index;

  return [
    ['engine matches two independent reference methods (NumPy matrices and Rouard recursion)', () => {
      assert.equal(reference.model.substrate, ns);
      for (const [material, value] of Object.entries(reference.model.index)) assert.equal(idx(material), value);
      let worst = 0;
      for (const entry of reference.cases) {
        reference.wavelengths.forEach((wavelength, i) => {
          worst = Math.max(worst, Math.abs(optics.reflectance(entry.layers, wavelength) - entry.reflectance[i]));
        });
      }
      assert.ok(reference.cases.length >= 200);
      close(worst, 0, TIGHT, 'largest difference from the reference file');
    }],

    ['engine agrees with an in-test Rouard recursion on 2000 random coatings', () => {
      forRandomStacks(11, 2000, (layers, wavelength) =>
        close(optics.reflectance(layers, wavelength), rouard(layers, wavelength), TIGHT, 'engine vs Rouard'));
    }],

    ['closed-form results: bare glass, quarter-wave layer, two-layer coating, quarter-wave mirror', () => {
      close(optics.reflectance([], 550), ((n0 - ns) / (n0 + ns)) ** 2, TIGHT, 'bare glass');
      const n1 = idx('MgF2');
      close(optics.reflectance([qw('MgF2')], 550), ((n0 * ns - n1 ** 2) / (n0 * ns + n1 ** 2)) ** 2, TIGHT, 'quarter-wave MgF2');
      const n2 = idx('Al2O3');
      close(optics.reflectance([qw('MgF2'), qw('Al2O3')], 550),
        ((n0 * n2 ** 2 - ns * n1 ** 2) / (n0 * n2 ** 2 + ns * n1 ** 2)) ** 2, TIGHT, 'quarter-quarter MgF2/Al2O3');
      const nh = idx('TiO2'), nl = idx('SiO2');
      const mirror = [...Array(5)].flatMap(() => [qw('TiO2'), qw('SiO2')]).concat([qw('TiO2')]);
      const y = (nh / nl) ** 10 * nh ** 2 / ns;
      close(optics.reflectance(mirror, 550), ((n0 - y) / (n0 + y)) ** 2, TIGHT, '(HL)^5 H mirror');
    }],

    ['reflectance always lies between 0 and 1', () => {
      forRandomStacks(21, 2000, (layers, wavelength) => {
        const r = optics.reflectance(layers, wavelength);
        assert.ok(r >= 0 && r <= 1, `R = ${r}`);
      });
    }],

    ['energy is conserved: R + T = 1 for lossless layers', () => {
      forRandomStacks(31, 2000, (layers, wavelength) =>
        close(optics.reflectance(layers, wavelength) + optics.transmittance(layers, wavelength), 1, TIGHT, 'R + T'));
    }],

    ['a layer of zero thickness changes nothing', () => {
      forRandomStacks(41, 1000, (layers, wavelength, random) => {
        const at = Math.floor(random() * (layers.length + 1));
        const changed = [...layers.slice(0, at), { material: MATERIALS[Math.floor(random() * 4)], thickness: 0 }, ...layers.slice(at)];
        close(optics.reflectance(changed, wavelength), optics.reflectance(layers, wavelength), TIGHT, 'zero-thickness layer');
      });
    }],

    ['a half-wave layer is absent at its design wavelength', () => {
      forRandomStacks(51, 1000, (layers, wavelength, random) => {
        const material = MATERIALS[Math.floor(random() * 4)];
        const at = Math.floor(random() * (layers.length + 1));
        const halfWave = { material, thickness: wavelength / (2 * idx(material)) };
        const changed = [...layers.slice(0, at), halfWave, ...layers.slice(at)];
        close(optics.reflectance(changed, wavelength), optics.reflectance(layers, wavelength), 1e-11, 'half-wave layer');
      });
    }],

    ['splitting a layer in two of the same material changes nothing', () => {
      forRandomStacks(61, 1000, (layers, wavelength, random) => {
        if (!layers.length) return;
        const at = Math.floor(random() * layers.length), part = random();
        const { material, thickness } = layers[at];
        const changed = [...layers.slice(0, at), { material, thickness: thickness * part },
          { material, thickness: thickness * (1 - part) }, ...layers.slice(at + 1)];
        close(optics.reflectance(changed, wavelength), optics.reflectance(layers, wavelength), TIGHT, 'split layer');
      });
    }],

    ['scaling every thickness and the wavelength together changes nothing (no dispersion)', () => {
      forRandomStacks(71, 1000, (layers, wavelength, random) => {
        const k = 0.5 + random() * 2;
        const scaled = layers.map(layer => ({ material: layer.material, thickness: layer.thickness * k }));
        close(optics.reflectance(scaled, wavelength * k), optics.reflectance(layers, wavelength), TIGHT, 'scaling');
      });
    }],

    ['lossless coatings reflect the same from either side', () => {
      forRandomStacks(81, 1000, (layers, wavelength) => {
        const reversed = [...layers].reverse();
        close(optics.reflectance(reversed, wavelength, ns, n0), optics.reflectance(layers, wavelength), TIGHT, 'reverse side');
      });
    }],

    ['agents: the best design never gets worse, obeys the layer rules, and its score is re-checked independently', () => {
      const lab = coating.createCoating(4242);
      let previous = Infinity;
      for (let cycle = 0; cycle < 1500; cycle += 1) {
        const view = lab.step();
        assert.ok(view.best.score <= previous, `best score rose at cycle ${view.tick}`);
        previous = view.best.score;
        if (cycle % 50 !== 0) continue;
        const layers = view.best.layers;
        assert.ok(optics.validStack(layers) && layers.length <= 8);
        layers.forEach((layer, i) => {
          assert.ok(layer.thickness >= 5, 'layer thinner than 5 nm');
          if (i) assert.notEqual(layer.material, layers[i - 1].material, 'two neighbouring layers of the same material');
        });
        let sum = 0, points = 0;
        for (let w = 400; w <= 700; w += 1) { sum += rouard(layers, w); points += 1; }
        close(view.best.score, sum / points, 1e-12, 'Auditor score vs independent recomputation');
      }
      const history = lab.view().history;
      assert.equal(history[0].tick, 0);
      for (let i = 1; i < history.length; i += 1) assert.ok(history[i].score < history[i - 1].score);
    }],

    ['agents: every best design carries a verification record', () => {
      const lab = coating.createCoating(77);
      let view;
      for (let cycle = 0; cycle < 600; cycle += 1) view = lab.step();
      const record = view.best.verification;
      assert.ok(record, 'missing verification record');
      assert.equal(record.fineGridNm, 1);
      assert.equal(record.layerRules, true);
      assert.ok(record.energyError <= TIGHT, `energy error ${record.energyError}`);
      assert.ok(record.toleranceSamples >= 12);
    }],

    ['agents: a saved run resumes exactly', () => {
      const live = coating.createCoating(9001);
      for (let cycle = 0; cycle < 300; cycle += 1) live.step();
      const resumed = coating.restoreCoating(JSON.parse(JSON.stringify(live.snapshot())));
      assert.ok(resumed);
      for (let cycle = 0; cycle < 50; cycle += 1) assert.deepEqual(resumed.step(), live.step());
      assert.equal(coating.restoreCoating({ ...live.snapshot(), version: 99 }), null);
    }],
  ];
});

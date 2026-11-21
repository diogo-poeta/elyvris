(function exposeGridOptics(root, build) {
  'use strict';

  const optics = build();
  if (typeof module === 'object' && module.exports) {
    module.exports = optics;
  } else {
    root.GridOptics = optics;
  }
})(globalThis, function buildGridOptics() {
  'use strict';

  const MATERIALS = Object.freeze({
    MgF2: Object.freeze({ label: 'MgF₂', index: 1.38 }),
    SiO2: Object.freeze({ label: 'SiO₂', index: 1.46 }),
    Al2O3: Object.freeze({ label: 'Al₂O₃', index: 1.63 }),
    TiO2: Object.freeze({ label: 'TiO₂', index: 2.35 }),
  });
  const AMBIENT_INDEX = 1.0;
  const SUBSTRATE_INDEX = 1.52;
  const BAND = Object.freeze({ from: 400, to: 700, step: 2 });
  const MAX_LAYERS = 8;
  const MAX_THICKNESS = 400;

  function indexOf(material) {
    const entry = MATERIALS[material];
    if (!entry) throw new RangeError(`Unknown material: ${material}`);
    return entry.index;
  }

  function stackMatrix(layers, wavelength) {
    let a = 1, b = 0, c = 0, d = 1;
    for (const layer of layers) {
      const n = indexOf(layer.material);
      const phase = 2 * Math.PI * n * layer.thickness / wavelength;
      const cos = Math.cos(phase);
      const sin = Math.sin(phase);
      const lb = sin / n;
      const lc = n * sin;
      const na = a * cos - b * lc;
      const nb = a * lb + b * cos;
      const nc = c * cos + d * lc;
      const nd = d * cos - c * lb;
      a = na; b = nb; c = nc; d = nd;
    }
    return { a, b, c, d };
  }

  // [B, C] = M [1, n_s];  r = (n0 B - C) / (n0 B + C);  R = |r|^2.
  function reflectance(layers, wavelength, ambient = AMBIENT_INDEX, substrate = SUBSTRATE_INDEX) {
    const { a, b, c, d } = stackMatrix(layers, wavelength);
    const realMinus = ambient * a - d * substrate;
    const imagMinus = ambient * b * substrate - c;
    const realPlus = ambient * a + d * substrate;
    const imagPlus = ambient * b * substrate + c;
    return (realMinus ** 2 + imagMinus ** 2) / (realPlus ** 2 + imagPlus ** 2);
  }

  function transmittance(layers, wavelength, ambient = AMBIENT_INDEX, substrate = SUBSTRATE_INDEX) {
    const { a, b, c, d } = stackMatrix(layers, wavelength);
    const realPlus = ambient * a + d * substrate;
    const imagPlus = ambient * b * substrate + c;
    return 4 * ambient * substrate / (realPlus ** 2 + imagPlus ** 2);
  }

  function spectrum(layers, band = BAND) {
    const points = [];
    for (let wavelength = band.from; wavelength <= band.to + 1e-9; wavelength += band.step) {
      points.push({ wavelength, reflectance: reflectance(layers, wavelength) });
    }
    return points;
  }

  // The design score: mean reflectance over the visible band (400-700 nm). Lower is better.
  function meanReflectance(layers, band = BAND) {
    const points = spectrum(layers, band);
    return points.reduce((sum, point) => sum + point.reflectance, 0) / points.length;
  }

  // A quarter-wave layer has optical thickness n t = lambda / 4 at the design wavelength.
  function quarterWave(material, wavelength = 550) {
    return wavelength / (4 * indexOf(material));
  }

  function validStack(layers) {
    return Array.isArray(layers) && layers.length <= MAX_LAYERS && layers.every(layer =>
      layer && Object.hasOwn(MATERIALS, layer.material)
      && Number.isFinite(layer.thickness) && layer.thickness >= 0 && layer.thickness <= MAX_THICKNESS);
  }

  return Object.freeze({
    MATERIALS, AMBIENT_INDEX, SUBSTRATE_INDEX, BAND, MAX_LAYERS, MAX_THICKNESS,
    reflectance, transmittance, spectrum, meanReflectance, quarterWave, validStack,
  });
});

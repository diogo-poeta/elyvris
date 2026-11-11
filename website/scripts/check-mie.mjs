/* Checks for website/mie.js.
 *
 * Node:     node website/scripts/check-mie.mjs
 * Browser:  open studio.html from a local server, then in the console run
 *           (await import('./scripts/check-mie.mjs')).default
 *
 * 1. Compare with mie-reference.json, made by mie_reference.py with SciPy
 *    Bessel functions and the textbook formulas (a different method).
 * 2. Published value: Bohren & Huffman appendix A prints QEXT = 3.10543.
 * 3. Energy conservation: no absorption when the material has k = 0.
 * 4. Small-particle (Rayleigh) limit of the sphere.
 * 5. Bessel functions: values and the Wronskian J1*Y0 - J0*Y1 = 2/(pi x).
 */
const inNode = typeof process !== 'undefined' && !!process.versions?.node;
let Mie, reference;
if (inNode) {
  const { createRequire } = await import('node:module');
  const { readFileSync } = await import('node:fs');
  Mie = createRequire(import.meta.url)('../mie.js');
  reference = JSON.parse(readFileSync(new URL('./mie-reference.json', import.meta.url), 'utf8'));
} else {
  Mie = globalThis.ElyvrisMie;
  reference = await (await fetch(new URL('./mie-reference.json', import.meta.url))).json();
}

let checks = 0, worst = 0;
function close(actual, expected, label, tolerance = 1e-7) {
  // Relative difference, with a small floor so values near zero can be compared.
  // Default 1e-7: the series is cut after x + 4 x^(1/3) + 2 terms (Bohren & Huffman),
  // which leaves an error of a few parts in 1e8 for large particles.
  const error = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1e-12);
  if (!(error <= tolerance)) throw new Error(`${label}: got ${actual}, expected ${expected} (relative difference ${error.toExponential(2)})`);
  worst = Math.max(worst, error); checks++;
}

for (const r of reference.sphere) {
  const s = Mie.sphere(r.x, r.m), tag = `sphere x=${r.x} m=${r.m}`;
  close(s.qext, r.qext, `${tag} Qext`); close(s.qsca, r.qsca, `${tag} Qsca`);
  close(s.electric[1], r.ed, `${tag} electric dipole`, 1e-7); close(s.magnetic[1], r.md, `${tag} magnetic dipole`, 1e-7);
  close(s.electric[2], r.eq, `${tag} electric quadrupole`, 1e-6); close(s.magnetic[2], r.mq, `${tag} magnetic quadrupole`, 1e-5);
}
for (const r of reference.cylinder) {
  const c = Mie.cylinder(r.x, r.m), tag = `cylinder x=${r.x} m=${r.m}`;
  close(c.parallel.qext, r.par_qext, `${tag} parallel Qext`); close(c.parallel.qsca, r.par_qsca, `${tag} parallel Qsca`);
  close(c.perpendicular.qext, r.perp_qext, `${tag} perpendicular Qext`); close(c.perpendicular.qsca, r.perp_qsca, `${tag} perpendicular Qsca`);
  close(c.parallel.orders[0], r.par_order0, `${tag} parallel order 0`, 1e-7); close(c.parallel.orders[1], r.par_order1, `${tag} parallel order 1`, 1e-7);
  close(c.perpendicular.orders[0], r.perp_order0, `${tag} perpendicular order 0`, 1e-7); close(c.perpendicular.orders[1], r.perp_order1, `${tag} perpendicular order 1`, 1e-7);
}
for (const r of reference.bessel) {
  const b = Mie.besselJY(6, r.x);
  [0, 1, 5].forEach((order, i) => { close(b.J[order], r.J[i], `J${order}(${r.x})`, 1e-9); close(b.Y[order], r.Y[i], `Y${order}(${r.x})`, 1e-9); });
  close(b.J[1] * b.Y[0] - b.J[0] * b.Y[1], 2 / (Math.PI * r.x), `Wronskian at x=${r.x}`, 1e-9);
}

// Published value (five printed decimals).
const published = Mie.sphere(2 * Math.PI * 0.525 / 0.6328, [1.55, 0]);
close(published.qext, 3.10543, 'Bohren & Huffman appendix A Qext', 2e-6);
close(published.qsca, 3.10543, 'Bohren & Huffman appendix A Qsca', 2e-6);

// Energy conservation for lossless materials.
for (const x of [0.3, 1.1, 2.7, 9.0, 41.0]) for (const n of [1.33, 2.4, 3.9]) {
  const s = Mie.sphere(x, [n, 0]), c = Mie.cylinder(x, [n, 0]);
  close(s.qsca, s.qext, `lossless sphere x=${x} n=${n}`, 1e-9);
  close(c.parallel.qsca, c.parallel.qext, `lossless cylinder (parallel) x=${x} n=${n}`, 1e-9);
  close(c.perpendicular.qsca, c.perpendicular.qext, `lossless cylinder (perpendicular) x=${x} n=${n}`, 1e-9);
}

// Rayleigh limit: Qsca -> (8/3) x^4 |(m^2-1)/(m^2+2)|^2 for a very small sphere.
{ const x = 0.01, n = 1.5, ratio = (n * n - 1) / (n * n + 2);
  close(Mie.sphere(x, [n, 0]).qsca, (8 / 3) * x ** 4 * ratio ** 2, 'Rayleigh limit', 1e-3); }

const result = { status: 'passed', checks, worstRelativeDifference: Number(worst.toExponential(2)) };
console.log(JSON.stringify(result));
export default result;

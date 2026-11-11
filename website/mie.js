/* Elyvris Mie — exact light scattering by two simple shapes.
 *
 * What it calculates
 *   sphere(x, m)    a homogeneous sphere in a uniform, lossless medium.
 *   cylinder(x, m)  an infinitely long circular cylinder, light arriving
 *                   perpendicular to its axis (normal incidence).
 *
 * Inputs (both dimensionless)
 *   x = 2 * pi * n_medium * radius / wavelength      "size parameter"
 *   m = (n + i k) / n_medium                         relative refractive index,
 *       given as [real part, imaginary part], with k >= 0 for absorption
 *       (time convention exp(-i omega t)).
 *
 * Outputs: efficiencies Q = cross section / geometric shadow.
 *   Sphere:   shadow = pi * radius^2.
 *   Cylinder: shadow = 2 * radius per unit length.
 *
 * Method: C. F. Bohren and D. R. Huffman, "Absorption and Scattering of Light
 * by Small Particles" (Wiley, 1983), chapter 4 (sphere) and chapter 8
 * (cylinder). Coefficients use the logarithmic derivative D_n computed by
 * downward recurrence, as in their BHMIE program.
 *
 * Limits: one isolated particle, plane-wave illumination, linear, isotropic,
 * non-magnetic material. No substrate, no neighbours, no roughness.
 */
(function (root) {
  'use strict';

  // ---- Complex numbers are stored as [real, imaginary] pairs. ----
  function add(a, b) { return [a[0] + b[0], a[1] + b[1]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1]]; }
  function mul(a, b) { return [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]; }
  function div(a, b) {
    var d = b[0] * b[0] + b[1] * b[1];
    if (d === 0) d = 1e-300;
    return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
  }
  function abs2(a) { return a[0] * a[0] + a[1] * a[1]; }

  function checkInputs(x, m) {
    if (!Number.isFinite(x) || x <= 0) throw new RangeError('Size parameter x must be a positive number.');
    if (x > 2000) throw new RangeError('Size parameter x is above 2000; this calculator is not checked there.');
    if (!Array.isArray(m) || !Number.isFinite(m[0]) || !Number.isFinite(m[1]) || m[0] <= 0 || m[1] < 0) {
      throw new RangeError('Relative index m needs a positive real part and a non-negative imaginary part.');
    }
  }

  // Number of terms kept in the series (Bohren & Huffman, appendix A).
  function seriesLength(x) { return Math.max(1, Math.round(x + 4 * Math.cbrt(x) + 2)); }

  /* Logarithmic derivative D_n(z) for n = 0..nmax, by downward recurrence.
   *   sphere:   D_n = d/dz ln( z j_n(z) )   ->  D_(n-1) = n/z - 1/(D_n + n/z)
   *   cylinder: D_n = d/dz ln( J_n(z) )     ->  D_(n-1) = (n-1)/z - 1/(D_n + n/z)
   * Downward recurrence is stable even for strongly absorbing materials.
   */
  function logDerivative(z, nmax, cylinder) {
    // Start well above |z|: the error of the starting guess D = 0 only dies
    // away for orders larger than |z|, and slowly when n is close to |z|.
    var size = Math.sqrt(abs2(z));
    var start = Math.ceil(Math.max(nmax, size) + 6 * Math.cbrt(size) + 20);
    var D = new Array(start + 1);
    D[start] = [0, 0];
    for (var n = start; n >= 1; n--) {
      var nOverZ = div([n, 0], z);
      var first = cylinder ? div([n - 1, 0], z) : nOverZ;
      D[n - 1] = sub(first, div([1, 0], add(D[n], nOverZ)));
    }
    return D;
  }

  /* Homogeneous sphere. Returns total efficiencies and the share of the
   * scattering carried by each multipole:
   *   electric[n]  from a_n  (n = 1 electric dipole, n = 2 electric quadrupole)
   *   magnetic[n]  from b_n  (n = 1 magnetic dipole, n = 2 magnetic quadrupole)
   */
  function sphere(x, m) {
    checkInputs(x, m);
    var nmax = seriesLength(x);
    var D = logDerivative([m[0] * x, m[1] * x], nmax, false);
    // Riccati-Bessel functions psi_n(x) and chi_n(x) by upward recurrence;
    // xi_n = psi_n - i chi_n describes the outgoing scattered wave.
    var psi0 = Math.cos(x), psi1 = Math.sin(x);
    var chi0 = -Math.sin(x), chi1 = Math.cos(x);
    var electric = new Array(nmax + 1).fill(0), magnetic = new Array(nmax + 1).fill(0);
    var sumExt = 0, sumSca = 0, prefactor = 2 / (x * x);
    for (var n = 1; n <= nmax; n++) {
      var psi = (2 * n - 1) / x * psi1 - psi0;
      var chi = (2 * n - 1) / x * chi1 - chi0;
      var xi = [psi, -chi], xiPrev = [psi1, -chi1];
      var ta = add(div(D[n], m), [n / x, 0]);
      var tb = add(mul(m, D[n]), [n / x, 0]);
      var an = div([ta[0] * psi - psi1, ta[1] * psi], sub(mul(ta, xi), xiPrev));
      var bn = div([tb[0] * psi - psi1, tb[1] * psi], sub(mul(tb, xi), xiPrev));
      electric[n] = prefactor * (2 * n + 1) * abs2(an);
      magnetic[n] = prefactor * (2 * n + 1) * abs2(bn);
      sumExt += (2 * n + 1) * (an[0] + bn[0]);
      sumSca += (2 * n + 1) * (abs2(an) + abs2(bn));
      psi0 = psi1; psi1 = psi; chi0 = chi1; chi1 = chi;
    }
    var qext = prefactor * sumExt, qsca = prefactor * sumSca;
    return { qext: qext, qsca: qsca, qabs: Math.max(0, qext - qsca), nmax: nmax, electric: electric, magnetic: magnetic };
  }

  /* Bessel functions J_n(x) and Y_n(x) for real x > 0 and n = 0..nmax.
   * J_n: downward (Miller) recurrence, normalised with J_0 + 2 (J_2 + J_4 + ...) = 1.
   * Y_0, Y_1: Neumann series in the J_n (Abramowitz & Stegun 9.1.89 and its
   * derivative, using Y_1 = -dY_0/dx). Y_n for n >= 2: upward recurrence.
   */
  function besselJY(nmax, x) {
    var top = Math.max(nmax + 1, Math.ceil(x));
    var M = 2 * Math.ceil((top + 24 + Math.sqrt(200 * top)) / 2);
    var J = new Array(M + 2).fill(0);
    J[M] = 1e-30;
    for (var k = M; k >= 1; k--) {
      J[k - 1] = (2 * k / x) * J[k] - J[k + 1];
      if (Math.abs(J[k - 1]) > 1e200) { for (var i = k - 1; i <= M; i++) J[i] *= 1e-200; }
    }
    var norm = J[0];
    for (var e = 2; e <= M; e += 2) norm += 2 * J[e];
    for (var j = 0; j <= M; j++) J[j] /= norm;
    var L = Math.log(x / 2) + 0.5772156649015329; // Euler's constant
    var s0 = 0, s1 = 0;
    for (var q = 1; 2 * q + 1 <= M; q++) {
      var sign = q % 2 ? -1 : 1;
      s0 += sign * J[2 * q] / q;
      s1 += sign * (J[2 * q - 1] - J[2 * q + 1]) / q;
    }
    var Y = new Array(nmax + 2);
    Y[0] = (2 / Math.PI) * L * J[0] - (4 / Math.PI) * s0;
    Y[1] = -(2 / (Math.PI * x)) * J[0] + (2 / Math.PI) * L * J[1] + (2 / Math.PI) * s1;
    for (var n = 1; n <= nmax; n++) Y[n + 1] = (2 * n / x) * Y[n] - Y[n - 1];
    return { J: J.slice(0, nmax + 2), Y: Y };
  }

  /* Infinitely long circular cylinder, light perpendicular to the axis.
   *   parallel:       electric field along the cylinder axis      (coefficients b_n)
   *   perpendicular:  electric field perpendicular to the axis    (coefficients a_n)
   * orders[n] is the scattering carried by angular order n (+n and -n together).
   */
  function cylinder(x, m) {
    checkInputs(x, m);
    var nmax = seriesLength(x);
    var D = logDerivative([m[0] * x, m[1] * x], nmax, true);
    var bessel = besselJY(nmax, x), J = bessel.J, Y = bessel.Y;
    var par = { ext: 0, sca: 0, orders: [] }, perp = { ext: 0, sca: 0, orders: [] };
    for (var n = 0; n <= nmax; n++) {
      var jn = J[n], jPrev = n === 0 ? -J[1] : J[n - 1];
      var hn = [J[n], Y[n]], hPrev = n === 0 ? [-J[1], -Y[1]] : [J[n - 1], Y[n - 1]];
      var tb = add(mul(m, D[n]), [n / x, 0]);
      var ta = add(div(D[n], m), [n / x, 0]);
      var bn = div([tb[0] * jn - jPrev, tb[1] * jn], sub(mul(tb, hn), hPrev));
      var an = div([ta[0] * jn - jPrev, ta[1] * jn], sub(mul(ta, hn), hPrev));
      var weight = (n === 0 ? 1 : 2) * 2 / x;
      par.ext += weight * bn[0]; par.sca += weight * abs2(bn); par.orders.push(weight * abs2(bn));
      perp.ext += weight * an[0]; perp.sca += weight * abs2(an); perp.orders.push(weight * abs2(an));
    }
    function pack(p) { return { qext: p.ext, qsca: p.sca, qabs: Math.max(0, p.ext - p.sca), orders: p.orders }; }
    return { parallel: pack(par), perpendicular: pack(perp), nmax: nmax };
  }

  var api = Object.freeze({ sphere: sphere, cylinder: cylinder, besselJY: besselJY });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ElyvrisMie = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));

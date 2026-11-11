"""Independent reference values for website/mie.js.

This script does NOT use the same method as mie.js. The website code uses
logarithmic derivatives and recurrences; this script evaluates the textbook
formulas directly with SciPy's Bessel functions. Agreement between the two
is therefore a real cross-check, not a copy.

Formulas: Bohren & Huffman, "Absorption and Scattering of Light by Small
Particles" (Wiley, 1983), eq. 4.53 (sphere) and section 8.4 (cylinder,
normal incidence).

Run:  python website/scripts/mie_reference.py
It rewrites mie-reference.json next to this file; check-mie.mjs reads it.
Requires numpy and scipy.
"""
import json
from pathlib import Path

import numpy as np
from scipy import special


def sphere(x, m):
    """Efficiencies of a sphere: size parameter x, relative index m (complex)."""
    nmax = int(round(x + 4 * x ** (1 / 3) + 2)) + 10
    n = np.arange(1, nmax + 1)
    mx = m * x

    def psi(z):   # Riccati-Bessel psi_n(z) = z j_n(z)
        return z * special.spherical_jn(n, z)

    def dpsi(z):
        return special.spherical_jn(n, z) + z * special.spherical_jn(n, z, derivative=True)

    h = special.spherical_jn(n, x) + 1j * special.spherical_yn(n, x)
    dh = special.spherical_jn(n, x, derivative=True) + 1j * special.spherical_yn(n, x, derivative=True)
    xi, dxi = x * h, h + x * dh

    a = (m * psi(mx) * dpsi(x) - psi(x) * dpsi(mx)) / (m * psi(mx) * dxi - xi * dpsi(mx))
    b = (psi(mx) * dpsi(x) - m * psi(x) * dpsi(mx)) / (psi(mx) * dxi - m * xi * dpsi(mx))
    qext = 2 / x ** 2 * np.sum((2 * n + 1) * (a + b).real)
    qsca = 2 / x ** 2 * np.sum((2 * n + 1) * (abs(a) ** 2 + abs(b) ** 2))
    part = lambda c, order: float(2 / x ** 2 * (2 * order + 1) * abs(c[order - 1]) ** 2)
    return {
        "x": x, "m": [m.real, m.imag], "qext": float(qext), "qsca": float(qsca),
        "ed": part(a, 1), "md": part(b, 1), "eq": part(a, 2), "mq": part(b, 2),
    }


def cylinder(x, m):
    """Efficiencies of an infinite cylinder at normal incidence, both polarisations."""
    nmax = int(round(x + 4 * x ** (1 / 3) + 2)) + 10
    n = np.arange(0, nmax + 1)
    mx = m * x
    j, dj = special.jv(n, x), special.jvp(n, x)
    h, dh = special.hankel1(n, x), special.h1vp(n, x)
    jm, djm = special.jv(n, mx), special.jvp(n, mx)
    b = (jm * dj - m * djm * j) / (jm * dh - m * djm * h)      # E parallel to the axis
    a = (m * jm * dj - djm * j) / (m * jm * dh - djm * h)      # E perpendicular to the axis
    w = np.where(n == 0, 1.0, 2.0)
    out = {"x": x, "m": [m.real, m.imag]}
    for name, c in (("par", b), ("perp", a)):
        out[name + "_qext"] = float(2 / x * np.sum(w * c.real))
        out[name + "_qsca"] = float(2 / x * np.sum(w * abs(c) ** 2))
        out[name + "_order0"] = float(2 / x * abs(c[0]) ** 2)
        out[name + "_order1"] = float(4 / x * abs(c[1]) ** 2)
    return out


# Published test case: Bohren & Huffman, appendix A (radius 0.525 um, wavelength
# 0.6328 um, index 1.55 in vacuum) prints QEXT = QSCA = 3.10543.
BH_X = 2 * np.pi * 0.525 / 0.6328

SPHERES = [(BH_X, 1.55 + 0j), (0.05, 1.5 + 0j), (0.5, 3.9 + 0.02j), (1.0, 1.33 + 1e-5j), (1.2, 4.0 + 0.05j),
           (2.0, 2.6 + 0j), (10.0, 1.5 + 0j), (10.0, 0.75 + 0j),
           (3.0, 0.2 + 3.4j), (30.0, 1.5 + 0.1j), (80.0, 1.33 + 0j)]
CYLINDERS = [(0.05, 1.5 + 0j), (0.5, 3.9 + 0.02j), (1.0, 2.6 + 0j), (1.7, 4.0 + 0.05j),
             (5.0, 1.5 + 0j), (3.0, 0.2 + 3.4j), (20.0, 1.33 + 0.01j), (60.0, 1.5 + 0j)]
BESSEL_X = [0.01, 0.7, 3.0, 17.3, 60.0]

if __name__ == "__main__":
    target = Path(__file__).with_name("mie-reference.json")
    target.write_text(json.dumps({
        "sphere": [sphere(x, m) for x, m in SPHERES],
        "cylinder": [cylinder(x, m) for x, m in CYLINDERS],
        "bessel": [{"x": x, "J": [float(special.jv(k, x)) for k in (0, 1, 5)],
                    "Y": [float(special.yv(k, x)) for k in (0, 1, 5)]} for x in BESSEL_X],
    }, indent=1) + "\n", encoding="utf-8")
    print("Wrote", target.name)

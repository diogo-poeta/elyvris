"""Make the independent reference values for the Grid coating engine (website/grid-optics.js).
Run (needs NumPy): python website/scripts/make_grid_optics_reference.py
"""
import json
from pathlib import Path

import numpy as np

INDEX = {"MgF2": 1.38, "SiO2": 1.46, "Al2O3": 1.63, "TiO2": 2.35}
N_AIR, N_GLASS = 1.0, 1.52
WAVELENGTHS = [380.0, 400.0, 473.3, 550.0, 632.8, 700.0, 1064.0]
SEED, STACKS, TOLERANCE = 20261118, 200, 1e-12

def matrix_reflectance(layers, wavelength):
    m = np.eye(2, dtype=complex)
    for material, thickness in layers:
        n = INDEX[material]
        delta = 2 * np.pi * n * thickness / wavelength
        m = m @ np.array([[np.cos(delta), 1j * np.sin(delta) / n],
                          [1j * n * np.sin(delta), np.cos(delta)]])
    b, c = m @ np.array([1.0, N_GLASS])
    return abs((N_AIR * b - c) / (N_AIR * b + c)) ** 2

def rouard_reflectance(layers, wavelength):
    indices = [N_AIR] + [INDEX[material] for material, _ in layers]
    r = (indices[-1] - N_GLASS) / (indices[-1] + N_GLASS)
    for j in range(len(layers), 0, -1):
        n_above, n_here = indices[j - 1], indices[j]
        rho = (n_above - n_here) / (n_above + n_here)
        phase = np.exp(-2j * 2 * np.pi * n_here * layers[j - 1][1] / wavelength)
        r = (rho + r * phase) / (1 + rho * r * phase)
    return abs(r) ** 2

def main():
    rng = np.random.default_rng(SEED)
    materials = list(INDEX)
    cases, worst = [], 0.0
    for _ in range(STACKS):
        count = int(rng.integers(0, 9))
        layers = [(materials[int(rng.integers(0, 4))], round(float(rng.uniform(0, 400)), 3)) for _ in range(count)]
        values = []
        for wavelength in WAVELENGTHS:
            a, b = matrix_reflectance(layers, wavelength), rouard_reflectance(layers, wavelength)
            worst = max(worst, abs(a - b))
            values.append(a)
        cases.append({"layers": [{"material": m, "thickness": t} for m, t in layers], "reflectance": values})
    if worst > TOLERANCE:
        raise SystemExit(f"The two reference methods disagree by {worst:.2e}; not writing the file.")
    out = {
        "about": "Independent reference reflectances (transfer matrices and Rouard recursion agree to "
                 f"{worst:.1e}). Made by make_grid_optics_reference.py; do not edit by hand.",
        "model": {"ambient": N_AIR, "substrate": N_GLASS, "index": INDEX},
        "wavelengths": WAVELENGTHS,
        "cases": cases,
    }
    target = Path(__file__).parent / "fixtures" / "grid-optics-reference.json"
    target.parent.mkdir(exist_ok=True)
    target.write_text(json.dumps(out, indent=1) + "\n", encoding="utf-8")
    print(f"{STACKS} stacks x {len(WAVELENGTHS)} wavelengths; methods agree to {worst:.1e}; wrote {target.name}")

if __name__ == "__main__":
    main()

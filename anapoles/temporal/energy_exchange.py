"""Electric and magnetic energy over one optical cycle, from the Meep export.

The export `rectangle-xy.json` holds the complex E and H phasors in the central
x-y plane (z = 0) of the 190 x 160 x 100 nm TiO2 rectangle at 366.5 nm, under
the convention exp(-i omega t). For an optical phase phi = omega t, the real
field is  F(phi) = Re(F) cos(phi) + Im(F) sin(phi).

Energy densities, in units of (1/2) eps0 E0^2:
    electric  u_E = eps_r |E/E0|^2
    magnetic  u_H = |H/H0|^2        (H0 = E0 / Z0, so (1/2) mu0 H0^2 = (1/2) eps0 E0^2)

Summing u_E and u_H over the cells of one region gives the energy stored in
that region of the plane, per unit thickness, as a function of phase. Each sum
has the form  S(phi) = A cos^2 + B sin^2 + 2 C sin cos,  so its maximum is at
phi* = atan2(2C, A - B) / 2 (mod 180 degrees). The script reports, for the
inside of the particle and for the air around it:

* the phase at which the electric and the magnetic energy peak,
* their difference in degrees and in femtoseconds (0 = in step, 90 = a quarter
  period apart; energy repeats every half period, so 90 is the largest possible),
* the cycle-averaged energies, and how much each one and their sum vary.

Scope: one plane of a steady-state, single-frequency calculation. It is not
the published transient (Supplement Fig. S2) and does not on its own identify
an anapole.

Usage (from this folder):
    python energy_exchange.py                 # writes energy-exchange.json
    python energy_exchange.py --self-test     # checks with analytic waves
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

C_NM_PER_FS = 299.792458
CURVE_POINTS = 97  # 0 to 360 degrees in 3.75 degree steps


def phasors(field: dict, prefix: str) -> np.ndarray:
    """Return complex components with shape (3, n_cells)."""
    out = []
    for axis in "xyz":
        comp = field["components"][prefix + axis]
        out.append(np.asarray(comp["re"], float) + 1j * np.asarray(comp["im"], float))
    return np.stack(out)


def quadratic_sums(f: np.ndarray, weight: np.ndarray) -> tuple[float, float, float]:
    """A, B, C sums so that sum(weight*|Re F(phi)|^2) = A cos^2 + B sin^2 + 2C sin cos."""
    re, im = f.real, f.imag
    a = float(np.sum(weight * np.sum(re * re, axis=0)))
    b = float(np.sum(weight * np.sum(im * im, axis=0)))
    c = float(np.sum(weight * np.sum(re * im, axis=0)))
    return a, b, c


def curve(a: float, b: float, c: float, phase: np.ndarray) -> np.ndarray:
    return a * np.cos(phase) ** 2 + b * np.sin(phase) ** 2 + 2 * c * np.sin(phase) * np.cos(phase)


def peak_phase_deg(a: float, b: float, c: float) -> float:
    """Phase of the maximum, in [0, 180) degrees (energy repeats every half cycle)."""
    return math.degrees(0.5 * math.atan2(2 * c, a - b)) % 180.0


def ratio(top: float, bottom: float) -> float:
    return round(top / bottom, 3) if bottom > 0 else float("inf")


def region_summary(e: np.ndarray, h: np.ndarray, eps: np.ndarray, mask: np.ndarray, period_fs: float) -> dict:
    ae, be, ce = quadratic_sums(e[:, mask], eps[mask])
    ah, bh, ch = quadratic_sums(h[:, mask], np.ones(int(mask.sum())))
    phase = np.linspace(0, 2 * math.pi, 3601)
    ue, uh = curve(ae, be, ce, phase), curve(ah, bh, ch, phase)
    pe, ph = peak_phase_deg(ae, be, ce), peak_phase_deg(ah, bh, ch)
    lag = (ph - pe) % 180.0
    return {
        "cells": int(mask.sum()),
        "electricPeakPhaseDeg": round(pe, 2),
        "magneticPeakPhaseDeg": round(ph, 2),
        "magneticLagDeg": round(lag, 2),
        "magneticLagFs": round(lag / 360.0 * period_fs, 4),
        # Energy repeats every 180 degrees, so 90 means fully out of step and 0 means in step.
        "separationDeg": round(min(lag, 180.0 - lag), 2),
        "meanElectricEnergy": float(ue.mean()),
        "meanMagneticEnergy": float(uh.mean()),
        "electricMaxOverMin": ratio(float(ue.max()), float(ue.min())),
        "magneticMaxOverMin": ratio(float(uh.max()), float(uh.min())),
        "sumMaxOverMin": ratio(float((ue + uh).max()), float((ue + uh).min())),
        "sums": {"electric": [ae, be, ce], "magnetic": [ah, bh, ch]},
    }


def analyse(data: dict) -> dict:
    meta = data["metadata"]
    grid = data["grid"]
    x = np.asarray(grid["xNm"], float)
    y = np.asarray(grid["yNm"], float)
    xx, yy = np.meshgrid(x, y)  # row order "y then x"
    xx, yy = xx.ravel(), yy.ravel()
    length, width, height = meta["geometry"]["sizeNm"]
    if abs(grid["zNm"]) > height / 2:
        raise ValueError("The exported plane does not cut through the particle")
    inside = (np.abs(xx) < length / 2) & (np.abs(yy) < width / 2)
    eps_r = meta["material"]["n"] ** 2 - meta["material"]["k"] ** 2
    eps = np.where(inside, eps_r, 1.0)
    e = phasors(data["electric"], "E")
    h = phasors(data["magnetic"], "H")
    period_fs = meta["wavelengthNm"] / C_NM_PER_FS

    inner = region_summary(e, h, eps, inside, period_fs)
    outer = region_summary(e, h, eps, ~inside, period_fs)

    phase = np.linspace(0, 2 * math.pi, CURVE_POINTS)
    ue = curve(*inner["sums"]["electric"], phase)
    uh = curve(*inner["sums"]["magnetic"], phase)
    scale = float((ue + uh).max())
    return {
        "schemaVersion": 1,
        "kind": "energy-exchange",
        "source": "rectangle-xy.json (independent Meep 3D steady-state calculation, plane z = 0)",
        "script": "energy_exchange.py",
        "wavelengthNm": meta["wavelengthNm"],
        "periodFs": round(period_fs, 6),
        "quarterPeriodFs": round(period_fs / 4, 6),
        "epsilonInside": eps_r,
        "energyUnit": "(1/2) eps0 E0^2 per grid cell; sums over the region in the z = 0 plane",
        "inside": {k: v for k, v in inner.items() if k != "sums"},
        "outside": {k: v for k, v in outer.items() if k != "sums"},
        "curveInside": {
            "phaseDeg": [round(v, 2) for v in np.degrees(phase)],
            "electric": [round(float(v) / scale, 4) for v in ue],
            "magnetic": [round(float(v) / scale, 4) for v in uh],
            "normalisation": "divided by the maximum of electric + magnetic",
        },
        "scope": "One plane of a single-frequency steady-state calculation. Not the published transient; does not by itself identify an anapole.",
    }


def self_test() -> None:
    """Analytic checks: a travelling wave keeps E and H in step; a standing wave puts them a quarter cycle apart."""
    k = 2 * math.pi
    z = np.linspace(0, 1, 400, endpoint=False)  # one wavelength, in units of wavelength
    ones = np.ones_like(z)
    zeros = np.zeros_like(z)
    travelling_e = np.stack([np.exp(1j * k * z), zeros, zeros])
    travelling_h = np.stack([zeros, np.exp(1j * k * z), zeros])
    standing_e = np.stack([2j * np.sin(k * z), zeros, zeros])  # e^{ikz} - e^{-ikz}
    standing_h = np.stack([zeros, 2 * np.cos(k * z), zeros])   # e^{ikz} + e^{-ikz}
    mask = np.ones_like(z, bool)
    t = region_summary(travelling_e, travelling_h, ones, mask, 1.0)
    s = region_summary(standing_e, standing_h, ones, mask, 1.0)
    # A travelling wave over a whole wavelength carries constant energy: no single peak.
    assert t["electricMaxOverMin"] < 1.001 and t["magneticMaxOverMin"] < 1.001, t
    # Local travelling wave at one point: E and H peak together.
    p = region_summary(travelling_e[:, :1], travelling_h[:, :1], ones[:1], mask[:1], 1.0)
    assert p["separationDeg"] < 1e-6, p
    # Standing wave: electric and magnetic energy a quarter period apart, total constant.
    assert abs(s["magneticLagDeg"] - 90) < 1e-6, s
    assert s["sumMaxOverMin"] < 1.001, s
    print("self-test passed: travelling wave in phase, standing wave 90 degrees apart")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--input", type=Path, default=Path(__file__).with_name("rectangle-xy.json"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("energy-exchange.json"))
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return
    result = analyse(json.loads(args.input.read_text(encoding="utf-8")))
    args.output.write_text(json.dumps(result, indent=1) + "\n", encoding="utf-8")
    i, o = result["inside"], result["outside"]
    print(f"Optical period T = {result['periodFs']:.4f} fs, T/4 = {result['quarterPeriodFs']:.4f} fs")
    print(f"Inside the particle: magnetic energy peaks {i['magneticLagDeg']:.1f} deg ({i['magneticLagFs']:.3f} fs) after electric energy")
    print(f"  mean electric {i['meanElectricEnergy']:.4g}, mean magnetic {i['meanMagneticEnergy']:.4g}; "
          f"swings E {i['electricMaxOverMin']}x, H {i['magneticMaxOverMin']}x, sum {i['sumMaxOverMin']}x")
    print(f"Air around it: E and H energy peaks {o['separationDeg']:.1f} deg apart; sum swings {o['sumMaxOverMin']}x")
    print(f"Wrote {args.output.name}")


if __name__ == "__main__":
    main()

"""Check independently computed Meep references and compare mesh/domain runs.

These checks deliberately do not identify an anapole or validate a transient.
Run: python check_meep.py --coarse simulation/res100 --fine simulation/res150
                         --domain simulation/domain100
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import numpy as np
from complex_fields import load_npz, Z0


def calibrated_fields(directory):
    grid = load_npz(directory / "rectangle-fields.npz")
    vacuum = load_npz(directory / "vacuum-fields.npz")
    x, y, z, e, h = grid
    ix, iy = int(np.argmin(abs(x))), int(np.argmin(abs(y)))
    line = vacuum[3][ix, iy, :, 0]
    reference = np.interp(0., z, line.real) + 1j * np.interp(0., z, line.imag)
    return (x, y, z, e / reference, h * Z0 / reference)


def interpolate_complex(field, old_axes, new_axes):
    """Separable linear interpolation, strictly within the available source grid."""
    values = field
    for axis, (old, new) in enumerate(zip(old_axes, new_axes)):
        if new.min() < old.min() - 1e-8 or new.max() > old.max() + 1e-8:
            raise ValueError("Comparison attempted extrapolation")
        moved = np.moveaxis(values, axis, 0)
        shape = moved.shape
        flat = moved.reshape(shape[0], -1)
        result = np.empty((len(new), flat.shape[1]), dtype=complex)
        for column in range(flat.shape[1]):
            result[:, column] = np.interp(new, old, flat[:, column].real) + 1j * np.interp(new, old, flat[:, column].imag)
        values = np.moveaxis(result.reshape((len(new),) + shape[1:]), 0, axis)
    return values


def compare(first_path, second_path):
    first, second = calibrated_fields(first_path), calibrated_fields(second_path)
    keep = tuple((axis >= other[0] - 1e-8) & (axis <= other[-1] + 1e-8) for axis, other in zip(first[:3], second[:3]))
    axes = tuple(axis[mask] for axis, mask in zip(first[:3], keep))
    selection = np.ix_(*[np.flatnonzero(k) for k in keep], np.arange(3))
    e1, h1 = first[3][selection], first[4][selection]
    e2, h2 = [interpolate_complex(f, second[:3], axes) for f in second[3:]]
    xx, yy, zz = np.meshgrid(*axes, indexing="ij")
    dx = max(float(np.max(np.diff(axis))) for axis in axes)
    # Remove both finite-difference boundaries and the dielectric interface zone.
    inner = np.ones(xx.shape, dtype=bool)
    expanded = np.ones(xx.shape, dtype=bool)
    for coordinate, half_side in zip((xx, yy, zz), (95., 80., 50.)):
        inner &= np.abs(coordinate) < half_side - 2.5 * dx
        expanded &= np.abs(coordinate) < half_side + 2.5 * dx
    mask = inner | ~expanded
    def relative(a, b):
        return float(np.linalg.norm((a - b)[mask]) / np.linalg.norm(b[mask]))
    def intensity(a, b):
        return float(abs(np.sum(abs(a[mask])**2) / np.sum(abs(b[mask])**2) - 1))
    r1 = json.loads((first_path / "validation.json").read_text())
    r2 = json.loads((second_path / "validation.json").read_text())
    c1, c2 = [r["rectangle"]["scatteringCrossSectionUm2"] for r in (r1, r2)]
    return {"first": str(first_path), "second": str(second_path),
            "comparisonSamplesAwayFromInterfaces": int(mask.sum()),
            "electricPhasorRelativeL2": relative(e1,e2), "magneticPhasorRelativeL2": relative(h1,h2),
            "electricSquaredNormIntegralRelativeChange": intensity(e1,e2),
            "magneticSquaredNormIntegralRelativeChange": intensity(h1,h2),
            "scatteringCrossSectionRelativeChange": abs(c1/c2-1),
            "method": "Normalize both runs to vacuum E at physical origin; interpolate second complex vector fields onto first common grid; no extrapolation; exclude 2.5 coarse cells around interfaces."}


def check_run(directory):
    report = json.loads((directory / "validation.json").read_text())
    vacuum, rectangle = report["vacuum"], report["rectangle"]
    checks = {}
    def below(name, value, bound):
        checks[name] = {"value": value, "bound": bound, "passed": bool(np.isfinite(value) and abs(value) < bound)}
    below("vacuumFaraday", vacuum["maxwell"]["faradayRelativeL2"], .015)
    below("vacuumAmpere", vacuum["maxwell"]["ampereRelativeL2"], .003)
    below("vacuumImpedance", vacuum["E_H_impedanceRelativeL2"], .01)
    below("vacuumTransverse", vacuum["electricTransverseRelativeL2"], 1e-8)
    below("vacuumYeeWaveNumber", vacuum["fittedVsYeeRelativeError"], .002)
    below("vacuumClosedFlux", vacuum["netClosedFluxOverIncidentFacePower"], 1e-4)
    below("rectangleFaradayAwayFromInterfaces", rectangle["maxwellAwayFromInterfaces"]["faradayRelativeL2"], .08)
    below("rectangleAmpereAwayFromInterfaces", rectangle["maxwellAwayFromInterfaces"]["ampereRelativeL2"], .005)
    below("rectangleLosslessFlux", rectangle["netTotalFluxOverScatteredPower"], .003)
    for label, run in (("vacuum",vacuum),("rectangle",rectangle)):
        for field in ("electric", "magnetic"):
            below(label + field.title() + "Tail", run["tail"][field + "RelativeChange"], 1e-4)
    sigma = rectangle["scatteringCrossSectionUm2"]
    checks["positiveScattering"] = {"value": sigma, "passed": bool(np.isfinite(sigma) and sigma > 0)}
    return {"directory": str(directory), "checks": checks, "passed": all(c["passed"] for c in checks.values())}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--coarse", type=Path)
    parser.add_argument("--fine", type=Path)
    parser.add_argument("--domain", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--review-report", type=Path, help="recheck the thresholds in an existing convergence JSON; does not recompute fields")
    args = parser.parse_args()
    if args.review_report:
        stored = json.loads(args.review_report.read_text(encoding="utf8"))
        reviewed = []
        for run in stored["runs"]:
            for name, check in run["checks"].items():
                value = float(check["value"])
                passed = np.isfinite(value) and (abs(value) < float(check["bound"]) if "bound" in check else value > 0)
                reviewed.append(bool(passed))
        mesh = stored["meshComparison"]
        mesh_ok = mesh["electricPhasorRelativeL2"] < .10 and mesh["magneticPhasorRelativeL2"] < .10 and mesh["scatteringCrossSectionRelativeChange"] < .05
        domain = stored.get("domainComparison")
        domain_ok = not domain or (domain["electricPhasorRelativeL2"] < .02 and domain["magneticPhasorRelativeL2"] < .02 and domain["scatteringCrossSectionRelativeChange"] < .01)
        passed = all(reviewed) and mesh_ok and domain_ok
        print(json.dumps({"mode": "stored-report-threshold-review", "runCheckCount": len(reviewed), "passed": passed,
                          "note": "Checks stored diagnostic values only. Regenerate the three simulations and use --coarse/--fine/--domain to recompute field comparisons."}, indent=2))
        raise SystemExit(0 if passed else 1)
    if args.coarse is None or args.fine is None:
        parser.error("Supply --coarse and --fine simulation directories, or --review-report convergence.json")
    paths = [args.coarse,args.fine] + ([args.domain] if args.domain else [])
    output = {"runs": [check_run(p) for p in paths], "meshComparison": compare(args.coarse,args.fine),
              "interpretation": "Numerical checks of independent single-frequency fields, not original Lumerical data, transient reproduction, or anapole identification."}
    mesh = output["meshComparison"]
    mesh["passed"] = mesh["electricPhasorRelativeL2"] < .10 and mesh["magneticPhasorRelativeL2"] < .10 and mesh["scatteringCrossSectionRelativeChange"] < .05
    if args.domain:
        domain = output["domainComparison"] = compare(args.coarse,args.domain)
        domain["passed"] = domain["electricPhasorRelativeL2"] < .02 and domain["magneticPhasorRelativeL2"] < .02 and domain["scatteringCrossSectionRelativeChange"] < .01
    output["passed"] = all(r["passed"] for r in output["runs"]) and mesh["passed"] and output.get("domainComparison", {"passed": True})["passed"]
    text = json.dumps(output, indent=2, allow_nan=False)
    if args.output:
        args.output.write_text(text, encoding="utf8")
    print(text)
    raise SystemExit(0 if output["passed"] else 1)

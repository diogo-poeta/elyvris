"""Import genuine complex electromagnetic fields and reconstruct one optical cycle.

This module does not solve the Poeta et al. nanorectangle. It preserves complex
field amplitudes exported by a solver, including spatial E/H phase differences.
Intensity-only panels cannot be converted to signed phasors by this importer.

Required convention: E(r,t)=Re[E_tilde(r) exp(-i omega t)], likewise H.
CSV coordinates are nm; complex E is V/m and complex H is A/m. Arrays use
shape (nx, ny, nz, 3), Cartesian x/y/z component order. A 2D plane can be
imported, but a full 3D grid is required for differential Maxwell checks.
"""
from __future__ import annotations
import argparse
import csv
import json
from pathlib import Path
import numpy as np

C0 = 299_792_458.0
EPS0 = 8.8541878128e-12
MU0 = 1.25663706212e-6
Z0 = float(np.sqrt(MU0 / EPS0))
COMPONENTS = ("Ex", "Ey", "Ez", "Hx", "Hy", "Hz")
REQUIRED_COLUMNS = ("x_nm", "y_nm", "z_nm") + tuple(name + suffix for name in COMPONENTS for suffix in ("_re", "_im"))


def validate_grid(x_nm, y_nm, z_nm, electric, magnetic):
    axes = tuple(np.asarray(axis, dtype=float) for axis in (x_nm, y_nm, z_nm))
    for name, axis in zip("xyz", axes):
        if axis.ndim != 1 or len(axis) == 0 or not np.isfinite(axis).all() or (len(axis) > 1 and not np.all(np.diff(axis) > 0)):
            raise ValueError(f"{name}_nm must be a nonempty, finite, strictly increasing axis")
    expected = tuple(len(a) for a in axes) + (3,)
    fields = tuple(np.asarray(field, dtype=complex) for field in (electric, magnetic))
    for name, field in zip(("electric", "magnetic"), fields):
        if field.shape != expected or not np.isfinite(field.real).all() or not np.isfinite(field.imag).all():
            raise ValueError(f"{name} must be a finite complex array of shape {expected}")
    return (*axes, *fields)


def load_csv(path):
    with Path(path).open(encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(line for line in handle if not line.lstrip().startswith("#"))
        missing = set(REQUIRED_COLUMNS) - set(reader.fieldnames or ())
        if missing:
            raise ValueError("Complex field CSV is missing columns: " + ", ".join(sorted(missing)))
        rows = [[float(row[key]) for key in REQUIRED_COLUMNS] for row in reader]
    if not rows:
        raise ValueError("Complex field CSV contains no samples")
    data = np.asarray(rows, dtype=float)
    if not np.isfinite(data).all():
        raise ValueError("Complex field CSV contains a non-finite value")
    axes = tuple(np.unique(data[:, i]) for i in range(3))
    shape = tuple(len(axis) for axis in axes)
    if int(np.prod(shape)) != len(data):
        raise ValueError("CSV must contain one complete Cartesian grid, without missing or duplicate samples")
    locations = tuple(np.searchsorted(axis, data[:, i]) for i, axis in enumerate(axes))
    flat = np.ravel_multi_index(locations, shape)
    if len(np.unique(flat)) != len(data):
        raise ValueError("CSV contains duplicate grid positions")
    fields = np.empty(shape + (6,), dtype=complex)
    fields[locations] = data[:, 3::2] + 1j * data[:, 4::2]
    return validate_grid(*axes, fields[..., :3], fields[..., 3:])


def load_npz(path):
    # allow_pickle=False prevents a numerical field file from executing objects.
    with np.load(path, allow_pickle=False) as file:
        required = {"x_nm", "y_nm", "z_nm", "electric", "magnetic"}
        if not required.issubset(file.files):
            raise ValueError("NPZ requires x_nm, y_nm, z_nm, electric and magnetic arrays")
        return validate_grid(file["x_nm"], file["y_nm"], file["z_nm"], file["electric"], file["magnetic"])


def reconstruct(electric, magnetic, phase_radians):
    """Real instantaneous E/H at one common phase; no forced E/H quadrature."""
    if not np.isfinite(phase_radians):
        raise ValueError("phase must be finite")
    factor = np.exp(-1j * float(phase_radians))
    return np.real(np.asarray(electric) * factor), np.real(np.asarray(magnetic) * factor)


def poynting(electric, magnetic, phase_radians=None):
    """Instantaneous E×H, or cycle-averaged 1/2 Re(E×H*) when phase is None."""
    if phase_radians is None:
        return 0.5 * np.real(np.cross(electric, np.conjugate(magnetic)))
    e, h = reconstruct(electric, magnetic, phase_radians)
    return np.cross(e, h)


def _curl(field, axes_m):
    gradients = [np.gradient(field[..., component], *axes_m, edge_order=2) for component in range(3)]
    return np.stack((gradients[2][1] - gradients[1][2], gradients[0][2] - gradients[2][0], gradients[1][0] - gradients[0][1]), axis=-1)


def maxwell_residuals(x_nm, y_nm, z_nm, electric, magnetic, wavelength_nm, epsilon_r, source_free_mask=None):
    """Harmonic curl residuals for full 3D SI fields, away from sources/interfaces.

    A small residual only checks exported fields at the supplied resolution. It
    does not prove solver convergence, an anapole condition, or data provenance.
    The caller must exclude material interfaces, impressed currents and PML.
    """
    x_nm, y_nm, z_nm, electric, magnetic = validate_grid(x_nm, y_nm, z_nm, electric, magnetic)
    if any(len(axis) < 3 for axis in (x_nm, y_nm, z_nm)):
        raise ValueError("Differential Maxwell checks require at least three samples in each of x, y and z; one plane is insufficient")
    if not np.isfinite(wavelength_nm) or wavelength_nm <= 0:
        raise ValueError("wavelength_nm must be positive")
    shape = electric.shape[:-1]
    epsilon = np.broadcast_to(np.asarray(epsilon_r, dtype=complex), shape)
    if not np.isfinite(epsilon).all():
        raise ValueError("epsilon_r must be finite")
    mask = np.ones(shape, dtype=bool) if source_free_mask is None else np.asarray(source_free_mask, dtype=bool).copy()
    if mask.shape != shape:
        raise ValueError("source_free_mask has the wrong shape")
    # Exclude finite-difference edge stencils irrespective of caller mask.
    for axis in range(3):
        slices = [slice(None)] * 3
        for edge in (0, -1):
            slices[axis] = edge
            mask[tuple(slices)] = False
    if not mask.any():
        raise ValueError("No source-free interior samples remain")
    axes_m = tuple(axis * 1e-9 for axis in (x_nm, y_nm, z_nm))
    omega = 2 * np.pi * C0 / (wavelength_nm * 1e-9)
    curl_e = _curl(electric, axes_m)
    curl_h = _curl(magnetic, axes_m)
    faraday_rhs = 1j * omega * MU0 * magnetic
    ampere_rhs = -1j * omega * EPS0 * epsilon[..., None] * electric
    def relative_l2(actual, expected):
        denominator = np.linalg.norm(expected[mask].ravel())
        if denominator == 0:
            raise ValueError("Relative residual is undefined for a zero reference field")
        return float(np.linalg.norm((actual - expected)[mask].ravel()) / denominator)
    return {"faradayRelativeL2": relative_l2(curl_e, faraday_rhs), "ampereRelativeL2": relative_l2(curl_h, ampere_rhs), "interiorSamples": int(mask.sum()), "note": "Discretization residual only; sources, PML and interfaces must be excluded by the supplied mask."}


def web_slice(grid, metadata, z_nm, electric_reference, magnetic_reference):
    """Compact phasor plane with fixed reference amplitudes and shared phase.

    These must be source field amplitudes, not unrelated per-frame maxima. The
    returned display scales are fixed over all phases within each field panel.
    No physical energy density is inferred for dispersive/absorbing materials.
    """
    x, y, z, electric, magnetic = validate_grid(*grid)
    if not np.isfinite(electric_reference) or electric_reference <= 0 or not np.isfinite(magnetic_reference) or magnetic_reference <= 0:
        raise ValueError("Positive electric and magnetic source-reference amplitudes are required")
    if metadata.get("phaseConvention") != "exp(-i omega t)":
        raise ValueError("Metadata must explicitly declare phaseConvention='exp(-i omega t)'")
    if not metadata.get("source") or not metadata.get("wavelengthNm") or not metadata.get("geometry"):
        raise ValueError("Metadata must document source, wavelengthNm and geometry")
    index = int(np.argmin(np.abs(z - z_nm)))
    if abs(z[index] - z_nm) > 1e-8:
        raise ValueError("Requested slice is not an exported z plane; interpolation is not silently performed")
    e = electric[:, :, index, :] / electric_reference
    h = magnetic[:, :, index, :] / magnetic_reference
    def encode(field, prefix):
        reordered = field.transpose(1, 0, 2)  # row-major y then x
        return {"unit": prefix + "/" + prefix + "0", "referenceAmplitudeSI": electric_reference if prefix == "E" else magnetic_reference,
                "components": {prefix + axis: {"re": np.round(reordered[..., j].real, 9).ravel().tolist(), "im": np.round(reordered[..., j].imag, 9).ravel().tolist()} for j, axis in enumerate("xyz")},
                "fixedMagnitudeScale": float(np.max(np.sqrt(np.sum(np.abs(reordered) ** 2, axis=-1))))}
    return {"schemaVersion": 1, "kind": "complex-field-export", "metadata": metadata,
            "phaseConvention": "realField = re*cos(phase) + im*sin(phase)",
            "grid": {"width": len(x), "height": len(y), "xNm": x.tolist(), "yNm": y.tolist(), "zNm": float(z[index]), "rowOrder": "y then x"},
            "electric": encode(e, "E"), "magnetic": encode(h, "H"),
            "sharedNormalizedMagnitudeScale": float(max(np.max(np.sqrt(np.sum(np.abs(e) ** 2, axis=-1))), np.max(np.sqrt(np.sum(np.abs(h) ** 2, axis=-1))))),
            "warning": "A source export is reconstructed, not a new solver run. Intensity figures cannot supply missing signed phase. An anapole assignment requires separate scattering/multipole evidence."}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="genuine complex field CSV or NPZ")
    parser.add_argument("metadata", type=Path, help="JSON containing source, wavelengthNm, geometry, phaseConvention")
    parser.add_argument("output", type=Path)
    parser.add_argument("--z-nm", type=float, required=True)
    parser.add_argument("--electric-reference", type=float, required=True, help="incident E amplitude in V/m")
    parser.add_argument("--magnetic-reference", type=float, required=True, help="incident H amplitude in A/m")
    args = parser.parse_args()
    grid = load_npz(args.input) if args.input.suffix.lower() == ".npz" else load_csv(args.input)
    output = web_slice(grid, json.loads(args.metadata.read_text(encoding="utf8")), args.z_nm, args.electric_reference, args.magnetic_reference)
    args.output.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf8")
    print(json.dumps({"status": "exported", "grid": output["grid"], "output": str(args.output)}))

if __name__ == "__main__":
    main()

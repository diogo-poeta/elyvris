"""Independent 3D single-frequency Maxwell calculation for the published rectangle.

This is not the authors' Lumerical project or a reproduction of their transient
Fig. S2. A Gaussian source obtains frequency-domain phasors at one wavelength;
reconstruction then shows a steady-state optical cycle. The constant dielectric
function matches the cited dispersive material at that frequency only.

Run with an existing Linux Meep installation, or ./run_meep.sh meep_rectangle.py.
All geometric inputs below are micrometres. Ex polarization, propagation +z.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import time
import numpy as np
import meep as mp
from complex_fields import Z0, maxwell_residuals, web_slice

ROOT = Path(__file__).resolve().parent
COMPONENTS = (mp.Ex, mp.Ey, mp.Ez, mp.Hx, mp.Hy, mp.Hz)
GEOMETRY = (.190, .160, .100)
WAVELENGTH_NM = 366.5


def material_at_wavelength(wavelength_nm, material_table=None):
    """Linear interpolation of the pinned measured n,k table, no extrapolation."""
    path = Path(material_table) if material_table else ROOT / "sources" / "Jolivet-amorphous.yml"
    if material_table is None and not path.exists():
        path = ROOT / "Jolivet-amorphous.yml"
    data = []
    reading = False
    for line in path.read_text(encoding="utf8").splitlines():
        if "data: |" in line:
            reading = True
            continue
        if reading:
            try:
                values = [float(v) for v in line.split()]
            except ValueError:
                continue
            if len(values) == 3:
                data.append(values)
    data = np.asarray(data)
    wavelength_um = wavelength_nm / 1000
    if not data[0, 0] <= wavelength_um <= data[-1, 0]:
        raise ValueError("Wavelength outside source material range")
    n = float(np.interp(wavelength_um, data[:, 0], data[:, 1]))
    k = float(np.interp(wavelength_um, data[:, 0], data[:, 2]))
    if k != 0:
        raise ValueError("This lossless reference script is restricted to tabulated k=0")
    return n, {"record": "Jolivet-amorphous", "n": n, "k": k,
               "publication": "https://doi.org/10.1016/j.apsusc.2022.155214",
               "databaseCommit": "c5c2f188e848453def5970e347399d653df2ffc2",
               "path": "database/data/main/TiO2/nk/Jolivet-amorphous.yml",
               "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
               "interpolation": "linear in wavelength; no extrapolation",
               "model": "epsilon=n(lambda0)^2, constant during this single-frequency calculation"}


def flux_faces(side):
    regions = []
    for direction in range(3):
        for sign in (-1, 1):
            center = [0., 0., 0.]
            size = [side, side, side]
            center[direction] = sign * side / 2
            size[direction] = 0
            regions.append(mp.FluxRegion(center=mp.Vector3(*center), size=mp.Vector3(*size), weight=sign))
    return regions


def fields_at_monitor(sim, monitor):
    axes = sim.get_array_metadata(dft_cell=monitor)[:3]
    shape = tuple(len(axis) for axis in axes)
    fields = []
    for component in COMPONENTS:
        field = np.asarray(sim.get_dft_array(monitor, component, 0))
        fields.append(np.zeros(shape, dtype=complex) if field.ndim == 0 else field.reshape(shape))
    return (*axes, np.stack(fields[:3], axis=-1), np.stack(fields[3:], axis=-1))


def relative_change(previous, current):
    return float(np.linalg.norm(current - previous) / np.linalg.norm(current))


def run(args):
    started = time.monotonic()
    args.output.mkdir(parents=True, exist_ok=True)
    frequency = 1000 / args.wavelength_nm
    n, material = material_at_wavelength(args.wavelength_nm, args.material_table)
    source = mp.Source(mp.GaussianSource(frequency, fwidth=frequency * .18, is_integrated=True),
                       center=mp.Vector3(z=-.25), size=mp.Vector3(args.cell, args.cell, 0), component=mp.Ex)
    settings = dict(resolution=args.resolution, cell_size=mp.Vector3(args.cell, args.cell, args.cell),
                    boundary_layers=[mp.PML(args.pml)], sources=[source], k_point=mp.Vector3(),
                    symmetries=[mp.Mirror(mp.X, phase=-1), mp.Mirror(mp.Y, phase=1)],
                    eps_averaging=True, Courant=.5)
    volume = mp.Volume(center=mp.Vector3(), size=mp.Vector3(.36, .32, .20))
    faces = flux_faces(.42)

    def monitors(sim):
        fields = sim.add_dft_fields(list(COMPONENTS), frequency, 0, 1, where=volume, decimation_factor=1)
        xy_plane = sim.add_dft_fields(list(COMPONENTS), frequency, 0, 1, center=mp.Vector3(), size=mp.Vector3(.36, .32, 0), decimation_factor=1)
        total_box = sim.add_flux(frequency, 0, 1, *faces)
        scattered_box = sim.add_flux(frequency, 0, 1, *faces)
        input_plane = sim.add_flux(frequency, 0, 1, mp.FluxRegion(center=mp.Vector3(z=-.21), size=mp.Vector3(.42, .42, 0)))
        return fields, xy_plane, total_box, scattered_box, input_plane

    mp.verbosity(0)
    print(json.dumps({"stage": "vacuum reference", "resolution": args.resolution}), flush=True)
    reference = mp.Simulation(**settings)
    reference_fields, _, reference_box, _, input_plane = monitors(reference)
    reference.run(until_after_sources=args.after_source)
    previous = fields_at_monitor(reference, reference_fields)
    reference.run(until=args.tail)
    vacuum = fields_at_monitor(reference, reference_fields)
    vacuum_tail = {"electricRelativeChange": relative_change(previous[3], vacuum[3]),
                   "magneticRelativeChange": relative_change(previous[4], vacuum[4])}
    incident_flux_data = reference.get_flux_data(reference_box)
    incident_intensity = float(mp.get_fluxes(input_plane)[0] / (.42 ** 2))
    vacuum_net_flux = float(mp.get_fluxes(reference_box)[0])
    reference.reset_meep()

    print(json.dumps({"stage": "rectangle", "elapsedSeconds": time.monotonic() - started}), flush=True)
    geometry = [mp.Block(size=mp.Vector3(*GEOMETRY), center=mp.Vector3(), material=mp.Medium(index=n))]
    rectangle = mp.Simulation(**settings, geometry=geometry)
    rectangle_fields, rectangle_xy, total_box, scattered_box, _ = monitors(rectangle)
    rectangle.load_minus_flux_data(scattered_box, incident_flux_data)
    rectangle.run(until_after_sources=args.after_source)
    previous = fields_at_monitor(rectangle, rectangle_fields)
    rectangle.run(until=args.tail)
    solved = fields_at_monitor(rectangle, rectangle_fields)
    solved_xy = fields_at_monitor(rectangle, rectangle_xy)
    object_tail = {"electricRelativeChange": relative_change(previous[3], solved[3]),
                   "magneticRelativeChange": relative_change(previous[4], solved[4])}
    scattered_power = float(mp.get_fluxes(scattered_box)[0])
    net_total_power = float(mp.get_fluxes(total_box)[0])
    x, y, z, e, h = solved
    if not all(np.array_equal(axis, ref) for axis, ref in zip(solved[:3], vacuum[:3])):
        raise RuntimeError("Reference and rectangle grids differ")
    centre = tuple(int(np.argmin(np.abs(axis))) for axis in (x, y, z))
    vacuum_centre_line = vacuum[3][centre[:2] + (slice(None), 0)]
    reference_phasor = np.interp(0., z, vacuum_centre_line.real) + 1j * np.interp(0., z, vacuum_centre_line.imag)
    # A single phase rotation and amplitude calibration are applied to BOTH E/H.
    # In Meep's dimensionless units H_SI=(E_unit/Z0)*H_Meep.
    factor = np.exp(-1j * np.angle(reference_phasor)) / abs(reference_phasor)
    e = e * factor
    h = h * factor / Z0
    ve = vacuum[3] * factor
    vh = vacuum[4] * factor / Z0
    grid = (x * 1000, y * 1000, z * 1000, e, h)
    vacuum_grid = (x * 1000, y * 1000, z * 1000, ve, vh)
    np.savez_compressed(args.output / "rectangle-fields.npz", x_nm=grid[0], y_nm=grid[1], z_nm=grid[2], electric=e, magnetic=h)
    np.savez_compressed(args.output / "vacuum-fields.npz", x_nm=grid[0], y_nm=grid[1], z_nm=grid[2], electric=ve, magnetic=vh)
    xx, yy, zz = np.meshgrid(x, y, z, indexing="ij")
    coordinates = (xx, yy, zz)
    inside = np.ones(xx.shape, dtype=bool)
    deep_inside = np.ones(xx.shape, dtype=bool)
    near_box = np.ones(xx.shape, dtype=bool)
    buffer = 2.5 / args.resolution
    for coordinate, side in zip(coordinates, GEOMETRY):
        inside &= np.abs(coordinate) < side / 2
        deep_inside &= np.abs(coordinate) < side / 2 - buffer
        near_box &= np.abs(coordinate) < side / 2 + buffer
    epsilon = np.where(inside, n ** 2, 1.)
    mask = deep_inside | ~near_box
    vacuum_residuals = maxwell_residuals(*vacuum_grid, args.wavelength_nm, 1)
    object_residuals = maxwell_residuals(*grid, args.wavelength_nm, epsilon, mask)
    normalized_h = vh * Z0
    transverse_ratio = float(np.sqrt(np.sum(np.abs(ve[..., 1:]) ** 2) / np.sum(np.abs(ve[..., 0]) ** 2)))
    impedance_error = float(np.linalg.norm(ve[..., 0] - normalized_h[..., 1]) / np.linalg.norm(ve[..., 0]))
    # Independent Yee vacuum dispersion relation for a z-directed wave.
    delta = 1 / args.resolution
    dt = .5 * delta
    yee_k = 2 / delta * np.arcsin(np.sin(np.pi * frequency * dt) * delta / dt)
    iz = (len(x) // 2, len(y) // 2)
    fitted_k = float(np.polyfit(z, np.unwrap(np.angle(ve[iz + (slice(None), 0)])), 1)[0])
    report = {"kind": "independent-Meep-steady-state-reference", "meepVersion": mp.__version__,
              "wavelengthNm": args.wavelength_nm, "material": material,
              "geometryNm": [side * 1000 for side in GEOMETRY], "resolutionPixelsPerUm": args.resolution,
              "meshNm": 1000 / args.resolution, "cellUm": args.cell, "pmlUm": args.pml,
              "source": {"polarization": "Ex", "direction": "+z", "planeZUm": -.25, "fractionalFrequencyWidth": .18},
              "afterSourceTimeUnits": args.after_source, "additionalTailTimeUnits": args.tail,
              "timeUnitFs": 1e9 / 299792458,
              "referenceDFTAmplitudeBeforeNormalization": abs(reference_phasor),
              "normalization": "E0=1 V/m, H0=1/Z0 A/m after shared vacuum-reference calibration at physical origin (linear complex z interpolation)",
              "phaseConvention": "exp(-i omega t)",
              "vacuum": {"tail": vacuum_tail, "maxwell": vacuum_residuals,
                         "E_H_impedanceRelativeL2": impedance_error, "electricTransverseRelativeL2": transverse_ratio,
                         "fittedWaveNumberPerUm": fitted_k, "yeeWaveNumberPerUm": float(yee_k),
                         "continuumWaveNumberPerUm": 2 * np.pi * frequency,
                         "fittedVsYeeRelativeError": float(abs(fitted_k / yee_k - 1)),
                         "netClosedFluxOverIncidentFacePower": vacuum_net_flux / (incident_intensity * .42 ** 2)},
              "rectangle": {"tail": object_tail, "maxwellAwayFromInterfaces": object_residuals,
                            "scatteringCrossSectionUm2": scattered_power / incident_intensity,
                            "netTotalFluxOverScatteredPower": net_total_power / scattered_power,
                            "phasorElectricMagnitudeMaximumOverE0": float(np.max(np.linalg.norm(e, axis=-1))),
                            "phasorMagneticMagnitudeMaximumOverH0": float(np.max(np.linalg.norm(h * Z0, axis=-1)))},
              "runtimeSeconds": time.monotonic() - started,
              "limitations": ["Not the original Lumerical project or the published formation transient.",
                              "One wavelength with n(lambda0)^2; no claim of broadband dispersive pulse dynamics.",
                              "No new multipole decomposition or anapole-condition verification.",
                              "Spatial convergence must be assessed from separate resolution/domain runs."]}
    metadata = {"title": f"Independent 3D Maxwell reference at {args.wavelength_nm:g} nm", "source": "meep_rectangle.py / Meep " + mp.__version__,
                "wavelengthNm": args.wavelength_nm, "geometry": {"type": "rectangular prism in air", "sizeNm": [190,160,100],
                                                                 "axes": "190 nm along x; incident E along x, propagation +z"},
                "phaseConvention": "exp(-i omega t)", "material": material,
                "sourceArticle": "https://doi.org/10.1364/OL.536925", "validation": report,
                "interpretation": "Independently calculated steady-state optical cycle. Not original Lumerical data or formation dynamics."}
    plane_grid = (solved_xy[0] * 1000, solved_xy[1] * 1000, solved_xy[2] * 1000,
                  solved_xy[3] * factor, solved_xy[4] * factor / Z0)
    plane = web_slice(plane_grid, metadata, float(plane_grid[2][0]), 1., 1. / Z0)
    plane["warning"] = "Independent single-frequency Meep calculation; not original Lumerical data, not the formation transient, and not independent identification of an anapole."
    (args.output / "rectangle-xy.json").write_text(json.dumps(plane, separators=(",", ":"), allow_nan=False), encoding="utf8")
    (args.output / "validation.json").write_text(json.dumps(report, indent=2, allow_nan=False), encoding="utf8")
    rectangle.reset_meep()
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--resolution", type=int, default=100, help="pixels per micrometre")
    parser.add_argument("--wavelength-nm", type=float, default=WAVELENGTH_NM)
    parser.add_argument("--material-table", type=Path, help="override pinned local Jolivet-amorphous.yml path")
    parser.add_argument("--cell", type=float, default=1.0)
    parser.add_argument("--pml", type=float, default=.2)
    parser.add_argument("--after-source", type=float, default=12.)
    parser.add_argument("--tail", type=float, default=6.)
    parser.add_argument("--output", type=Path, default=ROOT / "simulation" / "res100")
    args = parser.parse_args()
    if args.resolution < 40 or args.cell / 2 - args.pml < .28 or args.pml <= 0:
        parser.error("Require resolution>=40 and cell/2-pml>=0.28 um for source/flux clearance")
    run(args)

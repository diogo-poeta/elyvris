#!/usr/bin/env python3
"""Render a shared optical cycle from a dimensionless 3D FDTD complex-field export.

Dependencies: numpy, matplotlib, Pillow, imageio-ffmpeg.
Examples:
  python render_field_cycle.py --self-test
  python render_field_cycle.py --input rectangle-xy.json --output-dir outputs
  python render_field_cycle.py --input rectangle-xy.json --output-dir preview \
      --prefix field-cycle-preview --formats poster

Only real(reconstructed vector) squared is plotted. No independent H phase shift,
per-frame rescaling, formation transient or original Lumerical field is introduced.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")

from matplotlib import animation, colors, patches, ticker
import matplotlib.pyplot as plt
import numpy as np


CREAM = "#F5F2E8"
INK = "#203C34"
GREEN = "#2E6251"
WALNUT = "#79594A"
MUTED = "#637267"
GRID = "#D5D9CC"
LIGHT_SPEED = 299792458.0


def real_vector(re: np.ndarray, im: np.ndarray, phase: float) -> np.ndarray:
    """Dimensionless instantaneous vector for exp(-i omega t)."""
    return re * np.cos(phase) + im * np.sin(phase)


def squared_field(re: np.ndarray, im: np.ndarray, phase: float) -> np.ndarray:
    vector = real_vector(re, im, phase)
    return np.sum(vector * vector, axis=0)


def exact_cycle_maximum(re: np.ndarray, im: np.ndarray) -> float:
    """Global max over pixels and every real phase, not a sampled-frame bound.

    I(phi) = A cos²(phi) + B sin²(phi) + 2 C sin(phi) cos(phi),
    with A = a.a, B = b.b and C = a.b for complex vector a+i b.
    Its pointwise maximum is (A+B+sqrt((A-B)²+4C²))/2.
    """
    a = np.sum(re * re, axis=0)
    b = np.sum(im * im, axis=0)
    c = np.sum(re * im, axis=0)
    value = np.max(.5 * (a + b + np.sqrt((a - b) ** 2 + 4 * c ** 2)))
    if not np.isfinite(value) or value <= 0:
        raise ValueError("Field has no finite positive cycle maximum.")
    return float(value)


def load_export(path: Path) -> dict:
    raw = path.read_bytes()
    payload = json.loads(raw)
    if payload.get("schemaVersion") != 1 or payload.get("kind") != "complex-field-export":
        raise ValueError("Expected complex-field-export schemaVersion 1.")
    if payload.get("phaseConvention") != "realField = re*cos(phase) + im*sin(phase)":
        raise ValueError("Unrecognised phase convention; refusing to infer a sign.")
    grid = payload["grid"]
    if grid.get("rowOrder") != "y then x":
        raise ValueError("Unrecognised sample order.")
    nx, ny = int(grid["width"]), int(grid["height"])
    x, y = np.asarray(grid["xNm"], float), np.asarray(grid["yNm"], float)
    if x.shape != (nx,) or y.shape != (ny,) or nx < 2 or ny < 2:
        raise ValueError("Coordinate dimensions do not match the grid.")
    if not np.all(np.diff(x) > 0) or not np.all(np.diff(y) > 0):
        raise ValueError("Coordinates must be strictly increasing.")
    if not np.allclose(np.diff(x), np.diff(x)[0]) or not np.allclose(np.diff(y), np.diff(y)[0]):
        raise ValueError("This renderer requires a regular Cartesian export grid.")
    fields = {}
    for field, letter, unit in [("electric", "E", "E/E0"), ("magnetic", "H", "H/H0")]:
        source = payload[field]
        if source.get("unit") != unit:
            raise ValueError(f"Expected already-normalized {unit}; do not normalize twice.")
        re, im = [], []
        for suffix in "xyz":
            component = source["components"][letter + suffix]
            for target, part in [(re, "re"), (im, "im")]:
                values = np.asarray(component[part], float)
                if values.size != nx * ny or not np.all(np.isfinite(values)):
                    raise ValueError(f"Invalid {letter + suffix} {part} samples.")
                target.append(values.reshape(ny, nx))
        real, imaginary = np.stack(re), np.stack(im)
        fields[field] = {"re": real, "im": imaginary,
                         "cycleMaximum": exact_cycle_maximum(real, imaginary)}
    wavelength = float(payload["metadata"]["wavelengthNm"])
    if not np.isfinite(wavelength) or wavelength <= 0:
        raise ValueError("Invalid wavelength.")
    geometry = payload["metadata"]["geometry"]["sizeNm"]
    if len(geometry) != 3 or any(float(v) <= 0 for v in geometry):
        raise ValueError("Invalid rectangular geometry.")
    return {"payload": payload, "fields": fields, "x": x, "y": y,
            "zNm": float(grid["zNm"]), "wavelengthNm": wavelength,
            "periodFs": wavelength * 1e-9 / LIGHT_SPEED * 1e15,
            "geometryNm": list(map(float, geometry)),
            "sha256": hashlib.sha256(raw).hexdigest(), "filename": path.name}


def run_self_tests() -> list[str]:
    passed = []
    a = np.array([[[1.]], [[0.]], [[0.]]])
    zero = np.zeros_like(a)
    np.testing.assert_allclose(squared_field(a, zero, 0), 1)
    np.testing.assert_allclose(squared_field(a, zero, np.pi / 2), 0, atol=1e-28)
    np.testing.assert_allclose(squared_field(zero, a, np.pi / 2), 1)
    np.testing.assert_allclose(squared_field(a, a, np.pi / 4), 2)
    passed.append("exp(-i omega t) sign and a purely imaginary component")
    b = np.array([[[0.]], [[1.]], [[0.]]])
    for phase in np.linspace(0, 2 * np.pi, 17):
        np.testing.assert_allclose(squared_field(a, b, phase), 1, atol=1e-14)
    np.testing.assert_allclose(exact_cycle_maximum(a, b), 1)
    passed.append("circular vector: instantaneous norm 1 versus complex norm squared 2")
    xyz = np.array([[[1.]], [[2.]], [[3.]]])
    np.testing.assert_allclose(squared_field(xyz, zero, 0), 14)
    passed.append("squared field includes all three vector components")
    rng = np.random.default_rng(2026)
    re, im = rng.normal(size=(3, 4, 5)), rng.normal(size=(3, 4, 5))
    bound = exact_cycle_maximum(re, im)
    sampled_max = max(np.max(squared_field(re, im, p)) for p in np.linspace(0, 2*np.pi, 4097))
    assert bound + 1e-12 >= sampled_max
    assert bound - sampled_max < bound * 1e-5
    passed.append("analytic full-cycle maximum bounds a 4097-phase numerical audit")
    phase = .721
    np.testing.assert_allclose(real_vector(re, im, phase + np.pi), -real_vector(re, im, phase), atol=1e-14)
    np.testing.assert_allclose(squared_field(re, im, phase + np.pi), squared_field(re, im, phase), atol=1e-14)
    np.testing.assert_allclose(real_vector(re, im, phase + 2*np.pi), real_vector(re, im, phase), atol=1e-14)
    passed.append("signed-field optical-period and squared-field half-period consistency")
    phases = np.arange(1000) * (2*np.pi/1000)
    mean_squared = np.mean([squared_field(re, im, p) for p in phases], axis=0)
    np.testing.assert_allclose(mean_squared, .5*np.sum(re*re + im*im, axis=0), atol=1e-13)
    passed.append("cycle-mean squared field equals half the complex-vector norm squared")
    return passed


def make_figure(data: dict, pixels: int, arrows: bool = False):
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 11,
                         "text.color": INK, "axes.labelcolor": INK,
                         "xtick.color": MUTED, "ytick.color": MUTED})
    fig = plt.figure(figsize=(10.8, 10.8), dpi=pixels / 10.8, facecolor=CREAM)
    wavelength = data["wavelengthNm"]
    fig.text(.075, .948, f"INDEPENDENT 3D FDTD REFERENCE  /  {wavelength:g} nm",
             size=11, weight="bold", color=GREEN, va="top")
    fig.text(.07, .894, "Fields over one optical cycle", size=27, weight="bold", va="top")
    lx, ly, lz = data["geometryNm"]
    fig.text(.075, .837, f"{lx:g} × {ly:g} × {lz:g} nm TiO₂ resonator in air", size=13,
             color=MUTED, va="top")
    fig.text(.075, .804, f"Total vector fields · x–y plane at z = {data['zNm']:g} nm", size=11.5,
             color=MUTED, va="top")

    clock = fig.add_axes([.075, .715, .85, .043], facecolor=CREAM)
    clock.set_xlim(0, 1)
    clock.set_ylim(-1, 1)
    clock.axhline(0, color=GRID, lw=2)
    clock.set_xticks([0, .25, .5, .75, 1], labels=["0", "¼", "½", "¾", "1"])
    clock.tick_params(axis="x", length=0, labelsize=10.5, pad=3)
    clock.set_yticks([])
    for spine in clock.spines.values():
        spine.set_visible(False)
    cursor = clock.scatter([0], [0], s=52, color=GREEN, zorder=3, clip_on=False)
    time_label = fig.text(.075, .775, "", size=12, weight="bold", va="top")
    phase_label = fig.text(.925, .775, "", size=11, color=MUTED, va="top", ha="right")

    x, y = data["x"], data["y"]
    dx, dy = x[1] - x[0], y[1] - y[0]
    extent = (x[0] - dx/2, x[-1] + dx/2, y[0] - dy/2, y[-1] + dy/2)
    maps, quivers = {}, {}
    # A perceptually ordered, colour-vision-friendly scientific colour map.
    cmap = plt.get_cmap("viridis")
    for field, left, title, letter in [("electric", .075, "Electric field", "E"),
                                        ("magnetic", .565, "Magnetic field", "H")]:
        ax = fig.add_axes([left, .335, .36, .335], facecolor=CREAM)
        f = data["fields"][field]
        norm = colors.Normalize(vmin=0, vmax=f["cycleMaximum"], clip=False)
        image = ax.imshow(squared_field(f["re"], f["im"], 0), origin="lower", extent=extent,
                          interpolation="nearest", cmap=cmap, norm=norm, aspect="equal")
        ax.set_title(title, fontsize=16, weight="bold", pad=12)
        ax.set_xlabel("x (nm)", labelpad=4)
        ax.set_ylabel("y (nm)", labelpad=3)
        ax.xaxis.set_major_locator(ticker.MaxNLocator(4))
        ax.yaxis.set_major_locator(ticker.MaxNLocator(4))
        ax.tick_params(length=3, labelsize=10)
        for spine in ax.spines.values():
            spine.set_color(GRID)
        ax.add_patch(patches.Rectangle((-lx/2, -ly/2), lx, ly, fill=False,
                                       edgecolor="white", lw=1.5, linestyle=(0, (4, 3))))
        cax = fig.add_axes([left, .277, .36, .014])
        colorbar = fig.colorbar(image, cax=cax, orientation="horizontal")
        colorbar.outline.set_edgecolor(GRID)
        colorbar.ax.tick_params(length=2, labelsize=9)
        colorbar.set_ticks([0, .5*f["cycleMaximum"], f["cycleMaximum"]],
                           labels=["0", f"{.5*f['cycleMaximum']:.3g}", f"{f['cycleMaximum']:.3g}"])
        colorbar.set_label(rf"$|{letter}(t)|^2/{letter}_0^2$", fontsize=12, labelpad=5)
        maps[field] = image
        if arrows:
            # Equal-length arrows encode in-plane direction only. Weak vectors
            # are suppressed rather than assigning a meaningless zero direction.
            step = max(1, round(min(len(x), len(y)) / 7))
            offset = step//2
            xx, yy = np.meshgrid(x[offset::step], y[offset::step])
            quivers[field] = (ax.quiver(xx, yy, np.zeros_like(xx), np.zeros_like(xx),
                                       color="white", angles="xy", scale_units="xy",
                                       scale=1/14, width=.006, pivot="mid", zorder=4), step, offset)
    fig.text(.5, .21, "Separate colour scales; each fixed for the entire optical cycle.",
             size=11.5, color=MUTED, ha="center", va="top")
    fig.text(.5, .183, "Colour includes all three vector components. Dashed outline: resonator.",
             size=10.3, color=MUTED, ha="center", va="top")
    if arrows:
        fig.text(.5, .159, "Equal-length arrows: in-plane field direction only.",
                 size=10.3, color=MUTED, ha="center", va="top")
    fig.add_artist(plt.Line2D([.075, .925], [.139, .139], transform=fig.transFigure,
                             color=GRID, linewidth=.8))
    fig.text(.075, .12, "Independent steady-state Meep calculation; not the original Lumerical formation dynamics.",
             size=8.15, color=MUTED, va="top")
    fig.text(.075, .10, r"Shared phase: $\exp(-i\omega t)$ · $E_0=1$ V/m · $H_0=1/Z_0$ A/m · vacuum-reference calibration",
             size=8.15, color=MUTED, va="top")
    fig.text(.075, .08, "Geometry: Poeta et al., “Optical anapoles excited by UV-A illumination,” Opt. Lett. 49 (2024).",
             size=8.15, color=MUTED, va="top")
    fig.text(.075, .06, "Article DOI: 10.1364/OL.536925 · Optical constants: Jolivet et al. (2023), DOI:10.1016/j.apsusc.2022.155214",
             size=8.15, color=MUTED, va="top")

    def update(phase: float):
        for field, image in maps.items():
            f = data["fields"][field]
            intensity = squared_field(f["re"], f["im"], phase)
            if np.max(intensity) > f["cycleMaximum"] * (1 + 1e-12):
                raise ValueError("Fixed colour limit was exceeded.")
            image.set_data(intensity)
            if arrows:
                q, step, offset = quivers[field]
                vector = real_vector(f["re"], f["im"], phase)
                u = vector[0, offset::step, offset::step]
                v = vector[1, offset::step, offset::step]
                length = np.hypot(u, v)
                threshold = .03 * np.sqrt(f["cycleMaximum"])
                valid = length > threshold
                den = np.where(valid, length, 1)
                q.set_UVC(np.ma.masked_where(~valid, u/den), np.ma.masked_where(~valid, v/den))
        fraction = (phase / (2*np.pi)) % 1
        cursor.set_offsets([[fraction, 0]])
        time_label.set_text(f"t = {fraction * data['periodFs']:.3f} fs   /   T = {data['periodFs']:.3f} fs")
        phase_label.set_text(f"t/T = {fraction:.3f}    ·    phase = {fraction*360:.1f}°")
        return *maps.values(), cursor, time_label, phase_label

    update(0)
    return fig, update


def write_caption(path: Path, data: dict, duration: float, arrows: bool) -> None:
    text = f"""Fields over one optical cycle

Electric and magnetic fields in a {data['geometryNm'][0]:g} × {data['geometryNm'][1]:g} × {data['geometryNm'][2]:g} nm amorphous TiO₂ resonator in air, illuminated at {data['wavelengthNm']:g} nm.

Both panels share one phase clock. Colour shows |E(t)|²/E₀² and |H(t)|²/H₀², including all three vector components, in the x–y plane at z={data['zNm']:g} nm. The two colour scales differ, and each remains fixed for the entire cycle.

One optical period, {data['periodFs']:.6f} fs, is slowed to {duration:g} seconds. The instantaneous fields are reconstructed directly from the complex vectors with exp(−iωt), using the same time origin.

New independent steady-state Meep reference at the published geometry, not the original Lumerical formation transient.

Geometry: Poeta et al., “Optical anapoles excited by UV-A illumination,” Optics Letters (2024).
https://doi.org/10.1364/OL.536925

Method: Meep FDTD.
https://meep.readthedocs.io/en/latest/

Optical constants: Jolivet et al. (2023).
https://doi.org/10.1016/j.apsusc.2022.155214
"""
    if arrows:
        text += "\nEqual-length arrows indicate in-plane field direction.\n"
    path.write_text(text, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--input", type=Path)
    parser.add_argument("--convergence", type=Path,
                        help="Optional producer convergence.json; it must report passed=true.")
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--prefix", default="anapole-field-cycle")
    parser.add_argument("--formats", nargs="+", choices=["poster", "gif", "mp4"],
                        default=["poster", "gif", "mp4"])
    parser.add_argument("--pixels", type=int, default=1080)
    parser.add_argument("--duration", type=float, default=10.)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--gif-fps", type=int, default=10)
    parser.add_argument("--poster-fraction", type=float, default=.4)
    parser.add_argument("--arrows", action=argparse.BooleanOptionalAction, default=False)
    args = parser.parse_args()
    if args.self_test:
        print(json.dumps({"passed": run_self_tests()}, indent=2))
        if args.input is None:
            return
    if args.input is None:
        parser.error("--input must name an explicitly selected complex-field export.")
    if args.pixels < 360 or args.pixels % 2:
        parser.error("--pixels must be even and at least 360.")
    if args.duration <= 0 or min(args.fps, args.gif_fps) < 1:
        parser.error("Duration and frame rates must be positive.")
    if not 0 <= args.poster_fraction < 1:
        parser.error("Poster fraction must be in [0, 1).")
    if Path(args.prefix).name != args.prefix:
        parser.error("Prefix must be a filename stem, without directories.")
    data = load_export(args.input)
    convergence = None
    if args.convergence is not None:
        convergence = json.loads(args.convergence.read_text(encoding="utf-8"))
        if convergence.get("passed") is not True:
            parser.error("Supplied convergence report does not approve the numerical checks.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stem = args.output_dir / args.prefix
    fig, update = make_figure(data, args.pixels, args.arrows)
    files = []
    if "poster" in args.formats:
        update(2*np.pi*args.poster_fraction)
        path = Path(f"{stem}-poster.png")
        fig.savefig(path, dpi=fig.dpi, facecolor=CREAM)
        files.append(path.name)
    for kind, fps in [("gif", args.gif_fps), ("mp4", args.fps)]:
        if kind not in args.formats:
            continue
        frames = max(2, round(args.duration * fps))
        # Endpoint excluded, so an infinite loop has no duplicated end frame.
        phases = np.arange(frames) * (2*np.pi/frames)
        movie = animation.FuncAnimation(fig, update, frames=phases,
                                        interval=1000/fps, repeat=True, blit=False)
        path = Path(f"{stem}.{kind}")
        if kind == "gif":
            writer = animation.PillowWriter(fps=fps)
        else:
            import imageio_ffmpeg
            plt.rcParams["animation.ffmpeg_path"] = imageio_ffmpeg.get_ffmpeg_exe()
            writer = animation.FFMpegWriter(fps=fps, codec="libx264", bitrate=5000,
                metadata={"title": "Fields over one optical cycle",
                          "comment": "Independent Meep steady-state reference; shared exp(-i omega t) phase; not original formation dynamics."},
                extra_args=["-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"])
        movie.save(path, writer=writer, dpi=fig.dpi)
        files.append(path.name)
    caption = Path(f"{stem}-caption.txt")
    write_caption(caption, data, args.duration, args.arrows)
    files.append(caption.name)
    metadata = {
        "title": "Fields over one optical cycle",
        "dataset": data["filename"], "datasetSha256": data["sha256"],
        "dimensions": [args.pixels, args.pixels], "displayDurationSeconds": args.duration,
        "wavelengthNm": data["wavelengthNm"], "periodFs": data["periodFs"],
        "planeZNm": data["zNm"], "phaseConvention": "exp(-i omega t)",
        "posterFractionOfPeriod": args.poster_fraction,
        "observable": "sum of squared instantaneous real normalized vector components",
        "colourScale": "separate exact full-cycle maxima, fixed in all frames",
        "electricCycleMaximum": data["fields"]["electric"]["cycleMaximum"],
        "magneticCycleMaximum": data["fields"]["magnetic"]["cycleMaximum"],
        "arrows": "equal-length in-plane directions with a 3% threshold" if args.arrows else False,
        "caveat": "Independent steady-state calculation; not original Lumerical or formation dynamics; not independent anapole identification.",
        "normalization": {"electric": data["payload"]["electric"]["unit"],
                          "magnetic": data["payload"]["magnetic"]["unit"],
                          "electricReferenceAmplitudeSI": data["payload"]["electric"]["referenceAmplitudeSI"],
                          "magneticReferenceAmplitudeSI": data["payload"]["magnetic"]["referenceAmplitudeSI"]},
        "simulationValidation": data["payload"]["metadata"]["validation"],
        "methodUrl": "https://meep.readthedocs.io/en/latest/",
        "posterAlt": "Side-by-side electric and magnetic squared-field maps of a 190 × 160 × 100 nm TiO2 resonator from an independent 3D FDTD calculation. Both use the same optical phase. Each field has its own colour scale, fixed for the whole cycle; a dashed rectangle marks the resonator.",
        "files": files,
    }
    if convergence is not None:
        metadata["convergence"] = {"record": args.convergence.name, "passed": True}
        for key in ["meshComparison", "domainComparison"]:
            metadata["convergence"][key] = {k: v for k, v in convergence[key].items()
                                            if k not in ["first", "second"]}
    Path(f"{stem}-metadata.json").write_text(json.dumps(metadata, indent=2)+"\n", encoding="utf-8")
    plt.close(fig)
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()

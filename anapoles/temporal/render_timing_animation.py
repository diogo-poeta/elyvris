#!/usr/bin/env python3
"""Render the published anapole E/H event-time table as a discrete animation.

Requirements: matplotlib, numpy, Pillow, imageio-ffmpeg.
No field reconstruction, temporal interpolation or magnetic-amplitude data are used.

Example:
  python render_timing_animation.py --input anapole-temporal-samples.json \
      --output-dir outputs

The input path defaults relative to this script; output paths are CLI-controlled.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
from matplotlib import animation, patches
import numpy as np


CREAM = "#F5F2E8"
INK = "#203C34"
GREEN = "#2E6251"
WALNUT = "#79594A"
MUTED = "#637267"
GRID = "#D5D9CC"
PALE = "#E5E9DD"


def load_samples(path: Path) -> tuple[dict, list[dict]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload["samples"]
    if len(rows) != 14:
        raise ValueError("This source edition must contain exactly 14 published pairs.")
    if [sum(r["instance"] == n for r in rows) for n in (1, 2, 3, 4)] != [3, 4, 4, 3]:
        raise ValueError("Unexpected source-instance grouping.")
    for row in rows:
        expected = round(row["magneticTimeFs"] - row["electricTimeFs"], 2)
        if abs(expected - row["delayFs"]) > 1e-9:
            raise ValueError(f"Incorrect derived delay in {row['id']}")
    return payload, rows


def draw_figure(rows: list[dict], pixels: int) -> tuple[plt.Figure, callable]:
    plt.rcParams.update({
        "font.family": "DejaVu Sans",
        "font.size": 12,
        "text.color": INK,
        "axes.labelcolor": INK,
        "xtick.color": MUTED,
        "ytick.color": INK,
        "svg.fonttype": "none",
    })
    fig = plt.figure(figsize=(10.8, 10.8), dpi=pixels / 10.8, facecolor=CREAM)
    fig.text(.085, .942, "UV-A ANAPOLE  /  REPORTED EVENT TIMES", size=11.5,
             weight="bold", color=GREEN, va="top")
    fig.text(.08, .89, "When do the electric and\nmagnetic events occur?", size=28,
             weight="bold", linespacing=1.17, va="top")
    fig.text(.085, .773, "14 published pairs  ·  4 instances  ·  366.5 nm", size=13,
             color=MUTED, va="top")

    ax = fig.add_axes([.135, .465, .78, .235], facecolor=CREAM)
    ax.set_xlim(8.3, 10.6)
    ax.set_ylim(-.55, 1.5)
    ax.set_yticks([1, 0], labels=["E", "H"], fontsize=17, weight="bold")
    ax.tick_params(axis="y", length=0, pad=18)
    ax.set_xticks(np.arange(8.4, 10.61, .4))
    ax.tick_params(axis="x", length=0, pad=10, labelsize=11)
    ax.set_xlabel("Reported time (fs)", fontsize=12, labelpad=12)
    for spine in ax.spines.values():
        spine.set_visible(False)
    for y in [0, 1]:
        ax.axhline(y, color=GRID, lw=1.4, zorder=0)
    for x in np.arange(8.4, 10.61, .4):
        ax.axvline(x, color=GRID, lw=.7, alpha=.6, zorder=0)
    electric = np.array([r["electricTimeFs"] for r in rows])
    magnetic = np.array([r["magneticTimeFs"] for r in rows])
    ax.scatter(electric, np.ones(len(rows)), s=35, color=GREEN, alpha=.24,
               edgecolor=CREAM, linewidth=.8, zorder=2)
    ax.scatter(magnetic, np.zeros(len(rows)), s=35, color=WALNUT, alpha=.24,
               edgecolor=CREAM, linewidth=.8, zorder=2)
    selected_e = ax.scatter([], [], s=125, color=GREEN, edgecolor=CREAM,
                            linewidth=2, zorder=5)
    selected_h = ax.scatter([], [], s=125, color=WALNUT, edgecolor=CREAM,
                            linewidth=2, zorder=5)
    link, = ax.plot([], [], color=INK, lw=1.7, alpha=.65, zorder=3)
    e_time = ax.text(8.3, 1.25, "", fontsize=13, weight="bold", color=GREEN,
                     ha="center", va="bottom")
    h_time = ax.text(8.3, -.19, "", fontsize=13, weight="bold", color=WALNUT,
                     ha="center", va="top")

    # Fixed information block: one source pair at a time; no interpolation.
    fig.add_artist(patches.FancyBboxPatch(
        (.08, .245), .84, .14, boxstyle="round,pad=0.009,rounding_size=.012",
        transform=fig.transFigure, facecolor=PALE, edgecolor="none", zorder=0))
    instance = fig.text(.105, .36, "", size=12, color=MUTED, va="top")
    delay = fig.text(.105, .326, "", size=28, weight="bold", va="top")
    fig.text(.105, .273, "H time − E time", size=10.7, color=MUTED, va="top")
    fig.text(.595, .355, "Reported electric intensity", size=11.5,
             color=MUTED, va="top")
    intensity = fig.text(.595, .315, "", size=21, weight="bold", va="top")
    fig.text(.595, .273, r"$|E|^2/|E_0|^2$  (dimensionless)", size=10.7,
             color=MUTED, va="top")

    # Each dot is a source row; equal dot sizes do not encode E/H magnitudes.
    dots = []
    for i in range(len(rows)):
        dot = patches.Circle((.224 + i * .0424, .211), .0036,
                             transform=fig.transFigure, facecolor=GRID,
                             edgecolor="none")
        fig.add_artist(dot)
        dots.append(dot)
    fig.text(.5, .181, "Discrete published samples · no spatial field reconstruction",
             size=10.4, color=MUTED, ha="center", va="top")
    fig.add_artist(plt.Line2D([.085, .915], [.143, .143], transform=fig.transFigure,
                             color=GRID, linewidth=.8))
    fig.text(.085, .128, "Poeta, Vilarinho, López-García & De Beule", size=8.1, va="top", color=MUTED)
    fig.text(.085, .110, "“Optical anapoles excited by UV-A illumination”", size=8.1, va="top", color=MUTED)
    fig.text(.085, .092, "Optics Letters 49, 7198–7201 (2024) · Article DOI: 10.1364/OL.536925",
             size=8.1, va="top", color=MUTED)
    fig.text(.085, .074, "Data: supplement Fig. S2 · DOI: 10.6084/m9.figshare.27648525.v5 · CC BY 4.0",
             size=8.1, va="top", color=MUTED)
    fig.text(.085, .056, "Graph redrawn from the published table; time differences calculated from its values.",
             size=8.1, va="top", color=MUTED)

    def update(index: int):
        row = rows[index]
        te, th = row["electricTimeFs"], row["magneticTimeFs"]
        selected_e.set_offsets([[te, 1]])
        selected_h.set_offsets([[th, 0]])
        link.set_data([te, th], [1, 0])
        # Keep edge labels inside the plotting area without moving the events.
        e_time.set_x(min(max(te, 8.45), 10.45))
        h_time.set_x(min(max(th, 8.45), 10.45))
        e_time.set_text(f"{te:.2f} fs")
        h_time.set_text(f"{th:.2f} fs")
        instance.set_text(f"Instance {row['instance']}   ·   pair {index + 1} / {len(rows)}")
        delay.set_text(f"Δt = {row['delayFs']:.2f} fs")
        intensity.set_text(f"{row['electricIntensity']:.3f}")
        for i, dot in enumerate(dots):
            dot.set_facecolor(GREEN if i == index else GRID)
        return selected_e, selected_h, link, e_time, h_time, instance, delay, intensity, *dots

    update(0)
    return fig, update


def write_caption(path: Path, duration_seconds: float) -> None:
    text = """When do the electric and magnetic events occur during UV-A anapole excitation?

Our temporal analysis reports a 0.26–0.32 fs offset between selected electric- and magnetic-field events in a free-standing amorphous TiO₂ resonator. At 366.5 nm, this is approximately a quarter of the optical period.

This animation redraws all 14 reported pairs from the supplementary table. It preserves each electric time, magnetic time and normalized electric-intensity value. The moving selection steps through published samples; it does not reconstruct spatial fields or introduce a magnetic-field amplitude.

The temporal observation complements the multipole and scattering analysis. It does not, on its own, establish the phase of the entire field or prove zero radiation.

Source: Diogo Poeta, Rafael Vilarinho, Martín López-García and Pieter A. A. De Beule, “Optical anapoles excited by UV-A illumination,” Optics Letters 49(24), 7198–7201 (2024).
https://doi.org/10.1364/OL.536925

Data: supplement Fig. S2, version 5, CC BY 4.0.
https://doi.org/10.6084/m9.figshare.27648525.v5
https://creativecommons.org/licenses/by/4.0/

Graph redrawn and time differences calculated from the published values. The animation is silent and advances through 14 discrete samples over DURATION_SECONDS seconds.
"""
    path.write_text(text.replace("DURATION_SECONDS", f"{duration_seconds:g}"), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    script_dir = Path(__file__).resolve().parent
    default_input = script_dir / "anapole-temporal-samples.json"
    if not default_input.exists():
        default_input = script_dir / "prepared" / "anapole-temporal-samples.json"
    parser.add_argument("--input", type=Path, default=default_input)
    parser.add_argument("--output-dir", type=Path, default=Path("outputs"))
    parser.add_argument("--pixels", type=int, default=1080)
    parser.add_argument("--fps", type=int, default=24)
    parser.add_argument("--seconds-per-sample", type=float, default=1.)
    parser.add_argument("--poster-sample", type=int, default=5,
                        help="Source pair for the poster, one-based (default 5).")
    args = parser.parse_args()
    if args.pixels < 360 or args.pixels % 2:
        raise ValueError("Pixel dimension must be even and at least 360.")
    if args.fps < 1 or args.seconds_per_sample <= 0:
        raise ValueError("Frame rate and sample duration must be positive.")
    _, rows = load_samples(args.input)
    if not 1 <= args.poster_sample <= len(rows):
        raise ValueError("Poster sample outside the source table.")
    args.output_dir.mkdir(parents=True, exist_ok=True)
    stem = args.output_dir / "anapole-temporal-timing"
    fig, update = draw_figure(rows, args.pixels)
    update(args.poster_sample - 1)
    fig.savefig(f"{stem}-poster.png", dpi=fig.dpi, facecolor=CREAM)
    # At 1fps each GIF frame is exactly one unchanged source sample.
    gif = animation.FuncAnimation(fig, update, frames=len(rows), interval=1000 * args.seconds_per_sample,
                                  repeat=True, blit=False)
    gif.save(f"{stem}.gif", writer=animation.PillowWriter(fps=1 / args.seconds_per_sample), dpi=fig.dpi)

    import imageio_ffmpeg

    plt.rcParams["animation.ffmpeg_path"] = imageio_ffmpeg.get_ffmpeg_exe()
    # Render each source sample once. FFmpeg repeats unchanged images to encode
    # the requested output frame rate; it does not interpolate scientific data.
    video = animation.FuncAnimation(fig, update, frames=len(rows),
                                    interval=1000 * args.seconds_per_sample, repeat=True, blit=False)
    writer = animation.FFMpegWriter(fps=1 / args.seconds_per_sample, codec="libx264", bitrate=3200,
                                    metadata={"title": "Reported electric and magnetic event times in UV-A anapole excitation",
                                              "artist": "Data: Poeta et al. (2024), supplement Fig. S2",
                                              "comment": "CC BY 4.0 source; redrawn data plot. DOI:10.6084/m9.figshare.27648525.v5"},
                                    extra_args=["-r", str(args.fps), "-pix_fmt", "yuv420p",
                                                "-movflags", "+faststart", "-an"])
    video.save(f"{stem}.mp4", writer=writer, dpi=fig.dpi)
    duration_seconds = len(rows) * args.seconds_per_sample
    write_caption(Path(f"{stem}-caption.txt"), duration_seconds)
    metadata = {
        "source": "https://doi.org/10.6084/m9.figshare.27648525.v5",
        "license": "CC BY 4.0",
        "dimensions": [args.pixels, args.pixels],
        "durationSeconds": duration_seconds,
        "fps": args.fps,
        "samples": len(rows),
        "rendering": "Discrete source samples; no numerical interpolation or spatial field reconstruction.",
        "posterSample": args.poster_sample,
        "files": [f"{stem.name}{suffix}" for suffix in
                  (".mp4", ".gif", "-poster.png", "-caption.txt", "-metadata.json")],
    }
    Path(f"{stem}-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    plt.close(fig)
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()

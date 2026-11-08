# Anapole timing and fields

Two datasets accompany the 2024 UV-A anapole paper. The timing samples come from the supplement. The field cycle comes from a separate Meep calculation at 366.5 nm.

| Dataset | Watch | Download |
| --- | --- | --- |
| Published electric and magnetic timing | [Interactive plot](https://diogo-poeta.github.io/elyvris/research.html#anapole-temporal) · [Video](anapole-temporal-timing.mp4) | [Samples](anapole-temporal-samples.json) · [Caption](anapole-temporal-timing-caption.txt) |
| Calculated steady-state fields | [Interactive field viewer](https://diogo-poeta.github.io/elyvris/research.html#anapole-field-cycle) · [Video](anapole-field-cycle.mp4) | [Complex fields at z = 0](rectangle-xy.json) · [Poster](anapole-field-cycle-poster.png) · [Caption](anapole-field-cycle-caption.txt) · [Render settings](anapole-field-cycle-metadata.json) |

## Published samples

Supplement Fig. S2 reports 14 timing pairs across four instances. Electric events span 8.36–10.26 fs and magnetic events span 8.63–10.52 fs. The delay is the magnetic time minus the electric time, rounded to 0.01 fs. The plot shows discrete events along a shared time axis. Inferring field phase would require signed fields and a spatial reference.

[Original timing table](published-s2-table.svg) · [Original radiated-power figure](published-s3-power.svg) · [Transcription methods](METHODS.md)

## Independent three-dimensional field calculation

The Meep run uses a 190 × 160 × 100 nm TiO₂ rectangle in air at 366.5 nm. The exported plane contains all three complex components of E and H on a 56 × 50 grid at z = 0. Both fields use the same phase convention and fixed display scales. This calculation describes one steady-state cycle. The timing plot above shows events from the published formation transient.

[Run the simulation](SIMULATION.md#reproduce) · [Validation and assumptions](SIMULATION.md) · [Convergence data](convergence.json) · [Numerical audit](NUMERICAL_AUDIT.md)

## Processing and checks

Run these commands from this directory with Python 3.10 or later:

```sh
python -m pip install -r requirements.txt
python check_published_timing.py
python -m unittest -v test_complex_fields.py
python render_timing_animation.py --input anapole-temporal-samples.json --output-dir outputs
```

To check the stored diagnostics and render the field cycle from the exported plane:

```sh
python check_meep.py --review-report convergence.json
python render_field_cycle.py --self-test
python render_field_cycle.py --input rectangle-xy.json --convergence convergence.json --output-dir outputs --formats poster mp4 --pixels 1080 --duration 10 --fps 24 --arrows
```

To generate new fields, follow the [Meep run instructions](SIMULATION.md#reproduce). They use the [pinned material table](Jolivet-amorphous.yml) and produce full complex-vector NPZ files, the compact xy JSON, and validation records. The [complex-field importer](complex_fields.py) supports CSV and NPZ exports.

## Source and attribution

Diogo Poeta, Rafael Vilarinho, Martín López-García, and Pieter A. A. De Beule. *Optical anapoles excited by UV-A illumination*, **Optics Letters 49**(24), 7198–7201 (2024). Poeta and Vilarinho contributed equally. [Paper](https://doi.org/10.1364/OL.536925) · [Supplement, version 5](https://doi.org/10.6084/m9.figshare.27648525.v5)

Supplement Figs. S2 and S3 are available under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The transcription, calculated delays, redrawn plot, and playback controls are adaptations. The SVG source figures preserve the published content and scales.

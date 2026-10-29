# Optical anapole timing and an independent 3D field cycle

This companion contains two distinct results: the fourteen published electric/magnetic timing pairs from supplementary Fig. S2, and a new independent three-dimensional Maxwell calculation of the paper's isolated rectangle. The published timing data retain their original values; the new complex field dataset reconstructs a steady-state optical cycle. They are not combined into a claimed reproduction of the original transient.

Diogo Poeta, Rafael Vilarinho, Martín López-García and Pieter A. A. De Beule, *Optical anapoles excited by UV-A illumination*, **Optics Letters 49**(24), 7198–7201 (2024). Poeta and Vilarinho contributed equally.

[Article](https://doi.org/10.1364/OL.536925) · [Supplement, version 5](https://doi.org/10.6084/m9.figshare.27648525.v5) · [Interactive research notes](https://diogo-poeta.github.io/lumefern/research.html#anapole-temporal)

## Shareable media

- [Independent 3D field-cycle video](anapole-field-cycle.mp4), [poster](anapole-field-cycle-poster.png), [caption](anapole-field-cycle-caption.txt) and [render metadata](anapole-field-cycle-metadata.json).
- [Published timing-sample video](anapole-temporal-timing.mp4) and [caption](anapole-temporal-timing-caption.txt).

The first video reconstructs independently calculated spatial fields at one
optical frequency. The second advances through the fourteen published timing
samples. Both are silent, with their scientific scope stated in the captions.

## Published samples

The electric times span 8.36–10.26 fs; the corresponding magnetic times span 8.63–10.52 fs. The four published instances contain 3, 4, 4 and 3 rows. `anapole-temporal-samples.json` is a transcription of the table; `delayFs` is calculated as magnetic time minus electric time, rounded to the table's 0.01 fs precision.

At 366.5 nm, a free-space optical period is approximately 1.223 fs. A quarter-period is approximately 0.306 fs, comparable to the reported intervals. This comparison does not determine a signed-field phase from intensity samples. The table does not specify a spatial observation point, provide magnetic amplitudes, or identify every row as a maximum.

The animated cursor scans a common time axis. Sample markers and reported values remain discrete. No spatial fields or intermediate field values are inferred from the table. The nearby supplement Fig. S3 is a published radiated-power plot; its numerical time series is not available here.

## Processing and checks

Use Python 3.10 or later in a project environment. Install the packages in `requirements.txt`, then run:

```text
python -m pip install -r requirements.txt
python check_published_timing.py
python check_published_timing.py --data anapole-temporal-samples.json
python -m unittest -v test_complex_fields.py
python render_timing_animation.py --input anapole-temporal-samples.json --output-dir outputs
```

`render_timing_animation.py` creates a standalone plot animation from the table. Its help lists the input and output paths. The flat package keeps the JSON beside the scripts; no development directory is needed. Output files go to the requested directory. `complex_fields.py` is separate tooling for genuine complex field exports: it reads CSV or NPZ arrays, preserves the spatial phase, reconstructs E and H with the shared convention exp(−iωt), and supports Maxwell-residual checks on complete three-dimensional grids. Its tests use analytical travelling and standing waves, not claimed anapole results.

Intensity figures cannot supply the missing complex phases. The original Lumerical project and raw field exports are not included in the public supplement. An executable field importer is therefore distinct from reproducing the original FDTD calculation.

## Independent three-dimensional field calculation

`rectangle-xy.json` contains total complex E and H vector fields from a new
Meep 1.29.0 calculation: the isolated 190 × 160 × 100 nm rectangle in air,
366.5 nm illumination, E along its 190 nm x axis, propagation +z. The final
plane is z=0 on a 56 × 50 grid. The pinned Jolivet amorphous-TiO₂ table gives
n=2.8080755556 and k=0 at this wavelength. The solver uses this constitutive
value at one frequency; it does not model the material's broadband pulse dynamics.

Both fields share exp(−iωt): reconstruct each component as re*cos(phi) +
im*sin(phi), without adding a magnetic quarter-cycle shift. Values are
normalized to E₀=1 V/m and H₀=E₀/Z₀. The displayed squared fields use all three
components and fixed cycle-wide scales. They are not energy-density ratios.

The 10→6.67 nm mesh comparison changes complex E/H away from interfaces by
2.87%/2.79%, and scattering cross section by 4.58%. A larger cell and thicker
PML change complex fields by about 1.5×10⁻⁵ relative. These checks support a
qualitative field-cycle display; sharp-edge sampled maxima remain mesh sensitive.
See [SIMULATION.md](SIMULATION.md), [NUMERICAL_AUDIT.md](NUMERICAL_AUDIT.md),
`validation.json` and `convergence.json` for settings, diagnostics and limits.

This is independent Meep output, not the authors' original Lumerical data or
the published formation transient. No new multipole decomposition or anapole
identification is claimed. The new field cycle and the published timing table
must retain that distinction.

To inspect the compact recorded diagnostics with NumPy:

```sh
python check_meep.py --review-report convergence.json
python render_field_cycle.py --self-test
python render_field_cycle.py --input rectangle-xy.json --convergence convergence.json --output-dir outputs --formats poster mp4 --pixels 1080 --duration 10 --fps 24 --arrows
```

That command rechecks stored diagnostic thresholds; it does not recompute the
fields. To reproduce and compare the full three-dimensional fields, activate an
existing Linux [Meep environment](https://meep.readthedocs.io/en/latest/Installation/)
and run these commands from this directory:

```sh
python meep_rectangle.py --resolution 100 --output simulation/res100
python meep_rectangle.py --resolution 150 --output simulation/res150
python meep_rectangle.py --resolution 100 --cell 1.2 --pml .25 --output simulation/domain100
python check_meep.py --coarse simulation/res100 --fine simulation/res150 --domain simulation/domain100 --output regenerated-convergence.json
```

The solver reads adjacent `Jolivet-amorphous.yml`; `--material-table` can
explicitly select its path. Each run generates complete complex-vector NPZ
files, its compact xy JSON and `validation.json`. Full NPZ runs and local
dependency binaries are omitted from this compact publication; the public
source and pinned material table regenerate them.

## Source and attribution

The timing data and reproduced supplementary figures are from Fig. S2 and Fig. S3 of the cited supplement, released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The data transcription, calculated delays, redrawn timing graph and playback controls are adaptations. The source table and power figure retain their published content and scales. Full author, article and supplement attribution appears above and in the data file.

The original anapole study used Lumerical FDTD and MENP. A minimum in scattering, the relevant multipole interference and the near-field structure must be considered together when identifying the mode. The timing table alone is not evidence of zero total radiation.

## Package contents

Published timing data, independent complex field data, solver/importer source,
checkers, renderers, requirements, audits, methods and S2/S3 SVG wrappers are flat
in this directory. See [METHODS.md](METHODS.md) for the published geometry, data
limits and attribution. Source-figure wrappers embed the original images and
can be opened directly in a browser. The material table is from the CC0
refractiveindex.info database, with its original publication recorded inside.
No private runtime or original author project is included.

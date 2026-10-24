# Anapole formation: electric and magnetic timing

This companion makes the fourteen electric/magnetic timing pairs in supplementary Fig. S2 inspectable. Each row retains its published electric time, magnetic time and normalized electric intensity. The reported delay is **0.26–0.32 fs**.

Diogo Poeta, Rafael Vilarinho, Martín López-García and Pieter A. A. De Beule, *Optical anapoles excited by UV-A illumination*, **Optics Letters 49**(24), 7198–7201 (2024). Poeta and Vilarinho contributed equally.

[Article](https://doi.org/10.1364/OL.536925) · [Supplement, version 5](https://doi.org/10.6084/m9.figshare.27648525.v5) · [Interactive research notes](https://diogo-poeta-photonics.classy-mesa-1544.chatgpt.site/research.html#anapole-temporal)

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

## Source and attribution

The timing data and reproduced supplementary figures are from Fig. S2 and Fig. S3 of the cited supplement, released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The data transcription, calculated delays, redrawn timing graph and playback controls are adaptations. The source table and power figure retain their published content and scales. Full author, article and supplement attribution appears above and in the data file.

The original anapole study used Lumerical FDTD and MENP. A minimum in scattering, the relevant multipole interference and the near-field structure must be considered together when identifying the mode. The timing table alone is not evidence of zero total radiation.

## Package contents

The source data, checker, field importer/tests, renderer, requirements, audit, methods and S2/S3 SVG wrappers are flat in this directory. See [METHODS.md](METHODS.md) for geometry, data limits and attribution. Source-figure wrappers embed the original images; they can be opened directly in a browser. No private runtime or original author project is included.

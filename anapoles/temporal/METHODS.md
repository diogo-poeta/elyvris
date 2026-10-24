# Timing data and field-import methods

This package provides a reproducible presentation of published temporal samples. It contains no original Lumerical project, recovered FDTD field movie, or new anapole simulation.

## Source record

Diogo Poeta, Rafael Vilarinho, Martín López-García and Pieter A. A. De Beule, **Optical anapoles excited by UV-A illumination**, *Optics Letters* **49**(24), 7198–7201 (2024). Poeta and Vilarinho contributed equally.

- Article: https://doi.org/10.1364/OL.536925
- Supplement, version 5: https://doi.org/10.6084/m9.figshare.27648525.v5
- Official version metadata: https://api.figshare.com/v2/articles/27648525/versions/5
- Supplement PDF: https://ndownloader.figshare.com/files/52787981
- Thesis: https://doi.org/10.4119/unibi/3020621

The inspected supplement record contains one PDF, not a complex-field or time-series export. Its SHA-256 is `ac9af68f6bd209a005057a11ddb71b53b237d08f48d0d60f6481bc0db51edac3`. Figure S2 is a **table** of fourteen paired electric/magnetic times, grouped into four instances. Figure S3 is a **static radiated-power chart**. The corresponding thesis figures are 7.5 and 7.6. Source-image SVG wrappers preserve the extracted published image bytes and scales.

## Transcription and numerical checks

`anapole-temporal-samples.json` retains each printed time and electric value. The column labels are Time |E|², Time |H|² and |E|²/|E0|². Time is in femtoseconds; the electric ratio is dimensionless. Instance groups contain 3, 4, 4 and 3 rows.

Electric times span **8.36–10.26 fs**. Magnetic times span **8.63–10.52 fs**. The source prose's shorter end time describes the electric entries. Each `delayFs` is magnetic time minus electric time at 0.01 fs precision. The range is **0.26–0.32 fs**, mean 0.292142857 fs and median 0.31 fs. The checker compares every value with a second manual transcription, using decimal arithmetic.

At 366.5 nm, the vacuum period λ/c is **1.222512409 fs**; a quarter-period is **0.305628102 fs**. This is a comparison scale. It does not establish a global E/H phase from selected intensity-event times. The table does not specify its spatial observation or integration rule, provide magnetic amplitudes, or identify every row as a maximum. No named formation/stabilization/decay stage is assigned to individual rows here.

The web cursor scans the time axis while samples remain discrete. The standalone renderer steps through the fourteen source rows. Neither infers intermediate field values or spatial field maps. S3 is included as the published chart; no numerical power trace has been digitized or invented.

## Physical context

The temporal study concerns a free-standing amorphous TiO₂ nano-rectangle in air, **190 × 160 × 100 nm**, driven at normal incidence with the incident electric field along the long axis. A scattering minimum is reported near **366.5 nm**. The original study used Lumerical FDTD and MENP multipole decomposition. The periodic array on fused silica is a different configuration.

Anapole identification requires the scattering response, relevant electric/toroidal multipole interference and spatial field structure. A timing offset alone does not identify an anapole or prove zero total radiation. Other multipoles and absorption can persist.

## Complex-field importer

`complex_fields.py` accepts genuine complex CSV or NPZ solver exports, retaining spatial phase under the convention exp(−iωt). Coordinates are in nm; E is in V/m and H in A/m. Array order is (nx, ny, nz, 3), with Cartesian components x/y/z. Complete three-dimensional grids permit differential Maxwell-residual checks; a two-dimensional slice alone does not supply all derivatives.

Its tests use analytical travelling and standing waves and invalid input cases. They validate the importer and reconstruction, **not the published nano-rectangle simulation**. Intensity-only source figures cannot supply the missing complex phases.

## Reuse

The supplement is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Retain the complete author, article-title, journal and DOI credit above. The data transcription, calculated differences, redrawn graphs and playback controls are adaptations. The extracted S2/S3 images retain their source content. This supplement license is not a blanket license for other article figures.

`timing-audit.json` records derived statistics and the SHA-256 hashes of the two source-image wrappers.

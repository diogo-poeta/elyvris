# Elyvris

**Light, unfolded.** Elyvris is an open workshop for computational photonics. It explains the physics in plain language, offers free browser tools that turn a sketch into a layout and a simulation script, and shows the published research behind them.

**Website:** [diogo-poeta.github.io/elyvris](https://diogo-poeta.github.io/elyvris/)

## Learn

Short, illustrated explainers of the ideas behind a simulation.

- [n and k, explained](https://diogo-poeta.github.io/elyvris/refractive-index.html). What the refractive index *n* and the extinction coefficient *k* do to light, with an explorer that plots both for real materials across the wavelength range. Data from the [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database) (CC0).
- [Anapoles, explained](https://diogo-poeta.github.io/elyvris/anapoles.html). Why a TiO₂ particle can scatter almost no light at an ultraviolet wavelength while it concentrates the field inside.
- [Single-film calculator](https://diogo-poeta.github.io/elyvris/lab.html). Reflection, transmission and absorption of one thin film on a substrate (transfer-matrix method).

## Tools

- [Studio](https://diogo-poeta.github.io/elyvris/studio.html). Place spheres, cylinders, rings, boxes and other shapes in 3D, give each a material, and get the matching [gdsfactory](https://github.com/gdsfactory/gdsfactory) layout script (it writes a GDS file that opens in [KLayout](https://www.klayout.de/)) and the [Meep](https://github.com/NanoComp/meep) `geometry` list. You can also paste code and see what it draws. It runs in your browser and nothing is uploaded.

Studio draws; it does not simulate. You run the code on your own computer.

## Research

From transparent metal films (2021) to ultraviolet anapoles, tunable vacuum-ultraviolet light for gas sensing and slow light in TiO₂ thin films (2026). The [research page](https://diogo-poeta.github.io/elyvris/research.html) tells the full story.

| Year | Work | Links |
| --- | --- | --- |
| 2021 | *Extraordinary transparency in continuous metallic thin films.* MSc thesis, University of Minho, with INL | [Thesis](https://zenodo.org/records/6346240) |
| 2024 | *Optical anapoles excited by UV-A illumination.* Optics Letters 49, 7198 | [Paper](https://doi.org/10.1364/OL.536925) · [Supplement](https://doi.org/10.6084/m9.figshare.27648525.v5) · [Notes in this repo](anapoles/) |
| 2025 | *Volatile organic compound photoionization utilizing tunable quasi-monochromatic vacuum ultraviolet down to 120 nm obtained by third harmonic generation from a suspended dielectric nanomembrane.* Optics Express 33, 26342 (co-author) | [Paper](https://doi.org/10.1364/OE.564577) |
| 2026 | *Real-time molecular specific BTEX detection at TLV-TWA concentration levels.* Environmental Technology & Innovation 42, 104895 (co-author) | [Paper](https://doi.org/10.1016/j.eti.2026.104895) |
| 2026 | *Energy velocity as an optical design indicator for the ultraviolet nonlinear response of ALD-grown TiO₂ thin films.* Optical Materials Express 16, 3342 | [Paper](https://doi.org/10.1364/OME.611814) · [Supplement](https://doi.org/10.6084/m9.figshare.33781774.v2) · [Notes in this repo](energy-velocity/) |
| 2026 | *Tunable VUV photoionization and slow-light enhanced third-harmonic generation in TiO₂ for selective VOC sensing.* PhD thesis, Bielefeld University | [Thesis](https://doi.org/10.4119/unibi/3020621) |

### One check you can repeat

The [anapole notes](anapoles/) include an independent 3D [Meep example](anapoles/temporal/SIMULATION.md#reproduce) of the TiO₂ particle, with the commands, material data and checks. At 366.5 nm, refining the mesh from 10 to 6.67 nm changed the scattering cross section by **4.6%**. Enlarging the domain and thickening its absorbing boundary at the original mesh spacing changed it by **less than 0.001%**. So the mesh, not the domain, limits the precision of this result. [Convergence data](anapoles/temporal/convergence.json)

## Coming next

These are plans, not finished work.

- **Studio → Meep in one click.** A complete, runnable simulation script from the shapes you draw, not only the geometry.
- **Thesis results with free solvers.** Published results computed with commercial FDTD software, reproduced in Meep, with every check shown.
- **Design for fabrication.** How small fabrication errors move an optical resonance.

## In this repository

| Folder or file | What it holds |
| --- | --- |
| [`website/`](website/) | Source of the website. GitHub Pages publishes it from `main`. [How to preview and check it](website/README.md). |
| [`anapoles/`](anapoles/) | Notes, field data, timing samples and the Meep example for the 2024 anapole paper. |
| [`energy-velocity/`](energy-velocity/) | Published values and notes for the 2026 energy-velocity paper. |
| [`references.bib`](references.bib) · [`sources.json`](sources.json) | BibTeX entries and the data sources used on the site. |

## Contact

Diogo Poeta, Photonics R&D | Optical Systems and Simulation | PhD Physicist.
[LinkedIn](https://pt.linkedin.com/in/diogo-poeta) · [Google Scholar](https://scholar.google.com/citations?user=9GATdmUAAAAJ) · [ORCID](https://orcid.org/0009-0002-1451-5147) · [ResearchGate](https://www.researchgate.net/profile/Diogo-Poeta)

<sub>This project is made with the assistance of artificial intelligence.</sub>

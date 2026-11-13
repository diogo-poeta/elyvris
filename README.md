# Elyvris

**Light, unfolded.** Elyvris is an open workshop for computational photonics. It offers free browser tools that turn a sketch into a layout and a simulation script, and shows the published research behind them.

**Website:** [diogo-poeta.github.io/elyvris](https://diogo-poeta.github.io/elyvris/)

## Tools

- [Studio](https://diogo-poeta.github.io/elyvris/studio.html). Place spheres, cylinders, rings, boxes and other shapes in 3D, give each a material, and get the matching [gdsfactory](https://github.com/gdsfactory/gdsfactory) layout script (it writes a GDS file that opens in [KLayout](https://www.klayout.de/)) and the [Meep](https://github.com/NanoComp/meep) `geometry` list. You can also paste code and see what it draws. It runs in your browser and nothing is uploaded.

Studio draws; it does not simulate. You run the code on your own computer.

## Research

From transparent metal films (2021) to ultraviolet anapoles, tunable vacuum-ultraviolet light for gas sensing and slow light in TiO₂ thin films (2026). On the [research page](https://diogo-poeta.github.io/elyvris/research.html) you can read the four articles and the PhD thesis directly in the browser.

| Year | Work | Links |
| --- | --- | --- |
| 2021 | *Extraordinary transparency in continuous metallic thin films.* MSc thesis, University of Minho, with INL | [Thesis](https://zenodo.org/records/6346240) |
| 2024 | *Optical anapoles excited by UV-A illumination.* Optics Letters 49, 7198 | [Paper](https://doi.org/10.1364/OL.536925) · [Supplement](https://doi.org/10.6084/m9.figshare.27648525.v5) |
| 2025 | *Volatile organic compound photoionization utilizing tunable quasi-monochromatic vacuum ultraviolet down to 120 nm obtained by third harmonic generation from a suspended dielectric nanomembrane.* Optics Express 33, 26342 (co-author) | [Paper](https://doi.org/10.1364/OE.564577) |
| 2026 | *Real-time molecular specific BTEX detection at TLV-TWA concentration levels.* Environmental Technology & Innovation 42, 104895 (co-author) | [Paper](https://doi.org/10.1016/j.eti.2026.104895) |
| 2026 | *Energy velocity as an optical design indicator for the ultraviolet nonlinear response of ALD-grown TiO₂ thin films.* Optical Materials Express 16, 3342 | [Paper](https://doi.org/10.1364/OME.611814) · [Supplement](https://doi.org/10.6084/m9.figshare.33781774.v2) |
| 2026 | *Tunable VUV photoionization and slow-light enhanced third-harmonic generation in TiO₂ for selective VOC sensing.* PhD thesis, Bielefeld University | [Thesis](https://doi.org/10.4119/unibi/3020621) |

## Coming next

These are plans, not finished work.

- **Studio → Meep in one click.** A complete, runnable simulation script from the shapes you draw, not only the geometry.
- **Thesis results with free solvers.** Published results computed with commercial FDTD software, reproduced in Meep, with every check shown.
- **Design for fabrication.** How small fabrication errors move an optical resonance.

## In this repository

| Folder or file | What it holds |
| --- | --- |
| [`website/`](website/) | Source of the website. GitHub Pages publishes it from `main`. [How to preview and check it](website/README.md). |

## Contact

Diogo Poeta, Photonics R&D | Optical Systems and Simulation | PhD Physicist.
[LinkedIn](https://pt.linkedin.com/in/diogo-poeta) · [Google Scholar](https://scholar.google.com/citations?user=9GATdmUAAAAJ) · [ORCID](https://orcid.org/0009-0002-1451-5147) · [ResearchGate](https://www.researchgate.net/profile/Diogo-Poeta)

<sub>This project is made with the assistance of artificial intelligence.</sub>

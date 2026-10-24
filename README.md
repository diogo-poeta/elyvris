# UV nanophotonics — research companion

**Energy transport and optical anapoles in titanium dioxide.**

This is Diogo Poeta's companion to two collaborative publications. It collects physical insights, published simulation settings, and reference values for other researchers.

**Available:** source-linked research notes and selected published numerical values. **Original MEEP scripts, Lumerical projects, fitted material files, and raw field data are not included.** This repository documents the research; it does not reproduce the paper figures.

## Publications

| Study | Publication and supplement | Explore |
| --- | --- | --- |
| **Energy velocity as an optical design indicator for the ultraviolet nonlinear response of ALD-grown TiO₂ thin films** | *Optical Materials Express* **16**, 3342–3356 (2026). [Article](https://doi.org/10.1364/OME.611814) · [Supplement](https://doi.org/10.6084/m9.figshare.33781774.v2) | [Energy-velocity notes](energy-velocity/README.md) |
| **Optical anapoles excited by UV-A illumination** | *Optics Letters* **49**, 7198–7201 (2024). [Article](https://doi.org/10.1364/OL.536925) · [Supplement](https://doi.org/10.6084/m9.figshare.27648525.v5) | [Anapole notes](anapoles/README.md) |

Full author lists and BibTeX entries are in [references.bib](references.bib). Poeta and Vilarinho contributed equally to the anapole paper.

## Insights worth carrying into a simulation

1. **Identify an anapole with complementary evidence.** A scattering or transmission minimum is a starting point. Multipole interference, relative phase, and near-field structure establish the interpretation in the anapole study.
2. **Define the energy-velocity measurement region.** PML cells, interface fields, the averaging operation, and the material energy model affect the reported value. The silica control exposes an averaging offset comparable to part of the reported energy/group-velocity difference.
3. **Keep pump and harmonic wavelengths separate.** In the energy-velocity paper, the 380–400 nm transport results concern the generated harmonic; the experimental pumps are 1140–1200 nm.
4. **Model the complete measured stack.** Reflection THG from TiO₂/Si includes substrate contributions, interference, absorption, and extraction. It is not a direct measurement of the film's intrinsic nonlinear susceptibility.

The linked notes give the supporting figures, numerical settings, and limits for each point.

## Reference values and sources

- [Selected reference values](energy-velocity/reference-values.json): Table S8 optical constants and reported TiO₂ velocities, transcribed with units and provenance. These sparse values are **not a broadband material model**.
- [Source record](sources.json): article identifiers, exact supplement versions, and checksums verified against the public Figshare records on 17 October 2026.

## Portfolio and interactive optics lab

The complete static website source is in [`website/`](website/), including the portfolio, research explainers, optical-material data, and an interactive thin-film calculator. See the [website guide](website/README.md) for local preview, source attribution, validation, and free static-hosting options. These educational website calculations are distinct from the original paper simulations; the research companion folders above remain the source-linked record of the published methods and limits.
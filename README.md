# Lumafern

<img src="website/assets/brand/lumafern-logo.svg" alt="Lumafern" width="310">

Research animations: [electric and magnetic timing](anapoles/temporal/) and a [three-dimensional FDTD field cycle](anapoles/temporal/SIMULATION.md). Processing scripts, source data, numerical checks and shareable media are collected in the research companion.

Lumafern brings together Diogo Poeta's optics research, learning tools and a planned Python software framework for optical surrogate modelling and inverse design. The name pairs light with the unfolding growth of a fern: a simple idea of building understanding and software step by step.

**One project, three roles:** Lumafern is the project name; this repository holds its code and research companion; the [Lumafern website](https://diogo-poeta.github.io/lumafern/) presents the work and provides interactive tools.

**Available now:** **Film Bench**, a browser-based coherent **single-film** calculator, a portfolio and curated research records in [`website/`](website/), and the source-linked UV nanophotonics research notes below. The current calculator runs locally in the browser using referenced optical constants; it is not a trained surrogate or a multilayer design package.

**Planned framework:** the first stage is a Python reference and data-generation workflow for **multilayer thin-film transfer-matrix calculations (TMM)**. Subsequent planned work includes PyTorch surrogate training, reference-solver error benchmarks, explicit parameter/material validity domains and dataset provenance, followed by inverse-design candidates checked again with the reference solver. These Python/PyTorch training and inverse-design components are planned, not implemented in the current repository.

Website: [Lumafern](https://diogo-poeta.github.io/lumafern/) · Repository: [GitHub](https://github.com/diogo-poeta/lumafern). See the [website guide](website/README.md) for the current static site, local preview and validation.

---

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

## Lumafern website and Film Bench

The complete static website source is in [`website/`](website/), including the portfolio, research explainers, optical-material data, and **Film Bench**, the current coherent single-film calculator. Film Bench has its own tool name so it is distinguishable from the broader Lumafern software project. See the [website guide](website/README.md) for local preview, source attribution, validation, and free static-hosting options. These educational website calculations are distinct from the original paper simulations; the research companion folders above remain the source-linked record of the published methods and limits.

# Elyvris

Tools and research notes for thin-film and ultraviolet optics. I’m building a Python toolkit for layered optics. Inverse design is planned.

## Available

- [Film Bench](https://diogo-poeta.github.io/elyvris/lab.html) calculates reflection, transmission, and absorption for a single film. Change the thickness or material and see what happens to the spectrum.
- [TiO₂ field viewer](https://diogo-poeta.github.io/elyvris/research.html#anapole-field-cycle) shows the electric and magnetic fields over one optical cycle. The [anapole study notes](anapoles/) explain where the fields and timing data come from.
- [3D Meep example](anapoles/temporal/SIMULATION.md#reproduce) gives you the commands, material data, and checks to run the TiO₂ calculation.
- [Energy-velocity notes](energy-velocity/) explain how the averaging region affects the result and link to the values reported in the paper.

## One check from the Meep example

At 366.5 nm, refining the mesh from 10 to 6.67 nm changed the scattering cross section by **4.6%**. Enlarging the domain and thickening its absorbing boundary at the original mesh spacing changed it by **less than 0.001%**. If I needed a more precise scattering result for this setup, I’d refine the mesh again first. [Convergence data](anapoles/temporal/convergence.json)

## Papers

- *Optical anapoles excited by UV-A illumination* (2024). [Paper](https://doi.org/10.1364/OL.536925) · [Supplement](https://doi.org/10.6084/m9.figshare.27648525.v5)
- *Energy velocity as an optical design indicator for the ultraviolet nonlinear response of ALD-grown TiO₂ thin films* (2026). [Paper](https://doi.org/10.1364/OME.611814) · [Supplement](https://doi.org/10.6084/m9.figshare.33781774.v2)

[Research website](https://diogo-poeta.github.io/elyvris/research.html) · [BibTeX](references.bib) · [Data sources](sources.json)

# Optical anapoles excited by UV-A illumination

In the 2024 study, a TiO₂ rectangle in air showed a scattering minimum near **366.5 nm**, where electric and toroidal dipole contributions interfere and the field is confined inside the particle. The study proposes the structure for UV-to-VUV conversion. Its results concern the optical design and field response.

- [Watch the field cycle](https://diogo-poeta.github.io/elyvris/research.html#anapole-field-cycle).
- [Inspect the published timing samples](temporal/#published-samples).
- [Run the independent Meep example](temporal/SIMULATION.md#reproduce).

Diogo Poeta, Rafael Vilarinho, Martín López-García, and Pieter A. A. De Beule. Poeta and Vilarinho contributed equally. *Optics Letters* **49**(24), 7198–7201 (2024). [Paper](https://doi.org/10.1364/OL.536925) · [Supplement](https://doi.org/10.6084/m9.figshare.27648525.v5)

## Two geometries to keep separate

| Setting | Isolated particle | Periodic array |
| --- | --- | --- |
| TiO₂ rectangle | Length 190 nm, width 160 nm, height 100 nm | Same dimensions |
| Surroundings | Free-standing particle in air | Fused-silica substrate, 600 nm thick, suspended in air |
| Illumination | Normal incidence; electric field along the long axis | Normal incidence with the selected particle orientation |
| Period | Not applicable | 733 nm |
| Reported feature | Anapole near 366.5 nm | Anapole response near 370 nm; reported Q about 34 |
| Evidence | Main Figs. 2–3 | Main Figs. 4–5; Supplement Figs. S8–S9 |

The paper used Lumerical FDTD for the fields and an adapted MENP implementation for the multipoles. The material sources are Jolivet et al. (TiO₂, Ref. 23) and Malitson (fused silica, Ref. 31).

## How the mode was identified

- Look for the scattering minimum, the relative phase of the electric and toroidal contributions, and localized fields at the same wavelength. See Figs. 2–3 and Supplement Section 7.
- Check how the result changes with width, shape, and illumination angle. The 190 nm square and the ellipsoid with the rectangle’s dimensions lose the selected response. In the tested geometry, the minimum weakens beyond roughly 25°. See Fig. 3(c) and Supplement Figs. S1 and S4–S7.
- In the array, some periods give transmission minima with a different field pattern. Compare the spectrum and fields before assigning the mode. See Supplement Fig. S9.

## Time-dependent fields and reported timing

The [temporal companion](temporal/) contains 14 electric and magnetic timing pairs from Supplement Fig. S2. The separate [Meep example](temporal/SIMULATION.md) calculates a steady-state cycle at 366.5 nm using the isolated geometry. Reproducing the original formation transient would require the original Lumerical project and complex field exports.

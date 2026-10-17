# Optical anapoles excited by UV-A illumination

Diogo Poeta, Rafael Vilarinho, Martín López-García, and Pieter A. A. De Beule. Poeta and Vilarinho contributed equally. *Optics Letters* **49**(24), 7198–7201 (2024).

[Article: 10.1364/OL.536925](https://doi.org/10.1364/OL.536925) · [Supplement, version 5](https://doi.org/10.6084/m9.figshare.27648525.v5) · [Repository overview](../README.md)

## What the study establishes

The study numerically identifies UV-A anapole states in amorphous TiO₂ nanostructures and proposes a periodic array on fused silica. The selected isolated rectangle has a scattering minimum near **366.5 nm**, supported by electric/toroidal dipole interference and confined fields. This is a numerical design study; enhanced UV-to-VUV conversion is an application motivation, not a measured conversion efficiency in this paper.

## Two geometries to keep separate

| Setting | Isolated particle | Periodic array |
| --- | --- | --- |
| TiO₂ rectangle | Length 190 nm, width 160 nm, height 100 nm | Same dimensions |
| Surroundings | Free-standing particle in air | Fused-silica substrate, 600 nm thick, suspended in air |
| Illumination | Normal incidence; electric field along the long axis | Normal incidence with the selected particle orientation |
| Period | Not applicable | 733 nm |
| Reported feature | Anapole near 366.5 nm | Anapole response near 370 nm; reported Q about 34 |
| Evidence | Main Figs. 2–3 | Main Figs. 4–5; Supplement Figs. S8–S9 |

The paper uses **Lumerical FDTD** for field simulations and an adapted **MENP** implementation for multipole analysis. It is not a published MEEP implementation. TiO₂ dispersion is taken from Jolivet et al. (2023), cited as Ref. 23 in the paper; fused-silica data use Malitson (1965), Ref. 31. Retrieve the cited datasets and exact interpolation before reproducing the structures.

## Checks that carry the physical interpretation

- **Combine spectrum, multipoles, and fields.** Inspect the total scattering minimum together with the electric and toroidal contributions and their relative phase. Check localized fields at that same wavelength. A dip alone is insufficient. Sources: main Fig. 2(c–d), Fig. 3; Supplement Section 7.
- **Preserve aspect ratio and polarization.** The rectangle's width sweep changes the resonance; the square case with width 190 nm does not show the selected anapole. Report which geometric dimension is parallel to the incident electric field. Source: main Fig. 3(c).
- **Check array modes independently.** Supplement Fig. S9 shows transmission minima for other periods without the anapole field pattern. Do not assign an anapole solely from a transmission spectrum or a grating condition.
- **Treat angular tolerance as geometry-specific.** Supplement Fig. S1 reports persistence up to roughly 25° for the investigated structure; larger angles degrade the scattering minimum. This is not a general tolerance for every array or polarization.
- **Shape changes require retuning.** The ellipsoid with the rectangle's dimensions does not show the same response; a larger ellipsoid does. Sources: Supplement Figs. S4–S7. Equal bounding dimensions do not imply equivalent resonances.

## What is needed for a reproducible release

The PDFs do not provide a complete runnable project. Add the original Lumerical project and automation scripts, exact material tables, mesh and convergence settings, source and monitor definitions, boundary/PML settings, normalization/reference runs, and the adapted MENP code with its license and coordinate conventions.

A useful first released run would reproduce the isolated 190 × 160 × 100 nm rectangle, export its scattering spectrum and complex multipole moments, and compare the spectral minimum and field pattern with Figs. 2–3. An array reproduction should be a separate run with its own boundary conditions and convergence evidence.

**Current status:** documented published configuration; no executable simulation or new validation result is supplied in this folder. See the [release guide](../simulations/README.md).

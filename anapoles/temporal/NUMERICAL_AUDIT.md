# Temporal anapole companion: numerical audit

## Published evidence

Fourteen rows were independently transcribed from supplementary Fig. S2 and
compared with `anapole-temporal-samples.json`; every value agrees. The table
reports electric and magnetic event times and electric field squared. It does
not supply signed spatial fields, magnetic amplitudes, a specified observation
point, or a statement that every row is a maximum. Its delay range is
0.26–0.32 fs. Comparing these intervals with a quarter optical period does not
recover the missing complex phases.

The official version-5 supplement contains one PDF, with no movie or complex
field-array attachment. Static intensity maps cannot be inverted into signed
time-resolved fields. The original study used Lumerical FDTD and MENP, whereas
the new independent calculation below uses Meep.

## New independent reference

`meep_rectangle.py` solves a three-dimensional isolated 190 × 160 × 100 nm
rectangle in air at 366.5 nm. Its polarization, geometry, material-table hash,
mesh, source, PML and normalization are recorded with every output. The material
is the pinned Jolivet amorphous-TiO₂ record, interpolated to n=2.8080755556,
k=0 at this wavelength. The single-frequency constant epsilon equals this
constitutive value; broadband material and formation dynamics are not modeled.

Six complex vector components are exported from collocated Meep DFT monitors.
The shared e^(−iωt) clock is preserved without adding a magnetic phase shift.
H is converted from Meep units using Z₀. An empty-cell calculation supplies
common phase and amplitude references and scattered-field subtraction on the
closed power monitor. The final browser plane is exactly z=0, not a surrogate
dipole field or a two-dimensional reduction of the scatterer.

All 42 per-run checks passed across the coarse, fine and larger-boundary runs.
Mesh refinement from 10 to 6.67 nm changed complex E/H away from interfaces by
2.87%/2.79% and scattering cross section by 4.58%. The larger-boundary/PML test
changed complex E/H by about 1.5×10⁻⁵ relative. Fine-grid vacuum wave number,
impedance, source-tail stability, lossless flux balance and differential curl
residuals are reported in `SIMULATION.md` and `convergence.json`.

These checks support a qualitative steady-state optical-cycle display.
They do not establish a mesh-independent corner maximum, reproduce the
published transient, or independently identify an anapole. No new multipole
decomposition or scattering-minimum search was performed.

## Import and reconstruction checks

`complex_fields.py` accepts complete Cartesian CSV/NPZ complex fields with
explicit SI units and declared phase convention. It rejects intensity-only
input, duplicate/missing grid positions, nonfinite data and undeclared phase.
Ten tests pass, including analytic traveling/standing waves, a shared arbitrary
E/H phase, exact cycle periodicity, Poynting averaging and second-order Maxwell
residual convergence. A deliberately erroneous H quarter-cycle shift fails the
Maxwell check. A single plane cannot claim a three-dimensional curl validation.

## Primary sources

- [Poeta et al., Optics Letters (2024)](https://doi.org/10.1364/OL.536925)
- [Official supplement, version 5](https://doi.org/10.6084/m9.figshare.27648525.v5)
- [Jolivet et al., Applied Surface Science (2023)](https://doi.org/10.1016/j.apsusc.2022.155214)
- [Meep two-run scattering tutorial](https://meep.readthedocs.io/en/latest/Python_Tutorials/Basics/#mie-scattering-of-a-lossless-dielectric-sphere)
- [Meep DFT array and grid documentation](https://meep.readthedocs.io/en/latest/Python_User_Interface/#array-slices)
- [Meep equations, units and Yee discretization](https://meep.readthedocs.io/en/latest/Introduction/)

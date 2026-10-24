# Independent Maxwell calculation and field exports

The published supplement contains a timing table and static figures, without a
complex field dataset. `meep_rectangle.py` therefore makes a **new, independent
three-dimensional Meep calculation** of the isolated rectangle. It does not run
the authors' Lumerical project or reproduce the formation transient in Fig. S2.

## Geometry and material

The free-standing rectangle is 190 × 160 × 100 nm in air. Its long axis is x,
the incident electric field is x polarized, and the chosen incident direction
is +z. This Cartesian convention belongs to this calculation, rather than an
inferred coordinate label from the published schematic. The reference vacuum
wavelength is 366.5 nm. Geometry and wavelength come from [Poeta et al., Optics
Letters (2024)](https://doi.org/10.1364/OL.536925).

The pinned Jolivet amorphous-TiO₂ table is linearly interpolated in wavelength,
without extrapolation. At 366.5 nm it gives n = 2.8080755556 and k = 0. The
measurement concerns an ALD film deposited at 200 °C; its [original publication
is Jolivet et al.](https://doi.org/10.1016/j.apsusc.2022.155214). The source
record is `sources/Jolivet-amorphous.yml` (or adjacent `Jolivet-amorphous.yml`
in the flat public package), from refractiveindex.info-database
commit `c5c2f188e848453def5970e347399d653df2ffc2`, path
`database/data/main/TiO2/nk/Jolivet-amorphous.yml`.

The solver uses epsilon = n(366.5 nm)² as a real constant. This is a
single-frequency constitutive value. Its Gaussian excitation is a numerical
device for obtaining that frequency's response; it does **not** implement the
material's broadband dispersion or predict the paper's transient build-up.

## Reproduce

Use a Linux environment with Meep, NumPy and SciPy. The [official Meep installation
guide](https://meep.readthedocs.io/en/latest/Installation/) describes supported
options. An existing Linux Meep environment runs the commands below directly.
This workspace used Ubuntu's official packages extracted in a local dependency
folder. That machine-specific runtime is excluded from the public source.

```sh
python meep_rectangle.py --resolution 100 --output simulation/res100
python meep_rectangle.py --resolution 150 --output simulation/res150
python meep_rectangle.py --resolution 100 --cell 1.2 --pml .25 --output simulation/domain100
python check_meep.py --coarse simulation/res100 --fine simulation/res150 --domain simulation/domain100 --output convergence.json
```

Here resolution is pixels per micrometre: 100 corresponds to 10 nm, 150 to
6.67 nm. Defaults are a 1 μm cubic cell, 200 nm PML on every side, a planar
source at z = −250 nm, a 420 nm closed flux box, and a Courant factor of 0.5.
Mirror symmetries exploit the symmetric geometry and polarization. Meep's
subpixel dielectric averaging is enabled. Change both mesh and boundary
settings to assess convergence; a small equation residual alone is insufficient.

The code follows Meep's [two-run scattering normalization
procedure](https://meep.readthedocs.io/en/latest/Python_Tutorials/Basics/#mie-scattering-of-a-lossless-dielectric-sphere).
An empty-space run supplies incident complex fields and incident intensity;
the object run subtracts those fields on the scattering-flux box before forming
power. Total and scattered flux are measured separately.

## Complex fields and phase

The files `rectangle-fields.npz` and `vacuum-fields.npz` contain all six complex
Cartesian field components on identical three-dimensional grids. Axes are nm,
electric fields V/m, magnetic fields A/m. Absolute incident amplitude is chosen
as E₀ = 1 V/m and H₀ = E₀/Z₀. This amplitude choice is valid for a linear system.
A single common complex calibration factor is applied to both fields.

Meep's dimensionless magnetic field is converted using H_SI = E_unit H_Meep/Z₀.
DFT export collocates the staggered spatial samples; see the [official field
array documentation](https://meep.readthedocs.io/en/latest/Python_User_Interface/#array-slices).
Fourier fields use exp(−iωt), so reconstruction is real*cos(phi) + imag*sin(phi)
for **both** E and H. No extra quarter-cycle shift is imposed on H. The
empty-space E/H impedance and wave-number diagnostics check this convention.

`rectangle-xy.json` is a compact central xy phasor plane for a browser. The
closest exported central z plane is explicitly recorded. Values are normalized
to the fixed incident E₀ and H₀; each display scale remains fixed throughout a
cycle. The full vectors are retained, allowing signed components or instantaneous
vector magnitude to be drawn without inventing spatial phases.

## What validation establishes

Each `validation.json` records the exact settings and source hash. It reports
same-grid vacuum E/H impedance, fitted wave number against the independent Yee
dispersion relation and continuum limit, harmonic Maxwell curl residuals,
change after an additional source-free tail, scattering cross section, and the
closed total-flux balance for the lossless object. Interface-adjacent samples
are excluded from the differential residual, because interpolated fields are
less accurate there. Original field arrays remain available for independent
analysis.

Mesh and PML comparisons establish numerical stability only to the reported
tolerances. Grid-sampled maxima near sharp dielectric edges and the first few
cells beside an interface are especially sensitive to resolution; no
mesh-independent peak-enhancement value is claimed. This script performs no multipole decomposition and no spectral
anapole search. A field image at the published wavelength does not independently
establish an anapole or zero total radiation. The phase-resolved steady-state
cycle must remain distinct from the published 8.36–10.52 fs timing events.

## Recorded verification

The 10 nm and 6.67 nm mesh runs passed the checks in `check_meep.py`.
On the common comparison grid, excluding a 2.5-coarse-cell zone around dielectric
interfaces, complex E and H changed by 2.87% and 2.79% in relative L2 norm.
Scattering cross section changed by 4.58%. These are differences between two
meshes, rather than proven absolute error bounds. Increasing the cell from
1.0 to 1.2 μm and the PML from 0.20 to 0.25 μm at the coarse mesh changed E/H
by about 0.0016%/0.0014% and the cross section by 0.00027%.

At the finer mesh, vacuum E/H impedance mismatch was 0.164%, and the fitted
vacuum wave number agreed with the independent Yee dispersion relation to
4.4×10⁻⁷ relative. The lossless object's closed total-flux imbalance was
1.16×10⁻⁵ of scattered power. Extending the post-source tail changed E/H
phasors by less than 1.2×10⁻⁹. Harmonic curl residuals, away from interfaces,
were 1.93% for Faraday and 0.0136% for Ampère. Together these checks support a
qualitative phase-resolved field display with the stated mesh limitations.

The full machine-readable comparisons are in `convergence.json` (generated
locally at `simulation/convergence.json`), and each simulation directory
contains its own `validation.json`. The selected browser dataset is the finer
mesh's `rectangle-xy.json`, with a dedicated z = 0 monitor.

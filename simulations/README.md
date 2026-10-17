# Simulation release guide

This is the home for future simulation releases accompanying the [two publications](../README.md). No original simulation files or runnable reproduction are currently included.

## Where a contribution belongs

| Intended location | Content | Current status |
| --- | --- | --- |
| `simulations/anapoles/` | Original Lumerical projects, material inputs, adapted multipole analysis, and validated examples | Not yet supplied |
| `simulations/energy-velocity/` | Original MEEP scripts, material definitions, field analysis, and control runs | Not yet supplied |
| `simulations/reconstructions/` | Independently rebuilt examples, with explicit provenance and comparisons | No reconstruction implemented |

These paths describe the proposed organization; they are not existing runnable packages.

## A useful release must answer these questions

1. **Which published result?** Identify the DOI, figure/panel, geometry, material sample, wavelength, and expected observable. Separate a published setting from an assumed or newly chosen value.
2. **What runs?** Include a command, solver/version, dependency environment, required proprietary software where applicable, approximate runtime, and a small example output.
3. **Which material model?** Include the source data and reuse terms, units, interpolation/fitting method, fit coefficients, fit residuals over the used band, and a check of the solver's realized complex permittivity.
4. **What are the numerical conventions?** Record axes, field components, grid, time step, source spectrum, boundaries/PML, monitors, reference normalization, Fourier conventions, and analysis masks.
5. **What verifies it?** Show appropriate air or homogeneous-medium controls, power-balance checks, grid/domain/PML/time convergence, and a numerical comparison with the chosen paper observable. Distinguish published values from newly calculated values.
6. **Can others use it?** Identify authorship and license for scripts and data. Include raw outputs needed by the analysis; label any unavailable files. Do not bundle proprietary solver binaries or assume third-party code can be relicensed.

## Study-specific evidence

**Anapoles:** preserve complex multipole phase information, cross-section normalization, and field maps at the same spectral feature. A scattering minimum alone is insufficient. Keep isolated-particle and periodic-array runs distinct.

**Energy velocity:** export the flux and stored-energy quantities separately, with the exact averaging mask and operation. Exclude PML. Validate field units and the dispersive energy-density calculation before comparing velocities. Keep linear transport, nonlinear source sweeps, and reflection-stack models in separate runs.

## How to describe completion

- **Original research files:** verified files from the published workflow, with provenance. Availability alone does not imply they have been rerun here.
- **Runnable example:** executed successfully in a documented environment, with outputs and checks.
- **Reproduction:** a runnable example whose specified observables have been compared with the paper and whose agreement and remaining discrepancies are documented.

An issue or pull request can start with one concrete missing file, corrected parameter, or validated control. Broad claims of reproduction should wait for the evidence above.

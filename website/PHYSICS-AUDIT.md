# Physics and mathematics audit — v5

Audited the executable numerical models, their material library, scientific animations, spectrum exports and calculator input-to-result path. This is a mathematical/software audit of the stated models, not experimental validation or certification of arbitrary user configurations. No publication or GitHub changes were performed by this audit.

## Findings corrected

1. **Near-critical propagation retained finite phase.** The thin-film solver previously replaced a very small film longitudinal wavevector by its exact-zero limit without checking accumulated phase. For a sufficiently long path, small q does not imply small qd. A deliberately near-critical, identical-film/substrate case reproduced an absolute power error of 2.47×10⁻⁸ (about 18% relative error in the tiny transmitted fraction). The solver now evaluates the characteristic expression with the actual complex sin(δ), cos(δ) and a stable sin(δ)/q sinc limit. Four permanent thickness-invariance regressions cover this corner.
2. **Export provenance follows the calculated state.** A queued input change previously left a short interval in which old spectral points could be combined with newly selected material citations. Inputs now invalidate export/setup actions immediately; a successful calculation captures its own citation and input snapshot. A persistent integration check exercises this pending-update window and invalid-input case using the actual event handlers.
3. **Energy-density label corrected.** The compact animation label now says “Curve: energy density”. The area under u(z) would represent energy per transverse area, rather than local density. No physical equations changed.
4. Removed an obsolete two-plane-wave comment from the homepage lab-preview script (`portfolio.js`); the lab teaser graphic is an ideal quarter-wave thin-film reference spectrum. Export naming uses Lumefern (the project was renamed after the original audit).

## Thin-film calculation

Checked the field convention N=n+iκ with κ≥0 and exp(i k_z z−iωt), the passive square-root branch q=√(N²−sin²θ₀), interface s/p Fresnel coefficients, round-trip phase/attenuation and coherent single-film amplitudes. The incident medium is real air. Both outgoing powers use normal Poynting flux; specifically p polarization uses Re[N_s cos(θ_s)*], not the s-polarization flux factor. This matches [Byrnes, equations 6, 21–23 and Appendix D](https://arxiv.org/html/1603.02720v5). Unpolarized power is the equal incoherent average of s and p powers, not an averaged complex amplitude.

R is reflected power, T is power entering the semi-infinite substrate and A=1−R−T is absorption in the finite film. For an absorbing substrate, its subsequent dissipation is already part of the entering T; A does not mean total absorption in a finite film-plus-substrate sample. The UI and exports retain this distinction. The incoming medium is lossless, so the absorptive-incident-medium complications discussed by Byrnes do not apply here.

Permanent checks now pass **50 analytic/reference cases**, including 16 independent `tmm.coh_tmm` fixtures, normal-incidence s/p power equality, Brewster reflection, zero thickness, quarter-/half-wave matching, passive absorbing films/substrates, evanescent final-medium flux and the near-critical regression. A scan of **2,880 passive configurations** passes nonnegative power and lossless-film energy balance checks.

An additional seeded, broad-domain comparison against the independently downloaded Byrnes implementation covered **1,162 finite reference results**. Maximum absolute R/T difference after the fix was **3.15×10⁻¹¹**. Another 50 extreme evanescent/thick configurations overflowed within that reference implementation and were excluded from the comparison; they were not presented as independently validated. The application's attenuation form stays finite in those cases. The expanded development comparison inputs/results were retained during the audit and are not bundled in this website folder. The 16 independent reference fixtures and permanent regression checks are included in `website/scripts/check-optics.mjs`.

The returned `energyResidual` is a rounding residual after A has been defined by balance; it is not an independent conservation proof. The analytic fixtures, lossless limits and independent implementation comparisons supply that evidence instead.

## Material constants and units

Verified the **7 material records / 8 source models** against their retained pinned upstream YAML files. All recorded source SHA-256 hashes match. All **2,569 tabulated rows** and formula coefficients match, with only the documented μm→nm wavelength conversion. The dataset revision is `c5c2f188e848453def5970e347399d653df2ffc2`.

A further **5,132 permanent material checks** cover exact node preservation, wavelength-linear midpoints and out-of-range rejection. Formula 1 correctly squares its resonance wavelengths; formula 2 uses the supplied resonance-square coefficients directly. No material extrapolation is performed. Input wavelengths and thicknesses are in nm; angles are degrees; R/T/A and n/κ are dimensionless. The spectrum plot and TXT/CSV columns use the same calculated points.

The library preserves source-specific conditions: Siefke TiO₂ represents the reported ALD film, Rodríguez-de Marcos MgF₂ represents an evaporated film rather than a bulk-crystal optical tensor, and Green silicon is the reported intrinsic 300 K dataset. Silica's Malitson record supplies n only: κ=0 is explicitly identified as a transparent-material assumption, not a measured absorption value. References and range/condition notes remain attached to each material. Source database licensing and descriptor: [official repository](https://github.com/polyanskiy/refractiveindex.info-database), [Polyanskiy 2024](https://doi.org/10.1038/s41597-023-02898-2). Representative original-source records: [Malitson/Tan](https://raw.githubusercontent.com/polyanskiy/refractiveindex.info-database/c5c2f188e848453def5970e347399d653df2ffc2/database/data/main/SiO2/nk/Malitson.yml), [Green](https://raw.githubusercontent.com/polyanskiy/refractiveindex.info-database/c5c2f188e848453def5970e347399d653df2ffc2/database/data/main/Si/nk/Green-2008.yml).

## Pulse/energy animations

Both slab animations solve a one-dimensional, lossless, nondispersive air/slab/air problem using normal-incidence Fresnel pulse amplitudes and internal reflections. Energy density u=(n²e²+h²)/2 and signed flux eh use consistent normalized units. The energy animation's curves use quadrature-smoothed versions; these are not a literal finite-time cycle average of a very short pulse. This wording clarification was sent to the HTML owner.

The illustrative constant n=2.6 is distinct from dispersive, weakly absorbing TiO₂ in thesis chapter 6. The bulk forward-only limit is c/n; local S/u can vary or reverse when forward and reflected fields coexist. The direct-path excess delay (n−1)d/c is not the delay of the full multiply reflected transmitted pulse's peak. The two lanes share one density scale.

Checks pass: **64 energy-animation interface cases**, 24 n=1/vacuum cases, 12 integrated-energy cases (maximum absolute error **3.62×10⁻⁸**) and **5,040 local passive-flow samples**. Homepage checks add 32 interface cases, four integrated real-field energy cases (maximum error **2.43×10⁻⁷**) and 36 local Poynting-theorem cases (maximum finite-difference residual **1.98×10⁻⁷**). Errors include finite sampling/integration spacing. Twelve homepage and twenty research-animation round-trip terms are truncated analytic series, not infinite sums; omitted amplitudes are negligible at the presentation scale. General derivation background: [Peatross & Ware, Physics of Light and Optics](https://optics.byu.edu/).

## Anapole illustration

Verified the stated single radiation-channel phasors A_p=1 and A_T=−exp(iπd). A_T already includes the phase/prefactor connecting the toroidal moment to the shared electric-dipole radiation channel; it is not the bare toroidal moment. The normalized pattern sin²θ |A_p+A_T|²/4 equals sin²θ sin²(πd/2). At cancellation, both contributions remain nonzero; constructive addition gives unit peak. Other multipole channels are deliberately outside this schematic. The slider is a phase offset, not a wavelength or geometry solver. This interpretation follows the source's channel-cancellation concept: [Miroshnichenko et al. 2015](https://doi.org/10.1038/ncomms9069).

All **18,281 angular/phase samples** are finite and nonnegative. Exact cancellation, nonzero amplitudes, constructive limit and angular integration pass; maximum solid-angle integration error is **4.08×10⁻¹¹**. The bound-charge/current drawings remain explanatory continuum motifs, not FDTD trajectories or microscopic electron orbits.

## Exports and remaining scope

`check-exports.mjs` passes 226 TXT rows with 16 numeric columns, exact numeric precision, citation metadata and quoted CSV escaping. `check-lab-state.mjs` verifies that citations match the selected numerical dataset after recalculation, pending changes cannot export stale points, exact thickness 199.875 nm is preserved, and invalid inputs block stale export/setup links.

The calculator remains a coherent, linear, planar, isotropic single-film model. It excludes roughness, scattering, anisotropic tensors, nonlinear conversion, finite beams, coherence loss, backside reflections and manufacturing uncertainty. Constant manually entered n/κ are not a dispersive fit. Finite spectral sampling can miss narrow fringes, so the result is not an automatic convergence guarantee or an experimental prediction. Animation and model tests do not validate every visual layout or browser interaction; the root agent handles browser QA and the narrative owner handles thesis-specific prose.

## Re-run from the repository root

- `node website/scripts/check-optics.mjs`
- `node website/scripts/check-animations.mjs`
- `node website/scripts/check-exports.mjs`
- `node website/scripts/check-lab-state.mjs`

All four scripts passed in the bundled Node runtime during this audit.

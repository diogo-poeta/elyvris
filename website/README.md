# Elyvris website

Source for the Elyvris website and Film Bench.

[Website](https://diogo-poeta.github.io/elyvris/) · [Gallery editor](../GALLERY-EDITING.md)

## Preview

Run `python -m http.server 8000` from this folder, then open http://localhost:8000.

## Validation

From the repository root:

```sh
node website/scripts/check-optics.mjs
node website/scripts/check-exports.mjs
node website/scripts/check-animations.mjs
node website/scripts/check-anapole-radiation.mjs
node website/scripts/check-lab-state.mjs
node website/scripts/check-records.mjs
node website/scripts/check-gallery.mjs
node website/scripts/check-mie.mjs
python website/scripts/check-site.py
```

## Where to edit

- [Project home](index.html) and [its layout](project-home.css)
- [Publications and anapole viewers](research.html)
- [Film Bench](lab.html), the single-film calculator
- [Studio](studio.html): describe a particle in words, view it in 3D and calculate its Mie spectrum. Physics in [mie.js](mie.js), sentence reader in [studio-assistant.js](studio-assistant.js), 3D view in [studio-view3d.js](studio-view3d.js), page logic in [studio.js](studio.js)
- [Photo gallery](records.html) and [gallery data](gallery-data.json)
- [CV](cv.html)

## Methods and sources

Film Bench models one coherent, isotropic film on a semi-infinite substrate. It excludes roughness, anisotropy, nonlinear response and substrate back-face reflection. [Method: Byrnes](https://arxiv.org/abs/1603.02720).

Optical constants come from the [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database), released under CC0. `materials-data.json` records sources, sample conditions, checksums and validity ranges. Values are not extrapolated.

Studio calculates exact plane-wave scattering for one isolated sphere and for an infinitely long circular cylinder at normal incidence, in a uniform lossless medium. Other shapes are drawn and exported as gdsfactory layout scripts without a spectrum. The assistant is a rule-based reader, not a language model. [Method: Bohren and Huffman](https://doi.org/10.1002/9783527618156). `scripts/mie_reference.py` regenerates the independent SciPy reference values used by `check-mie.mjs`.

Research animations distinguish analytical illustrations, FDTD reference fields and published timing samples. [Physics conventions and numerical checks](PHYSICS-AUDIT.md).

## Deployment

The Pages workflow publishes static files from `website/` on `main`. Documentation, validation scripts, hidden files and repository configuration are excluded from the deployed site. Public source remains available in this repository.

The site uses local scripts and datasets, with no visitor login or write API. The Content Security Policy restricts script and data loading to this origin.

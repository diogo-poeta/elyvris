# Lumefern website

Static HTML, CSS and JavaScript for the Lumefern project journal and research pages.

[Website](https://diogo-poeta.github.io/lumefern/) · [Gallery editor](../GALLERY-EDITING.md)

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
python website/scripts/check-site.py
```

## Editing the project journal

Edit the idea and dated development entry in `index.html`. Add progress only when it has happened; keep future work labelled as planned. Layout is in `project-home.css`.

`research.html` holds the four papers and anapole viewers. `records.html` is the photo gallery; the CMS still updates `gallery-data.json` and gallery images. The CV is in `cv.html`.

Film Bench remains at `lab.html` for existing links and reference use. It is no longer part of the homepage or research navigation. The old energy-velocity and analytical animation sources remain in the repository as references.

## Methods and sources

Film Bench models one coherent, isotropic film on a semi-infinite substrate. It excludes roughness, anisotropy, nonlinear response and substrate back-face reflection. [Method: Byrnes](https://arxiv.org/abs/1603.02720).

Optical constants come from the [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database), released under CC0. `materials-data.json` records sources, sample conditions, checksums and validity ranges. Values are not extrapolated.

Research animations distinguish analytical illustrations, FDTD reference fields and published timing samples. [Physics conventions and numerical checks](PHYSICS-AUDIT.md).

## Deployment

The Pages workflow publishes static files from `website/` on `main`. Documentation, validation scripts, hidden files and repository configuration are excluded from the deployed site. Public source remains available in this repository.

The site uses local scripts and datasets, with no visitor login or write API. The Content Security Policy restricts script and data loading to this origin.

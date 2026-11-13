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
node website/scripts/check-studio-code.mjs
python website/scripts/check-site.py
```

## Where to edit

- [Project home](index.html) and [its layout](project-home.css)
- [Research](research.html): four journal articles and the PhD thesis as cards; [research-reader.js](research-reader.js) opens each PDF (in `documents/articles/`) inside the page with the browser's own viewer; styles in [papers.css](papers.css)
- [Film Bench](lab.html), the single-film calculator (not linked from any page since 13 November 2026; kept in the repository)
- [Studio](studio.html): build shapes, view them in 3D, and get gdsfactory and Meep code. Shapes-to-code and code-to-shapes in [studio-code.js](studio-code.js), 3D view in [studio-view3d.js](studio-view3d.js), page logic in [studio.js](studio.js), sentence reader in [studio-assistant.js](studio-assistant.js), fabrication note shown before the Studio opens in [studio-intro.js](studio-intro.js)
- [Photo gallery](records.html) and [gallery data](gallery-data.json)
- [CV](cv.html)

## Methods and sources

Film Bench models one coherent, isotropic film on a semi-infinite substrate. It excludes roughness, anisotropy, nonlinear response and substrate back-face reflection. [Method: Byrnes](https://arxiv.org/abs/1603.02720).

Optical constants come from the [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database), released under CC0. `materials-data.json` records sources, sample conditions, checksums and validity ranges. Values are not extrapolated.

Studio is a drawing tool. It does not simulate. A design is a list of shapes (sphere, cylinder, box, cone, ellipsoid, ring, prism) with a material and a position. The page writes a gdsfactory layout script (top view, one layer per material) and a Meep `geometry` list (1 unit = 1 µm), and reads basic commands of both back into shapes. It does not run Python. Material lines in the Meep code are constant indices from the Elyvris library at one wavelength; strongly absorbing materials are left for the user to define. `scripts/check_studio_meep.py` asks Meep which object contains each of 25 test points, and `scripts/check-studio-code.mjs` checks that written code reads back as the same shapes.

`mie.js` (exact scattering by a sphere and by an infinite cylinder, [Bohren and Huffman](https://doi.org/10.1002/9783527618156)) is kept with its checks but is not used by any page at present. `scripts/mie_reference.py` regenerates the independent SciPy reference values used by `check-mie.mjs`.

Research animations distinguish analytical illustrations, FDTD reference fields and published timing samples. [Physics conventions and numerical checks](PHYSICS-AUDIT.md).

## Deployment

The Pages workflow publishes static files from `website/` on `main`. Documentation, validation scripts, hidden files and repository configuration are excluded from the deployed site. Public source remains available in this repository.

The site uses local scripts and datasets, with no visitor login or write API. The Content Security Policy restricts script and data loading to this origin.

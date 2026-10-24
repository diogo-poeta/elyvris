# DPoeta — portfolio and optics lab

This folder contains the actual, portable source for Diogo Poeta's portfolio: HTML, CSS, JavaScript, original illustrations, and a bundled optical-material dataset. It is a static website with no build step, server application, runtime dependencies, account integration, or API keys.

The current Sites deployment is <https://diogo-poeta-photonics.classy-mesa-1544.chatgpt.site>. It is owner-private while the website is reviewed. A GitHub source repository and an accessible public website are separate things: adding these files does not enable GitHub Pages automatically.

## Explore the source

- `index.html`: selected research, experience, publications, and professional links.
- `research.html`: source-linked explanations of energy velocity and optical anapoles.
- `lab.html`: an educational single-film optical interference calculator.
- `optics-model.js`: coherent transfer-matrix model for complex refractive indices, s/p polarization, and oblique incidence.
- `materials.js` and `materials-data.json`: interpolation and curated optical-constant records, with provenance and validity ranges.
- `anapole-animation.js` and `energy-animation.js`: interactive explanatory animations with explicit schematic/model boundaries; validation checks cover interface continuity, lossless pulse energy, and anapole cancellation limits.
- `hero-field.js`: the homepage's illustrative wave animation; it is distinct from the measured-material calculator and thesis simulations.
- `cv.html`: a printable professional résumé.
- `assets/`: original explanatory schematics, not exported research simulation data.
- `publications.bib`: citation-tool export; publisher records remain the authority for complete metadata.
- `scripts/`: model and local-link validation scripts.

The repository's original scientific notes remain in [`../anapoles/`](../anapoles/) and [`../energy-velocity/`](../energy-velocity/). The website does not include the original MEEP scripts, Lumerical projects, fitted thesis material models, raw acquisitions, or thesis PDF.

## Run locally

From this folder, use Python's standard-library web server:

```sh
python -m http.server 8000
```

Open <http://localhost:8000>. A web server is needed because the calculator reads the bundled material data with `fetch`; opening the HTML files directly through `file://` can be blocked by a browser.

## Validate

From the repository root, run:

```sh
node website/scripts/check-optics.mjs
node website/scripts/check-exports.mjs
node website/scripts/check-animations.mjs
python website/scripts/check-site.py
```

The model checks exercise analytical limiting cases, s/p and unpolarized behaviour, absorbing films, total internal reflection, material interpolation and out-of-range handling, and independent reference values generated with [Steven Byrnes' transfer-matrix implementation](https://github.com/sbyrnes321/tmm). No Python or JavaScript third-party packages are required for these checks.

The calculator follows the coherent single-film setting described in [Byrnes, *Multilayer optical calculations*](https://arxiv.org/abs/1603.02720). Reflectance is returned power; transmittance is power entering the semi-infinite substrate; absorptance is loss in the finite film. The model excludes substrate back-face reflections, anisotropy, roughness and nonlinear generation. An absorbing substrate can dissipate transmitted power beyond the modelled film.

## Optical-data provenance

The bundled `materials-data.json` contains selected [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database) records under **CC0 1.0**, with a pinned upstream revision, original literature citations, measurement conditions, ranges, and source checksums. See the JSON and the lab's source notes for each record. The dataset's CC0 status applies to that upstream database content; it does not assign a new blanket license to the papers or every file in this repository.

Data are not extrapolated beyond their stated ranges. Tabulated data are interpolated in vacuum wavelength; formula-based records use the cited formula. Sources that provide refractive index only retain an explicit zero-extinction modelling assumption. These records do not substitute for the sample-specific optical constants used in the thesis.

## Host without a build service

Serve this folder with any static host. All navigation and asset paths are relative, so a repository subpath is supported. Upload only the public website files; do not upload Sites credentials, `.openai/`, `.git/`, working caches, or private documents.

For GitHub Pages, the simplest branch-based setup is to copy these website files into the `/docs` folder of a publication branch (or the root of a separate Pages repository), then select that branch and folder in **Settings → Pages**. GitHub's branch-based source picker supports the root and `/docs`, rather than arbitrary folders such as `/website`.

Alternatively, a GitHub Actions Pages workflow can upload `website/` directly. This repository intentionally does not enable a deployment workflow or change its Pages settings simply by adding the source. See [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The included `github.io` address can be used without buying a domain under GitHub's current free-plan terms. A custom domain is optional; no provider can guarantee unchanged terms or availability forever.

## Updating

Edit HTML for content, CSS for presentation, and the JavaScript modules for calculations and interactions. Re-run validation after changes. Preserve source attribution, distinguish illustrative calculations from published results, and keep professional claims grounded in the work.

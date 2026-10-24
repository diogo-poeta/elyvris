# Lumafern website and Film Bench

This folder contains the actual, portable source for Diogo Poeta's portfolio: HTML, CSS, JavaScript, original illustrations, and a bundled optical-material dataset. It is a static website with no build step, server application, runtime dependencies, account integration, or API keys.

Website: [Lumafern](https://diogo-poeta.github.io/lumafern/) · Repository: [GitHub](https://github.com/diogo-poeta/lumafern).

Lumafern is the umbrella project name. This website presents Diogo's research and current learning tools; the repository holds their source and the research companion; the planned Python framework will carry the same Lumafern name. **Film Bench** is the separate name of the calculator available now.

The name combines an image of light with a fern unfolding: understanding and software growing step by step.

## Explore the source

- `index.html`: selected research, experience, publications, and professional links.
- `research.html`: source-linked explanations of energy velocity and optical anapoles.
- `lab.html`: Film Bench, a coherent single-film optical calculation tool.
- `optics-model.js`: coherent transfer-matrix model for complex refractive indices, s/p polarization, and oblique incidence.
- `materials.js` and `materials-data.json`: interpolation and curated optical-constant records, with provenance and validity ranges.
- `anapole-radiation.js`: the analytical electric-anapole illustration, using D = p + (ik₀/c)T from Poeta et al. (2024), Eq. (1), with fixed-scale dipolar radiation patterns. `energy-animation.js` supplies the separate pulse/energy illustration. The older `anapole-animation.js` is retained only for historical regression checks, not loaded by the research page.
- `hero-field.js`: the homepage's illustrative wave animation; it is distinct from the measured-material calculator and thesis simulations.
- `cv.html`: a printable professional résumé.
- `records.html`, `records.js` and `records-data.json`: seven curated professional research/presentation records with category filters.
- `gallery.js`, `gallery.css`, `gallery-data.json` and `assets/gallery/`: six cleared, published photographs/reference images with captions, alternative text and attribution. This static export loads only local published data and local raster images. It has no online uploader, editor, owner interface, account/session API or private drafts.
- `assets/`: the Lumafern SVG logo, explanatory artwork, and the source-attributed FDTD field-cycle/timing data used by the research viewers.
- `publications.bib`: citation-tool export; publisher records remain the authority for complete metadata.
- `scripts/`: model, animation, export-state, research-record media/filter and local-link validation scripts.
- [Physics and mathematics audit](PHYSICS-AUDIT.md): audited conventions, corrections, numerical checks and scope.

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
node website/scripts/check-anapole-radiation.mjs
node website/scripts/check-lab-state.mjs
node website/scripts/check-records.mjs
node website/scripts/check-gallery.mjs
python website/scripts/check-site.py
```

The records regression checks rendering/filtering of published entries, text-only data handling, allowed local raster paths, rejected external/tracking/unsafe media URLs and credential-bearing references.

The model checks exercise analytical limiting cases, s/p and unpolarized behaviour, absorbing films, total internal reflection, material interpolation and out-of-range handling, and independent reference values generated with [Steven Byrnes' transfer-matrix implementation](https://github.com/sbyrnes321/tmm). No Python or JavaScript third-party packages are required for these checks.

Film Bench follows the coherent single-film setting described in [Byrnes, *Multilayer optical calculations*](https://arxiv.org/abs/1603.02720). Reflectance is returned power; transmittance is power entering the semi-infinite substrate; absorptance is loss in the finite film. The model excludes substrate back-face reflections, anisotropy, roughness and nonlinear generation. An absorbing substrate can dissipate transmitted power beyond the modelled film.

## Current tool and planned framework

Film Bench, the current tool in this folder, is a browser-based coherent **single-film** reference calculation. It does not train or run a surrogate model. The broader Lumafern project starts with Python multilayer thin-film TMM reference calculations and data generation, then PyTorch surrogate training and inverse design with reference-solver error, validity-domain and provenance checks. Those Python/PyTorch components are not implemented here. See the [repository scope](../README.md).

## Optical-data provenance

The bundled `materials-data.json` contains selected [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database) records under **CC0 1.0**, with a pinned upstream revision, original literature citations, measurement conditions, ranges, and source checksums. See the JSON and Film Bench's source notes for each record. The dataset's CC0 status applies to that upstream database content; it does not assign a new blanket license to the papers or every file in this repository.

Data are not extrapolated beyond their stated ranges. Tabulated data are interpolated in vacuum wavelength; formula-based records use the cited formula. Sources that provide refractive index only retain an explicit zero-extinction modelling assumption. These records do not substitute for the sample-specific optical constants used in the thesis.

## Host without a build service

Serve this folder with any static host. All navigation and asset paths are relative, so a repository subpath is supported. Upload only the public website files; do not upload Sites credentials, `.openai/`, `.git/`, working caches, or private documents.

The repository uses [`.github/workflows/pages.yml`](../.github/workflows/pages.yml) to publish this `website/` folder directly to GitHub Pages after changes on `main`, or when the workflow is run manually. Select **GitHub Actions** as the publishing source in **Settings → Pages**. The workflow uploads only this static folder; it does not publish the repository's private working state or a server application. See [GitHub Pages publishing sources](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The included `github.io` address can be used without buying a domain under GitHub's current free-plan terms. A custom domain is optional; no provider can guarantee unchanged terms or availability forever.

## Updating

Edit HTML for content, CSS for presentation, and the JavaScript modules for calculations and interactions. Re-run validation after changes. Preserve source attribution, distinguish illustrative calculations from published results, and keep professional claims grounded in the work.

## Add photos from a phone

Open [Add photos](https://diogo-poeta.github.io/lumafern/photos.html), sign in to GitHub and complete the photo form. Attach one image, choose Research or Travel and supply its title and caption. Submissions are public GitHub issues and wait for manual review. No automatic publishing or repository-write automation is installed.

To publish a chosen submission, ask Codex to publish the pending Lumafern photos, or review it manually: validate and re-encode the image, remove camera metadata, put the JPEG in website/assets/gallery, add its caption/category/dimensions to gallery-data.json, and commit the reviewed files. The existing Pages deployment publishes that reviewed commit. Close the submission after verifying the live gallery.

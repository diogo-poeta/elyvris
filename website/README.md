# Elyvris website

Static site published by GitHub Pages from this folder on `main`.

## Preview

```sh
python -m http.server 8000
```

Open http://localhost:8000.

## Checks

From the repository root:

```sh
python website/scripts/check-private-data.py
python website/scripts/check-site.py
node --test website/scripts/check-grid-optics.cjs
python website/scripts/run_browser_checks.py
```

These run on every pull request. The Meep checks (`check_studio_*meep.py`) need Meep and are run by hand.

The floating Notes panel also has a focused browser check. With Python Playwright and its Chromium browser installed, run `python website/scripts/check-studio-notes.py` from the repository root. Use `--browser /path/to/chromium` for an existing browser. It uses an isolated browser profile and checks saved-note retention, moving and closing the panel, TXT/PNG downloads, mobile layout and offline access.

## Pages

| Page | Main files |
| --- | --- |
| [Home](index.html) | `project-home.css`, `tour.js`, `intro-loader.js` |
| [Research](research.html) | `research-reader.js`, `papers.css`, `documents/` |
| [Studio](studio.html) | `studio.js`, `studio-code.js`, `studio-py.js`, `studio-view3d.js`, `materials-data.json` |
| [Grid](play.html) | `grid.js`, `grid-api.js`, `grid-lab.js`, `grid-coating-lab.js` |

Optical constants: [refractiveindex.info database](https://github.com/polyanskiy/refractiveindex.info-database) (CC0); sources are listed in `materials-data.json`.

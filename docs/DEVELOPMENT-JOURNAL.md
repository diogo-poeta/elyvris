# Development journal

## 2026-11-26 — Studio notes and Atlas navigation

### Request and decisions

- Remove the visible home slogan and Studio title, and the Research reading instruction.
- Describe Atlas as in development. Inspection of its roadmap, predictor notes and latest log supports a completed sphere dataset and ongoing predictor evaluation, not a deployed general predictor.
- Replace the main Notes navigation item with an inactive Atlas placeholder.
- Keep Notes inside Studio in a compact movable panel. Reuse the existing notebook and IndexedDB store to preserve existing notes and drawing, text, image and calculation tools.
- Keep JSON backup/import and add plain-text note and PNG drawing downloads. Closing the panel keeps its state and requests a save.
- Rename the guide to Cleanroom feasibility and introduce fabrication constraints before design and simulation. Existing scientific examples and citations remain unchanged.
- Cache the embedded notebook with Studio so notes can open offline after an online visit.

### Scope and assistance

The user requested parallel agent work. ChatGPT agents inspected Atlas, edited website copy, implemented the notebook panel and performed verification. The parent agent reviewed integration, updated the guide and offline cache, and recorded this entry. Atlas was inspected read-only; no Atlas code, data, tests or installation were changed or run. The Claude desktop discussion was viewed without sending messages or changing its work.

The owner explicitly approved committing and publishing these changes on 2026-11-26. Publication proceeds from the current main branch after checking that its files match the reviewed baseline; deployment remains gated by the repository's existing checks.

### Validation

- Site structure and local links: passed (5 pages, 89 links).
- Private-data scan, modified JavaScript syntax checks and Git whitespace check: passed.
- Existing Grid optics suite: all 13 tests passed.
- Existing Studio browser suites through Playwright: all 706 checks passed (code generation 11, Python/Meep parsing fixtures 578, GDS 11, UI 106). These are software checks, not new physical simulations or scientific validation results.
- Added `website/scripts/check-studio-notes.py`: all 10 scenarios passed, covering existing IndexedDB notes, immediate close/save/reopen, mouse and keyboard movement, Unicode TXT with calculation results, actual PNG ink, undo/redo, images and JSON backups, reload retention, mobile layout, offline use and legacy Notes links.
- Home and Research checked at widths of 1440, 390 and 320 pixels: no horizontal overflow or JavaScript errors; Atlas is inert and requested text is absent. A narrow-screen header wrap fixes a one-pixel overflow.
- Studio Notes desktop and phone screenshots were visually reviewed. The panel is 440 by 470 pixels on desktop and constrained to the available phone viewport.
- The existing runner's direct invocation of the installed Chromium headless-shell did not report results. Running the same suites via Playwright succeeded. These results were obtained before publication approval.

### Limitations

- Atlas is a placeholder only; no Atlas website integration or prediction is exposed.
- Notes remain private to the browser and origin. Clearing site data removes local notes; TXT/PNG downloads and JSON backups are user-controlled copies.
- Local preview uses a different origin from GitHub Pages and therefore has its own empty notes database.
- Native Firefox inspection and direct network fetching were unavailable. GitHub connector comparison confirmed that public main and the starting local commit had identical files (main added only a merge commit). Local browser tests provide the UI verification.

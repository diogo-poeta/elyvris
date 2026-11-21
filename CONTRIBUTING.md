# Contributing

Help is welcome. Replies can take a few days.

## Ways to help

- **Problem:** [open an issue](https://github.com/diogo-poeta/elyvris/issues/new/choose) with the "Problem" form.
- **Idea:** use the "Idea" form.
- **Small task:** pick a [`good first issue`](https://github.com/diogo-poeta/elyvris/labels/good%20first%20issue) and comment before you start.

## Run it

```sh
git clone https://github.com/diogo-poeta/elyvris.git
cd elyvris/website
python -m http.server 8000
```

Open http://localhost:8000/studio.html. No build step.

## Check it

```sh
python website/scripts/check-private-data.py
python website/scripts/check-site.py
node --test website/scripts/check-grid-optics.cjs
python website/scripts/run_browser_checks.py
```

## Pull requests

- One small change per pull request, against `main`.
- Say what changed, which checks you ran, and add a screenshot for visible changes.
- Physical data needs a source (paper, datasheet or refractiveindex.info page).
- No new outside scripts or libraries without asking in an issue first.
- Keep each file's line endings (CRLF or LF).
- Never commit passwords, keys or credentials. `website/scripts/check-private-data.py` blocks them.

Follow the [code of conduct](CODE_OF_CONDUCT.md). Contributions are released under the project's licences (see [README](README.md#licence)).

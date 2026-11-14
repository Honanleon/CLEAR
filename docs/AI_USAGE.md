<!-- Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md -->

# AI usage

Space Apps asks teams to disclose how they used AI. Every team member logs their own use here: **which file or feature, which tool, and how it was used**. Files created or substantially rewritten with AI carry this header:

```
Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
```

(In Python, YAML and shell files it is a `#` comment; in Markdown it is an HTML comment.)

**No AI-generated images are used.** If that changes, every such image must carry a visible watermark and be listed here.

## Log

| Date (UTC-3) | File / feature | Tool | How it was used | Reviewed by |
|---|---|---|---|---|
| 2026-11-14 | `.gitignore`, `pipeline/requirements.txt`, `docs/*.md`, empty package layout | Claude Code (Claude Opus 5.5) | Generated the repository scaffold from the team's written plan (`CLAUDE.md`) | TODO |
| 2026-11-14 | `LICENSE` | Claude Code | Copied the standard Apache-2.0 text from a local copy (not AI-written) | TODO |
| 2026-11-14 | `deploy/deploy.sh`, `.github/workflows/deploy.yml`, `deploy/placeholder/index.html` | Claude Code (Claude Opus 5.5) | Wrote the SSH deploy script, the GitHub Actions workflow and the temporary page; set up the deploy key and secrets | TODO |
| 2026-11-14 | `pipeline/fetch/nisar.py`, `pipeline/run.py`, `pipeline/config.yaml`, `pipeline/tests/test_nisar_select.py`, `pyproject.toml` | Claude Code (Claude Opus 5.5) | Wrote the NISAR GCOV search, the one-scene-per-date selection, the pipeline CLI, the config and the tests | TODO |
| 2026-11-14 | `pipeline/fetch/nisar.py` (AOI crop), `pipeline/run.py`, `pipeline/tests/test_nisar_crop.py` | Claude Code (Claude Opus 5.5) | Wrote the partial HTTPS read of the AOI window, the GeoTIFF export and the tests | TODO |
| 2026-11-14 | `web/` (story map: `index.html`, `src/**`, `vite.config.ts`, `public/.htaccess`, `scripts/check-*.mjs`) | Claude Code (Claude Opus 5.5) | Wrote the static web app: cover animation, HH/HV explainer, MapLibre map with timeline, before/after swipe, time-series chart, validation section, ES/EN texts, styles and the bundle/i18n checks | TODO |
| 2026-11-14 | `web/scripts/make-fixtures.mjs` | Claude Code (Claude Opus 5.5) | Wrote a generator of **synthetic** development data that follows `docs/DATA_CONTRACT.md` (invented landscape, clearings, rain and validation numbers). Dev server only; never in the build; the UI shows a "synthetic data" banner while it is used | TODO |
| 2026-11-14 | `web/src/map/*` (real basemap, zoom-on-tap zone panel), `web/src/story/guide.ts`, `web/src/i18n/*.json`, `web/src/styles.css` | Claude Code (Claude Opus 5.5) | Switched the map to real satellite imagery + OSM labels starting on all of Paraguay, added the plain-language zone panel (size in soccer fields, date, optical confirmation, nearest town, nearby clearings), moved "how to read the map" under the map with a summary, simplified the texts and changed the palette away from green | TODO |

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
| 2026-11-14 | `pipeline/process/calibrate.py`, `pipeline/export/rgb_png.py`, `pipeline/export/to_json.py`, export stage in `pipeline/run.py`, tests | Claude Code (Claude Opus 5.5) | Wrote the speckle filter, dB conversion, RGB composite in EPSG:4326 and the index.json builder | TODO |
| 2026-11-14 | Study-area choice (`pipeline/config.yaml`, METHODS "Study area"), crop bbox guard in `pipeline/fetch/nisar.py` | Claude Code (Claude Opus 5.5) | Ran one-off DIST-ALERT, WorldCover and NISAR-coverage screenings (scripts kept outside the repo) and proposed AOI options; the team chose the box | TODO |
| 2026-11-14 | `pipeline/fetch/worldcover.py`, `pipeline/process/normalize.py`, `detect.py`, `polygons.py`, process stage in `pipeline/run.py`, `pipeline/tests/test_detect.py` | Claude Code (Claude Opus 5.5) | Wrote the interim forest mask, normalization, change detection, sanity checks and polygon export; diagnosed false positives on old pasture and proposed the baseline condition and the longer date range | TODO |
| 2026-11-14 | `web/` (story map: `index.html`, `src/**`, `vite.config.ts`, `public/.htaccess`, `scripts/check-*.mjs`) | Claude Code (Claude Opus 5.5) | Wrote the static web app: cover animation, HH/HV explainer, MapLibre map with timeline, before/after swipe, time-series chart, validation section, ES/EN texts, styles and the bundle/i18n checks | TODO |
| 2026-11-14 | `web/scripts/make-fixtures.mjs` | Claude Code (Claude Opus 5.5) | Wrote a generator of **synthetic** development data that follows `docs/DATA_CONTRACT.md` (invented landscape, clearings, rain and validation numbers). Dev server only; never in the build; the UI shows a "synthetic data" banner while it is used | TODO |
| 2026-11-14 | `web/src/map/*` (real basemap, zoom-on-tap zone panel), `web/src/story/guide.ts`, `web/src/i18n/*.json`, `web/src/styles.css` | Claude Code (Claude Opus 5.5) | Switched the map to real satellite imagery + OSM labels starting on all of Paraguay, added the plain-language zone panel (size in soccer fields, date, optical confirmation, nearest town, nearby clearings), moved "how to read the map" under the map with a summary, simplified the texts and changed the palette away from green | TODO |
| 2026-11-14 | `pipeline/fetch/dist_alert.py`, `pipeline/validate/dist_compare.py`, validate stage, `pipeline/tests/test_validate.py`, METHODS tuning log | Claude Code (Claude Opus 5.5) | Wrote the DIST-ALERT validation, ran the one-time threshold tuning (−2 vs −3 dB) and documented every attempt | TODO |
| 2026-11-14 | `index.json` validation block (`pipeline/export/to_json.py`, contract v2), docs | Claude Code (Claude Opus 5.5) | Implemented the team's choice of spatial agreement/coverage as headline numbers, added the 24-day variants and the radar lead, documented the change | TODO |
| 2026-11-14 | `pipeline/export/hexes.py`, `pipeline/tests/test_hexes.py`, hexagon export and stricter forest condition in `pipeline/run.py`, study-area change, METHODS corrections | Claude Code (Claude Opus 5.5) | Ran the HLS colour check and NISAR frequency-B frame scans (scripts outside the repo), found the false positives, wrote the hexagon aggregation, and documented and withdrew the earlier radar-lead claim | TODO |

<!-- Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md -->

# Data contract: pipeline → web

**Current `schema_version`: 1.** The pipeline writes these files to `web/public/data/` and the web app reads them. Do not change this contract without agreeing with the team. If it changes, bump `schema_version` and update this file in the same commit.

General rules:
- Coordinates are EPSG:4326 (lon, lat).
- Dates are ISO `YYYY-MM-DD`.
- RGB images are WebP (lossy, quality 80, ~250 KB each), reprojected to EPSG:4326 before export so they align as a MapLibre `image` source. Changed from PNG on 2026-11-14 (PNG was 2.1 MB per date), before any consumer used v1, so `schema_version` stays 1.
- Every layer shown has a provenance entry: `type` (`satellite`, `modeled` or `measured`), `source` and, for NISAR, maturity (`PROVISIONAL` or `VALIDATED`).

## `index.json`

Loaded on startup.

```json
{
  "schema_version": 1,
  "generated_at": "2026-11-14T18:00:00-03:00",
  "aoi": { "id": "chaco-central-norte", "bbox": [-60.78, -21.73, -60.18, -21.33] },
  "nisar": { "track": 161, "direction": "ASCENDING", "frame": 167, "mode": "20+5 DHDH" },
  "scenes": [
    { "date": "2026-06-01", "id": "NISAR_L2_PR_GCOV_021_...", "maturity": "PROVISIONAL", "crid": "P05023",
      "rgb": "rgb/2026-06-01.webp" }
  ],
  "image_coordinates": [[-60.78, -21.33], [-60.18, -21.33], [-60.18, -21.73], [-60.78, -21.73]],
  "detection": { "threshold_db": -3.0, "persistence": 2, "min_area_ha": 5, "n_polygons": 0, "area_ha_total": 0 },
  "validation": { "agreement_pct": null, "coverage_pct": null, "reference": "OPERA DIST-ALERT-HLS V1" },
  "provenance": [
    { "layer": "rgb", "type": "satellite", "source": "NISAR L2 GCOV (NASA/JPL, ASF DAAC)" }
  ]
}
```

- `image_coordinates`: corners in MapLibre order (top-left, top-right, bottom-right, bottom-left).
- `scenes[].rgb`: path relative to `web/public/data/`.

## `polygons.geojson`

A `FeatureCollection` of polygons. Properties per feature:

| Property | Type | Meaning |
|---|---|---|
| `id` | string | Stable id |
| `first_date` | string (ISO) | First date of the detection (±12 days) |
| `area_ha` | number | Area in hectares |
| `mean_drop_db` | number | Mean ΔHV in dB (negative) |
| `dist_confirmed` | `true` / `false` / `null` | Overlaps an OPERA DIST-ALERT alert; `null` = not checked |
| `status` | `"estimado"` | Always "estimated"; the UI translates it |

## `grid_500m.json`

Time series shown when the user taps the map. Lazy-loaded on the first tap.

```json
{
  "dates": ["2026-06-01", "..."],
  "origin": [-60.78, -21.33],
  "cell_deg": [0.0048, -0.0045],
  "nx": 125,
  "ny": 89,
  "hv_db_x10": [[-118, -120, null, "..."]],
  "hh_db_x10": [["..."]]
}
```

- One row per date, aligned with `dates`.
- Each row holds `nx × ny` cells in row-major order, starting at `origin` (top-left corner).
- Values are integers in dB × 10, or `null`. Each cell is the mean of linear γ⁰ inside it, converted to dB (no normalization).
- `cell_deg` is exact: bbox width / `nx` and −(bbox height) / `ny`. For `chaco-central-norte` it is `[0.0048, -0.0044944]` (the example above rounds it).
- The file is minified; about 1 MB raw and ~250 KB gzip for 11 dates.
- Cell of a point: `col = floor((lon - origin[0]) / cell_deg[0])`, `row = floor((lat - origin[1]) / cell_deg[1])`, index `row * nx + col`.

## `rain.json`

```json
{ "dates": ["..."], "mm": ["..."], "source": "NASA POWER PRECTOTCORR", "point": [-60.7, -21.75] }
```

Daily precipitation in mm at one point in the AOI.

<!-- Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md -->

# Data contract: pipeline → web

**Current `schema_version`: 3.** The pipeline writes these files to `web/public/data/` and the web app reads them. Do not change this contract without agreeing with the team. If it changes, bump `schema_version` and update this file in the same commit.

General rules:
- Coordinates are EPSG:4326 (lon, lat).
- Dates are ISO `YYYY-MM-DD`.
- RGB images are WebP (lossy, quality 80, ~250 KB each), reprojected to EPSG:4326 before export so they align as a MapLibre `image` source. Changed from PNG on 2026-11-14 (PNG was 2.1 MB per date), before any consumer used v1, so `schema_version` stays 1.
- Every layer shown has a provenance entry: `type` (`satellite`, `modeled` or `measured`), `source` and, for NISAR, maturity (`PROVISIONAL`, `VALIDATED` or `BETA`; `BETA` = not calibrated, so far only in secondary zones).

## `index.json`

Loaded on startup.

```json
{
  "schema_version": 3,
  "generated_at": "2026-11-14T18:00:00-03:00",
  "aoi": { "id": "boqueron-norte", "bbox": [-61.6, -20.9, -61.0, -20.5] },
  "nisar": { "track": 161, "direction": "ASCENDING", "frame": 167, "mode": "20+5 DHDH" },
  "scenes": [
    { "date": "2026-06-01", "id": "NISAR_L2_PR_GCOV_021_...", "maturity": "PROVISIONAL", "crid": "P05023",
      "rgb": "rgb/2026-06-01.webp" }
  ],
  "image_coordinates": [[-61.6, -20.5], [-61.0, -20.5], [-61.0, -20.9], [-61.6, -20.9]],
  "detection": { "threshold_db": -3.0, "persistence": 2, "min_area_ha": 5, "n_polygons": 0, "area_ha_total": 0 },
  "validation": { "agreement_pct": 28.3, "coverage_pct": 30.9, "agreement_pct_24d": 9.5, "coverage_pct_24d": 10.4,
                  "median_lead_days": 36, "polygons_confirmed": 7, "polygons_total": 23, "reference": "OPERA DIST-ALERT-HLS V1" },
  "provenance": [
    { "layer": "rgb", "type": "satellite", "source": "NISAR L2 GCOV (NASA/JPL, ASF DAAC)" }
  ]
}
```

- `image_coordinates`: corners in MapLibre order (top-left, top-right, bottom-right, bottom-left).
- `scenes[].rgb`: path relative to `web/public/data/`.
- `validation` (any value can be `null` before validation runs):
  - `agreement_pct`: % of the radar polygon area that has an OPERA DIST-ALERT alert, at any date in the period (**headline number**);
  - `coverage_pct`: % of the optical-alert area (forest, ≥ 5 ha) that the radar polygons cover, at any date;
  - `agreement_pct_24d`, `coverage_pct_24d`: the same, but the dates must be within ±24 days (the method first planned);
  - `median_lead_days`: how many days the radar detects the change **before** the optical alert (median; negative would mean later);
  - `polygons_confirmed` of `polygons_total`: polygons with `dist_confirmed: true`, for the sentence "in X of N cases it matches optical alerts".

## Changes

- **v3 (2026-11-14):** several zones: `zones.json`, `zones/<id>/` folders, `index.zone`; `rain.json` is produced per zone (NASA POWER, centre of the zone's bbox). Backward compatible: the primary zone keeps the v2 layout at the root.
- **v2 (2026-11-14):** `polygons.geojson` holds aggregated hexagons (same properties, new meaning above); `detection` adds `n_hexes` and `hex_width_m`. Also: `agreement_pct` and `coverage_pct` are now spatial (any date) instead of ±24 days; added `agreement_pct_24d`, `coverage_pct_24d`, `median_lead_days`, `polygons_confirmed`, `polygons_total`. Backward compatible: no field was removed or renamed. Reason in `docs/METHODS.md` (validation).

## Several zones (`zones.json`, v3)

The pipeline can process several study zones. The **primary zone** (first in `zones` in `pipeline/config.yaml`) is written to the root of `web/public/data/` exactly as before, so a web app that only knows one zone keeps working. Every other zone is written to `web/public/data/zones/<id>/` with the same files (`index.json`, `rgb/`, `grid_500m.json`, `polygons.geojson`, `rain.json`). In each zone's `index.json`, `scenes[].rgb` stays relative to `web/public/data/` (e.g. `zones/boqueron-sur/rgb/2026-01-08.webp`).

`web/public/data/zones.json`:

```json
{ "schema_version": 3,
  "zones": [
    { "id": "boqueron-norte", "name": {"es": "Norte de Boquerón", "en": "Northern Boquerón"},
      "kind": "clearing", "chapter": 1, "primary": true, "path": "",
      "bbox": [-61.6, -20.9, -61.0, -20.5], "orbit": {"relative_orbit": 161, "flight_direction": "ASCENDING", "frame": 167},
      "n_scenes": 26, "first_date": "2025-11-21", "last_date": "2026-10-23", "n_polygons": 31, "area_ha_total": 596.4 },
    { "id": "neembucu", "kind": "water", "chapter": 2, "primary": false, "path": "zones/neembucu/",
      "n_polygons": null, "area_ha_total": null, "...": "..." } ] }
```

- `kind`: `clearing` (forest clearing detection), `water` (chapter 2; for now only radar images, time series and rain, no detection, no `polygons.geojson`), `control` (chapter 3: same detection as `clearing`; few or no detections are expected).
- `path`: folder of the zone's files, relative to `web/public/data/` (`""` for the primary zone).
- Each zone's `index.json` also has `"zone": {"kind", "chapter", "name", "primary"}`.

## `polygons.geojson`

A `FeatureCollection` of **hexagons** (pointy-top, `hex_width_m` wide, 1000 m by default), aggregating the detected clearing. Exact clearing shapes are never published; they stay in `data/interim/`. `index.json` → `detection.n_hexes` and `detection.hex_width_m` describe the grid. Properties per feature:

| Property | Type | Meaning |
|---|---|---|
| `id` | string | Stable id |
| `first_date` | string (ISO) | Median first-detection date of the cleared pixels in the hexagon (±12 days) |
| `prev_date` | string (ISO) or `null` | Radar date just before `first_date`: the change happened **between `prev_date` and `first_date`**. Usually 12 days apart, but longer after a gap in the data (e.g. 2026-01-08 → 2026-06-25 in `boqueron-sur`). Added in v3. |
| `area_ha` | number | Cleared area inside the hexagon, in hectares (not the hexagon's area) |
| `mean_drop_db` | number | Mean ΔHV at detection of the cleared pixels, in dB (negative) |
| `dist_confirmed` | `true` / `false` / `null` | ≥ 20 % of the cleared pixels have an OPERA DIST-ALERT alert; `null` = not checked |
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
- `cell_deg` is exact: bbox width / `nx` and −(bbox height) / `ny`. For `boqueron-norte` it is `[0.0048, -0.0044944]` (the example above rounds it).
- The file is minified; about 2.7 MB raw and ~530 KB gzip for 26 dates.
- Cell of a point: `col = floor((lon - origin[0]) / cell_deg[0])`, `row = floor((lat - origin[1]) / cell_deg[1])`, index `row * nx + col`.

## `rain.json`

```json
{ "dates": ["..."], "mm": ["..."], "source": "NASA POWER PRECTOTCORR", "point": [-60.7, -21.75] }
```

Daily precipitation in mm at one point in the AOI.

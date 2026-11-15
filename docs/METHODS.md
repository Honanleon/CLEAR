<!-- Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md -->

# Methods

How CLEAR estimates forest clearing in the central Chaco from NISAR L-band radar. Results are **radar-estimated clearing, dated ±12 days**. They show land-cover change, not legality, and they are not ground truth.

> Status: **plan**. Each section is updated in the same commit as the code that implements it. Parameter values live in `pipeline/config.yaml`; each one has a comment saying where it comes from.

## Physical basis

Standing forest scatters L-band (24 cm) waves from its trunks and branches (volume scattering), which gives a strong cross-polarized **HV** return. When the forest is cleared, most of that volume disappears and HV drops by several dB, and stays low. **HH** responds more to soil moisture and to ground–trunk double bounce, so it moves with rain and with windrows of felled trunks. That is why the detector uses a **sustained HV drop**, with HH and HH/HV as context.

Other drivers we expect to see, to be discussed in the app:
- windrows of felled trunks (short-lived HH/HV increase);
- burning of windrows;
- soil moisture after rain (HH increase, smaller HV change).

## Study area

**`boqueron-norte`**, bbox `[-61.6, -20.9, -61.0, -20.5]` (EPSG:4326), district of Mariscal Estigarribia, Boquerón, Paraguay (about 60 × 45 km). It lies fully inside NISAR track 161, ascending, frame 167 (26 dates).

**Ethics.** The study area must stay clear of the Ayoreo Totobiegosode territory (PNCAT), where groups live in voluntary isolation under IACHR precautionary measures. The PNCAT is located in the district of Puerto Casado (formerly La Victoria), department of Alto Paraguay (Resolución N.º 1/2001, Dirección General de Bienes Culturales, then Ministerio de Educación y Culto). Using the official district boundaries (DGEEC 2012, via geoBoundaries), the study area is 139 km from that district and lies in a single district (Mariscal Estigarribia). Isolated Ayoreo groups also move outside the PNCAT, across the northern Chaco, so the app publishes **aggregated hexagons, never exact clearing shapes**, and no indigenous layer is used or shown.

**How it was chosen (2026-11-14).** Three boxes were tried; the history matters because each step corrected the previous one:

1. `[-61.0, -21.95, -60.4, -21.55]` (first plan): almost no clearing in OPERA DIST-ALERT (22 ha) or NISAR.
2. `chaco-central-norte`, `[-60.78, -21.73, -60.18, -21.33]`: chosen because DIST-ALERT showed ~320 ha of vegetation loss. Our first detections there (23 polygons, 566 ha) looked like clearing in the radar, but a **colour check with HLS (Sentinel-2) images from 2025-11-19 and 2026-11-04** showed that ~18 of 23 were inside paddocks that already existed in November 2025 (regrowth removal, ploughing or burning), 2 were seasonal wetlands, and about 1 was standing forest that was cleared. The DIST-ALERT alerts there were the same kind of event. With a stricter forest condition (step 6) the box has ~19 ha of clearing.
3. `boqueron-norte`: found with the **radar itself**. NISAR frequency B (80 m, ~25 MB per date for the whole frame) was read for the whole of frame 167 (3 dates in Nov–Dec 2025, 3 in Sep–Oct 2026) to map forest that became open. In the centre-south of the frame the flagged changes were centre pivots and existing paddocks; in the north, new paddock blocks opened in forest are visible. This box had about 950 ha (coarse estimate) and is the northern candidate farthest from the PNCAT district.

The DIST-ALERT and frequency-B figures are coarse screening numbers, not validation results.

## Data

NISAR L2 GCOV, frequency A (20 MHz, ~20 m), HH and HV, γ⁰ linear with radiometric terrain correction. There are 26 dates from 2025-11-21 to 2026-10-23, every 12 days, with missing acquisitions on 2026-04-14 and 2026-08-12 and an instrument gap between 2026-07-27 and 2026-08-10. All are PROVISIONAL (CRID P05023) except 2026-10-23 (VALIDATED, P05036). The series first started on 2026-06-01; it was extended back to November 2025 because, in the study area, the radar already saw the clearings that OPERA DIST-ALERT reported in June–October as non-forest on 2026-06-01 (normalized HV about −5.6 dB at baseline): the trees had been felled before June, and the optical product noticed the loss later, when the felled vegetation dried or burned. See `CLAUDE.md` §8.1 for the date table and de-duplication rules.

## Processing steps

1. **Subset.** Read only the AOI window of `HHHH` and `HVHV` (frequency A) from each HDF5 file over HTTPS, without downloading the ~1.9 GB file. The AOI bbox is projected to the product grid (EPSG:32720, UTM 20S, 20 m) with densified edges, and the window keeps the pixels whose centers fall inside it (`xCoordinates` / `yCoordinates` are pixel centers). For `chaco-central-norte` the window is 2262 × 3137 pixels and the read takes about 1 minute (~75 MB) per date. Values that are 0, negative or not finite are set to NaN. Each crop is saved as a GeoTIFF (γ⁰ linear, bands `HHHH`, `HVHV`) in `data/interim/<aoi>/nisar_<date>.tif`, with the granule id, CRID and maturity as tags. Implementation: `pipeline/fetch/nisar.py` (`read_crop`).
2. **Speckle.** 5 × 5 pixel (100 m) moving mean, computed on linear γ⁰.
3. **dB.** `10·log10(γ⁰)`.
4. **Forest mask.** Planned: MapBiomas Paraguay Collection 2, forest in 2023. **Interim:** ESA WorldCover 2021 v200 tree cover (class 10), averaged onto the 20 m crop grid and kept where the tree fraction is ≥ 0.5 (`pipeline/fetch/worldcover.py`). **Prepared alternative, not run yet:** UMD Global Forest Change 2000–2024 v1.12 (Hansen et al. 2013, US; `pipeline/fetch/gfc.py`, `detection.forest_mask: gfc`): canopy in 2000 ≥ `gfc_min_treecover` (30 %), no loss 2001–2024, on land. Screening on 2026-11-15 (50 m grid): in `boqueron-norte` WorldCover maps 55.5 % of the box as *shrubland* and 35.5 % as tree cover, while GFC gives 96 % of the box ≥ 30 % canopy in 2000 (median 44 %, an open dry forest) and 71 % still forest after 2001–2024 loss. So the WorldCover mask leaves out much of the dry Chaco forest; switching would change the results and needs a full re-run (fetch, process, validate). Because this mask is from 2021, a second condition uses the radar itself: the pixel's normalized HV must be ≥ `min_baseline_db` (−2 dB) on **every** baseline date. Earlier versions used the baseline median with −3 and then −4 dB; the HLS colour check showed that this let through paddocks with regrowth, crops at peak biomass and centre pivots. Without it, the first run flagged 57 polygons (1,456 ha) that were already pasture at baseline (median −4.5 dB) and lost further HV when burned or ploughed; only 2 % of their area matched DIST-ALERT.
5. **Normalization.** For each date, subtract the median HV of all forest pixels in the AOI. This removes most of the effect of rain and of the PROVISIONAL → VALIDATED change, because almost all forest in the AOI stays unchanged over the series (about 11 months).
6. **Detection.**
   - baseline = median of the first 3 dates (2025-11-21, 12-03, 12-15);
   - only pixels that look like forest on every baseline date (see step 4);
   - a pixel is flagged at date i when ΔHV ≤ `threshold_db` at date i and at `persistence` (2) of the dates i, i+1, i+2 (`persistence_window` = 3). The first version required 2 *consecutive* dates; on 2026-04-26 (a wet date, forest median +1.9 dB) bare soil bounced back and broke the run, so one bounce is now tolerated;
   - the detection date is date i. Implementation: `pipeline/process/detect.py`.
7. **Polygons.** All neighbouring (8-connected) flagged pixels are joined, whatever their date, and polygons smaller than `min_area_ha` are dropped. The first version split pixels by date, which cut one clearing into pieces below 5 ha (neighbouring pixels get different dates from radar noise and because felling lasts weeks). Properties: `first_date` = median detection date of the polygon's pixels, area (ha), mean drop at detection (dB). Geometry simplified by 10 m and written in EPSG:4326. Implementation: `pipeline/process/polygons.py`.
8. **Validation** against OPERA DIST-ALERT-HLS V1 (latest product, 2026-11-04; tiles T20KQA and T20KQB), read at 30 m onto the 20 m crop grid. Optical alert = `VEG-DIST-STATUS` 6 or 8 (confirmed ≥ 50 % vegetation loss), first-disturbance date between the first radar date and the last radar date + 24 days, inside the forest mask, patches ≥ 5 ha. Only the published polygons count on the radar side.
   - **agreement** = % of our polygon area that has an optical alert;
   - **coverage** = % of optical-alert area that our polygons cover;
   - each is reported **spatially** (any date in the period) and **within ±24 days** of the radar date, as first planned;
   - **lag** = radar date − optical date, median over the overlapping pixels (negative = radar earlier).

   **Headline numbers (team decision, 2026-11-14):** the spatial agreement and coverage (any date in the period), plus the count of confirmed clearings; the ±24-day numbers are published next to them. An earlier version of this text claimed that the radar sees clearing a median of 36 days before the optical alert. **That claim is withdrawn:** the colour check showed that the events behind it were management of existing paddocks, not felling of standing forest. Whether the radar sees felling earlier than optical products is still an open question for the new study area.

   `dist_confirmed` is true when ≥ 20 % of a polygon has an optical alert. The threshold is tuned **once** with these numbers (see the tuning log). Implementation: `pipeline/fetch/dist_alert.py`, `pipeline/validate/dist_compare.py`.
9. **RGB per date.** The speckle-filtered linear γ⁰ is averaged onto a north-up EPSG:4326 grid that matches the AOI bbox exactly (0.0005°, about 50 m; 1200 × 800 px), so the image corners are the bbox corners. Then R = HH (dB), G = HV (dB), B = HH/HV (dB, i.e. HH − HV). One stretch is used for every date: the 2nd–98th percentiles of each channel over all dates pooled, saved in `data/interim/<aoi>/rgb_stretch.json`. Forest looks yellow-green (high HV); cleared pasture looks blue-violet (low HV, high HH/HV). Implementation: `pipeline/export/rgb_png.py`, `pipeline/process/calibrate.py`.

**Time series for the chart (`grid_500m.json`).** Each crop is averaged (linear γ⁰) onto a 125 × 89 cell EPSG:4326 grid over the AOI (about 500 m cells) and stored as dB × 10 per date, for HH and HV. Implementation: `resample_to_grid` in `pipeline/export/rgb_png.py`, `build_grid` in `pipeline/export/to_json.py`.

## Results for `boqueron-norte` (2026-11-14)

- **Detection** (26 dates, 2025-11-21 → 2026-10-23; −3 dB, 2 of 3 dates, forest-like on all baseline dates at −2 dB, ≥ 5 ha): **31 clearings, 596 ha**, mostly dated March–May 2026, published as **49 hexagons** of 1 km. Sanity checks passed (largest forest-median jump 1.42 dB; at most 0.10 % of the forest flagged on one date).
- **Against OPERA DIST-ALERT:** agreement 7.4 % (±24 days: 1.9 %), coverage 23.9 % (±24 days: 6.2 %); 3 of 31 clearings confirmed. DIST-ALERT reports only 185 ha of confirmed loss in forest in this box.
- **Visual review with HLS true colour** (Sentinel-2, 2025-11-19 vs 2026-11-04), done by the team, one panel per clearing: in about **25 of 31** clearings, continuous forest in November 2025 has become **new paddock blocks** by November 2026. About 5 are at the edge of existing paddocks and may be management. This review is our own interpretation of optical images, not field data.
- **Reading:** the low agreement with DIST-ALERT comes mostly from the optical alert product missing new clearings that are visible in the HLS images; the radar found them. The detector is conservative: many new paddocks in the HLS images are larger than the radar polygon, so 596 ha is a lower bound.
- The radar-earlier question remains open here: the median lag on the few overlapping pixels is +43 days (radar *later*), from only 3 confirmed clearings.

## Results for the other zones (2026-11-14, night)

- **`boqueron-sur`** (`[-61.7, -22.8, -61.1, -22.4]`, track 161 frame 166, 11 dates; baseline 2025-12-27 and 2026-01-08 because the frame has no data from 2026-01-08 to 2026-06-25; **both baseline dates are BETA products** (CRID X05010, collection `NISAR_L2_GCOV_BETA_V1`, not calibrated; checked in NASA CMR), so this zone's baseline relies on the per-date normalization to absorb the calibration difference): **24 clearings, 1,600 ha**, published as 60 hexagons. Most are dated 2026-06-25, which means **between 2026-01-08 and 2026-06-25** (`prev_date` → `first_date` in the data), not "±12 days". DIST-ALERT: coverage 81.6 %, agreement 20.1 %, 7 of 24 confirmed. Visual HLS review (2026-01-08 vs 2026-11-04): about 19–20 of 24 are new paddock blocks (≈ 90 ha squares and one new centre pivot) in forest; about 4 are next to existing paddocks. **Sanity check:** the forest median jumped 2.09 dB between 2026-10-11 and 2026-10-23 (limit 2 dB). The cause was rain, not the product version: NASA POWER gives 116.7 mm on 2026-10-05 and rain until 10-11 (the 10-11 median is +2 dB above the usual level), while 10-23 (VALIDATED) is in line with 09-29 (PROVISIONAL). The per-date normalization corrects it, so the run continued with `--ignore-sanity`.
- **`mbaracayu`** (control, `[-55.7, -24.4, -55.2, -24.0]`, track 82 descending frame 101, 11 dates Jun–Oct 2026): **1 polygon of 6 ha**. Forest that should not change does not change, as expected. Note that this series has only 4 months.
- **`neembucu`** (chapter 2, water, `[-57.9, -27.3, -57.3, -26.6]`): track 10 descending, frame 102, 10 dates (2026-06-26 → 2026-10-24). Track 60 ascending, frame 164 was tried first and **rejected**: the 2026-07-12 product is empty over the zone and 2026-07-24 is striped with a no-data band, both with whole-scene shifts of about −20 and +12 dB in both channels (HH−HV stayed at ~8 dB, so this is a gain/product problem, not flooding); on 2026-06-18 and 06-30 the Paraguay river does not look like water and 06-18 shows block artefacts; 2026-09-22 has no HV. These problems led to the **quality gate** below.

## Chapter 2: water classes (`kind: water`)

On the 50 m grid of the RGB (speckle-filtered, averaged in linear γ⁰, then dB):

- **open water**: HH < −18 dB and HV < −24 dB. Smooth water reflects the radar away from the sensor (specular reflection), so both channels are very dark;
- **flooded vegetation**: HH > −4 dB and HH − HV > 10 dB. Water under plants adds a water-to-stem double bounce that brightens HH much more than HV;
- everything else: other.

The thresholds are estimates checked by eye on 2026-11-14 (the Paraguay river and lagoons come out as open water; esteros as flooded vegetation) and every result is labelled "estimado". Known confusions: smooth bare or ploughed fields and flooded rice can look like open water; wind roughens water and makes it brighter. Implementation: `pipeline/process/water.py`, export stage in `pipeline/run.py`.

## Quality gate (all zones)

Before exporting, each scene's forest HV median (WorldCover tree pixels on the 50 m grid) is compared with the median of all the zone's scenes. If it differs by more than `quality.max_ref_deviation_db` (4 dB), the scene is left out and listed in `index.json` → `excluded_scenes` with the reason. Real changes on the ground are local; a whole-scene jump of several dB in stable forest means a product problem.

## Default parameters

| Parameter | Value | Origin |
|---|---|---|
| `speckle_window` | 5 | 100 m at 20 m pixels |
| `baseline_dates` | 3 | 2025-11-21, 12-03, 12-15 |
| `min_baseline_db` | -2.0 | Forest-like on **every** baseline date (normalized HV); replaces the −4 dB baseline-median condition (see step 4) |
| `threshold_db` | -3.0 | Chosen once (tuning log); the ASF Cookbook example uses −2 dB |
| `persistence` / `persistence_window` | 2 of 3 | Avoids one-date drops (rain, noise) and tolerates one wet-date bounce |
| `min_area_ha` | 5 | Matches the DIST-ALERT comparison filter |
| `normalize` | `forest_median` | Step 5 |

## Web visualization: hexagon aggregation

Done in the browser (`web/src/map/hexgrid.ts`), so the data contract does not change.

- All of Paraguay is tiled with pointy-top hexagons of 24 km radius (≈ 149,600 ha or 1,500 km² each; 277 hexagons whose centre falls inside the Natural Earth 1:50m outline of Paraguay), in a local equirectangular projection centred on the AOI. Within the AOI the distortion is < 0.5 %; at the far south of the country (27.5° S) the cells are about 5 % wider east–west in true distance, which only matters for the empty grid.
- Only the 23 hexagons that overlap a clearing or control zone have radar data (11 with clearing, 2,201 ha in all; the busiest ≈ 966 ha); the mini hexagons below and the pipeline's 1 km hexagons (an option on the map) show where it is. Every one of them takes part in the aggregation, so clearing near the edge is never dropped. The rest of the grid has **no data**: it is shaded and the legend and panel say so, so it never reads as "no clearing".
- **Mini hexagons when zooming in.** From map zoom 8.4 (cross-fade 8.0–8.8) the big hexagons fade out and a second grid of 2 km hexagons (≈ 1,040 ha each) takes over, all over Paraguay. Only the 331 that overlap the study area have data (21 with clearing, the busiest ≈ 190 ha), aggregated exactly the same way; the rest of the country (≈ 39,000 cells) is drawn as an empty grid, computed in the browser only around the area on screen (`hexOutlineIn`, recomputed when the map stops moving), with the same projection and origin so the two grids line up. The big hexagon's outline stays as a frame. Hover and tap use the grid on screen, so the panel then describes one mini hexagon, and the timeline counts mini hexagons.
- The size was raised from 1 km (≈ 260 ha) to 1.5, 2, 3, 6, 8, 24 and 40.8 km, then back to 24 km (14 Nov) so the clearing pattern reads at the scale of the whole country; totals do not change.
- Since contract v2, `polygons.geojson` holds the pipeline's 1 km hexagons, not exact clearing shapes. The web grids re-aggregate them: each feature in `polygons.geojson` is sampled on a regular grid (step = √area / 10, between 15 and 100 m). Every sample is assigned to its hexagon, and the polygon's `area_ha` is shared out in proportion to the samples, so hexagon totals add up exactly to the polygon totals (checked: 596.2 ha in both).
- Each share is dated with the polygon's `first_date`. The map colours a hexagon by the hectares cleared inside it up to the selected date (scale 1 · 10 · 25 · 50 · 100+ ha); hexagons that grew in the selected pass pulse.
- The hexagon panel shows hectares and % of the hexagon, first detection date, how many of its clearings overlap an OPERA DIST-ALERT alert, and the hectares detected at each pass. The pipeline's 1 km hexagons stay available as an option.
- Hexagons make small clearings visible at the scale of the whole study area; they summarize, they do not add detections.

**Several zones (contract v3).** The web reads `zones.json` and loads every zone from its folder (`path`), so all zones are on one map at once: the clearing and control zones are aggregated into the same hexagon grids (one projection, anchored on the primary zone) and coloured in red the same way; the water zone (Ñeembucú) has no clearing detection; its flooding is drawn in the same hexagon grids, in purple. Every coloured pixel of its water-classes PNG of a date (contract "Water zones": blue open water, green flooded vegetation) is counted into the hexagon that holds its centre, with its true area (cos-latitude per row), so each big and mini hexagon gets hectares of open water and of flooded vegetation per date; summed over the hexagons they equal `water.json` exactly (checked for all 10 dates, both grids). Hexagons are coloured by open water + flooded vegetation (purple scale 1 · 50 · 200 · 500 · 1,000+ ha), synced with the timeline; the zone panel charts `water.json` (labelled "estimated", with the note that the October open-water peak is flooded rice fields, not a natural flood) and a tapped hexagon shows its own hectares; tapping also adds the HH / HV series of the 500 m cell and the rain. Colours: one strong colour per kind of change, red for clearing and purple for flooding; the control zone is not a hazard and keeps a neutral grey label. The published `index.json` scenes have no `water` field yet, so the web falls back to the contract path `zones/<id>/water/<date>.png`. Because the zones are on different orbits, a zone's pass is shown with the timeline step it falls within half a repeat (6 days) after (e.g. Ñeembucú 2026-10-24 with the 2026-10-23 step). The timeline is the primary zone's: each clearing sits at the latest primary pass up to its `first_date`, and each zone's radar image follows the date on the timeline (its latest scene up to it). Choosing a zone (picker above the map, list in the Layers panel or the tag on its box) only flies the map there and sets `?zona=<id>` with `history.replaceState`: the page never reloads. The other chapters (guide, validation) stay on the primary zone. The hexagon panel uses the zone's own first-detection date, and "between <prev_date> and <first_date>" when the previous pass is more than 12 days back.

## Sanity checks

- The forest HV median changes by more than 2 dB between two dates → check the product version, calibration or rain before going on.
- More than 5 % of the forest is flagged on a single date → mass false positive.
- Polygons over water or outside the mask → alignment bug.

## Threshold tuning log

Run on 2026-11-14, AOI `chaco-central-norte`, 26 dates (2025-11-21 → 2026-10-23), `min_baseline_db` −4, persistence 2 of 3, `min_area_ha` 5. Reference: OPERA DIST-ALERT (518 ha of optical alerts in forest).

| `threshold_db` | Polygons | Area | Agreement (spatial / ±24 d) | Coverage (spatial / ±24 d) | Median lag |
|---|---|---|---|---|---|
| −2.0 (ASF example) | 81 | 1,908 ha | 8.8 % / 1.5 % | 32.3 % / 5.6 % | −108 days |
| **−3.0 (chosen)** | **23** | **566 ha** | **28.3 % / 9.5 %** | **30.9 % / 10.4 %** | **−36 days** |

−2 dB adds mostly noise: coverage barely improves while agreement drops to a third. *This tuning was done in `chaco-central-norte` with the looser forest condition; the HLS check later showed that most of these polygons were paddock management, so the numbers in this table are kept only as a record. The radar-lead interpretation written here at first is withdrawn (see step 8).*

Earlier attempts (same day), kept for the record:
- 11 dates from 2026-06-01, no baseline condition: 57 polygons, 1,456 ha, only 2 % agreement. They were old pasture (still "tree cover" in WorldCover 2021) burned or ploughed in winter → baseline condition added.
- Same with the baseline condition at −3 dB: 0 polygons. The clearings had been felled before June → series extended to November 2025.
- 26 dates, baseline −3 dB, 2 consecutive dates, polygons split by date: 6 polygons, 84 ha → `min_baseline_db` −4, 2 of 3, polygons joined across dates (this table).

## Limitations and next steps

- Change in cover is not proof of illegality; we have no cadastre or permits.
- PROVISIONAL products may change in calibration. BETA products (not calibrated) are used only where nothing else exists: the two baseline dates of `boqueron-sur` and the first date of `neembucu`.
- Dates are ±12 days only when the previous pass is 12 days earlier. After a missing pass or the instrument gap the window is longer (in `boqueron-norte`: 24 days on 2026-04-26, 36 days on 2026-08-24; in `boqueron-sur`: 168 days on 2026-06-25). The data carry `prev_date` and the web shows the real window.
- About 11 months of data in `boqueron-norte` (one wet and one dry season, a single year), fewer in the other zones (`mbaracayu`: 4 months); wet dates such as 2026-04-26 still add noise, and year-to-year variation is not covered.
- Out of scope this weekend: interferometry (GUNW, coherence), polarimetric decomposition, machine learning.

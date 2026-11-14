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

`chaco-central-norte`, bbox `[-60.78, -21.73, -60.18, -21.33]` (EPSG:4326), north-east of Mariscal Estigarribia, Boquerón, Paraguay (about 60 × 45 km). It lies fully inside NISAR track 161, ascending, frame 167 (checked against the product footprint), which has 11 dates from 2026-06-01 to 2026-10-23.

How it was chosen (2026-11-14):
- The first box, `[-61.0, -21.95, -60.4, -21.55]`, showed almost no clearing in Jun–Oct 2026: 22 ha of confirmed ≥ 50 % vegetation loss in OPERA DIST-ALERT (latest product, 2026-11-04) and about 86 ha of sustained HV drop ≤ −3 dB in our NISAR crops.
- Sliding a box of the same size over the 4 DIST-ALERT tiles around it, the activity was to the north and east, inside the same frame. The chosen box had about 320 ha of confirmed ≥ 50 % loss, about 80 % of it after the radar baseline (late June).
- Boxes further north had more loss (~500 ha) but were rejected: they are closer to the PNCAT (Ayoreo Totobiegosode territory), whose exact boundary we could not verify. The study area must stay clear of it.
- A Paraguay-wide scan (DIST-ALERT masked with ESA WorldCover 2021 tree cover, ~210 m) found more forest loss in southern Boquerón (frame 166), but it happened in June–July, before the radar baseline, so the method cannot detect it.

These DIST-ALERT figures are coarse screening numbers, not validation results.

## Data

NISAR L2 GCOV, frequency A (20 MHz, ~20 m), HH and HV, γ⁰ linear with radiometric terrain correction. There are 26 dates from 2025-11-21 to 2026-10-23, every 12 days, with missing acquisitions on 2026-04-14 and 2026-08-12 and an instrument gap between 2026-07-27 and 2026-08-10. All are PROVISIONAL (CRID P05023) except 2026-10-23 (VALIDATED, P05036). The series first started on 2026-06-01; it was extended back to November 2025 because, in the study area, the radar already saw the clearings that OPERA DIST-ALERT reported in June–October as non-forest on 2026-06-01 (normalized HV about −5.6 dB at baseline): the trees had been felled before June, and the optical product noticed the loss later, when the felled vegetation dried or burned. See `CLAUDE.md` §8.1 for the date table and de-duplication rules.

## Processing steps

1. **Subset.** Read only the AOI window of `HHHH` and `HVHV` (frequency A) from each HDF5 file over HTTPS, without downloading the ~1.9 GB file. The AOI bbox is projected to the product grid (EPSG:32720, UTM 20S, 20 m) with densified edges, and the window keeps the pixels whose centers fall inside it (`xCoordinates` / `yCoordinates` are pixel centers). For `chaco-central-norte` the window is 2262 × 3137 pixels and the read takes about 1 minute (~75 MB) per date. Values that are 0, negative or not finite are set to NaN. Each crop is saved as a GeoTIFF (γ⁰ linear, bands `HHHH`, `HVHV`) in `data/interim/<aoi>/nisar_<date>.tif`, with the granule id, CRID and maturity as tags. Implementation: `pipeline/fetch/nisar.py` (`read_crop`).
2. **Speckle.** 5 × 5 pixel (100 m) moving mean, computed on linear γ⁰.
3. **dB.** `10·log10(γ⁰)`.
4. **Forest mask.** Planned: MapBiomas Paraguay Collection 2, forest in 2023. **Interim:** ESA WorldCover 2021 v200 tree cover (class 10), averaged onto the 20 m crop grid and kept where the tree fraction is ≥ 0.5 (`pipeline/fetch/worldcover.py`). Because this mask is from 2021, a second condition uses the radar itself: at baseline the pixel's normalized HV must be ≥ `min_baseline_db` (−3 dB; the forest 10th percentile was −3.3 dB). Without it, the first run flagged 57 polygons (1,456 ha) that were already pasture at baseline (median −4.5 dB) and lost further HV when burned or ploughed; only 2 % of their area matched DIST-ALERT.
5. **Normalization.** For each date, subtract the median HV of all forest pixels in the AOI. This removes most of the effect of rain and of the PROVISIONAL → VALIDATED change, because almost all forest stays unchanged over five months.
6. **Detection.**
   - baseline = median of the first 3 dates (2025-11-21, 12-03, 12-15);
   - only pixels that look like forest at baseline (see step 4);
   - a pixel is flagged when ΔHV ≤ `threshold_db` for `persistence` consecutive dates;
   - the detection date is the first of those dates.
7. **Polygons.** Connected flagged pixels are grouped and polygons smaller than `min_area_ha` are dropped. Properties: first date, area (ha) and mean drop (dB).
8. **Validation** against OPERA DIST-ALERT-HLS V1, ±24 days:
   - **agreement** = % of our polygon area that has an optical alert;
   - **coverage** = % of optical-alert area (forest, ≥ 5 ha) that we detect.

   The threshold is tuned **once** using these two numbers, and the tuning is recorded below.
9. **RGB per date.** The speckle-filtered linear γ⁰ is averaged onto a north-up EPSG:4326 grid that matches the AOI bbox exactly (0.0005°, about 50 m; 1200 × 800 px), so the image corners are the bbox corners. Then R = HH (dB), G = HV (dB), B = HH/HV (dB, i.e. HH − HV). One stretch is used for every date: the 2nd–98th percentiles of each channel over all dates pooled, saved in `data/interim/<aoi>/rgb_stretch.json`. Forest looks yellow-green (high HV); cleared pasture looks blue-violet (low HV, high HH/HV). Implementation: `pipeline/export/rgb_png.py`, `pipeline/process/calibrate.py`.

**Time series for the chart (`grid_500m.json`).** Each crop is averaged (linear γ⁰) onto a 125 × 89 cell EPSG:4326 grid over the AOI (about 500 m cells) and stored as dB × 10 per date, for HH and HV. Implementation: `resample_to_grid` in `pipeline/export/rgb_png.py`, `build_grid` in `pipeline/export/to_json.py`.

## Default parameters

| Parameter | Value | Origin |
|---|---|---|
| `speckle_window` | 5 | 100 m at 20 m pixels |
| `baseline_dates` | 3 | Jun 1, Jun 13, Jun 25 |
| `threshold_db` | -3.0 | Starting point; the ASF Cookbook example uses -2 dB |
| `persistence` | 2 | Avoids one-date drops (rain, noise) |
| `min_area_ha` | 5 | Matches the DIST-ALERT comparison filter |
| `normalize` | `forest_median` | Step 5 |

## Sanity checks

- The forest HV median changes by more than 2 dB between two dates → check the product version, calibration or rain before going on.
- More than 5 % of the forest is flagged on a single date → mass false positive.
- Polygons over water or outside the mask → alignment bug.

## Threshold tuning log

TODO: record the run, the two validation numbers and the final threshold.

## Limitations and next steps

- Change in cover is not proof of illegality; we have no cadastre or permits.
- PROVISIONAL products may change in calibration.
- Five months of data; seasonal effects are only partly covered.
- Out of scope this weekend: interferometry (GUNW, coherence), polarimetric decomposition, machine learning.

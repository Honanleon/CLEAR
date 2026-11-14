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

`chaco-central-norte`, bbox `[-61.0, -21.95, -60.4, -21.55]` (EPSG:4326), north of Mariscal Estigarribia, Boquerón, Paraguay. It fits inside NISAR track 161, ascending, frame 167. The area deliberately excludes the PNCAT (Ayoreo Totobiegosode territory). TODO: write down the evidence from OPERA DIST-ALERT that clearing happened inside this box in Jun–Oct 2026.

## Data

NISAR L2 GCOV, frequency A (20 MHz, ~20 m), HH and HV, γ⁰ linear with radiometric terrain correction. There are 11 dates from 2026-06-01 to 2026-10-23, every 12 days, with a gap between 2026-07-27 and 2026-08-10 (instrument) and a missing 2026-08-12 acquisition. See `CLAUDE.md` §8.1 for the date table and de-duplication rules.

## Processing steps

1. **Subset.** Read only the AOI window of `HHHH` and `HVHV` (frequency A) from each HDF5 file over HTTPS, without downloading the ~1.9 GB file. The AOI bbox is projected to the product grid (EPSG:32720, UTM 20S, 20 m) with densified edges, and the window keeps the pixels whose centers fall inside it (`xCoordinates` / `yCoordinates` are pixel centers). For `chaco-central-norte` the window is 2262 × 3137 pixels and the read takes about 1 minute (~75 MB) per date. Values that are 0, negative or not finite are set to NaN. Each crop is saved as a GeoTIFF (γ⁰ linear, bands `HHHH`, `HVHV`) in `data/interim/<aoi>/nisar_<date>.tif`, with the granule id, CRID and maturity as tags. Implementation: `pipeline/fetch/nisar.py` (`read_crop`).
2. **Speckle.** 5 × 5 pixel (100 m) moving mean, computed on linear γ⁰.
3. **dB.** `10·log10(γ⁰)`.
4. **Forest mask.** MapBiomas Paraguay Collection 2, forest classes in 2023.
5. **Normalization.** For each date, subtract the median HV of all forest pixels in the AOI. This removes most of the effect of rain and of the PROVISIONAL → VALIDATED change, because almost all forest stays unchanged over five months.
6. **Detection.**
   - baseline = median of the first 3 dates;
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

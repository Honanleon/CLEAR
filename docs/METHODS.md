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

1. **Subset.** Read only the AOI window of HH and HV from each HDF5 file over HTTPS, using `xCoordinates` / `yCoordinates` in the file's projection. Pixels equal to 0 or NaN are set to NaN.
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
9. **RGB per date.** R = HH, G = HV, B = HH/HV, stretched with the same fixed percentiles for every date.

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

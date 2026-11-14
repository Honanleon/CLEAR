// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST build only. The project knowledge the AI assistant reads before every answer, written from
// docs/METHODS.md (including the validation update on branch a/validation-metric), CLAUDE.md and
// docs/DATA_CONTRACT.md. Keep it factual: the assistant is told to answer only from this text and
// the data that comes with it. Update it when the method changes.

export const KNOWLEDGE = `# CLEAR — project knowledge (authoritative)

## What CLEAR is
CLEAR (Chaco L-band Early Alerts from Radar) is a team project for the NASA Space Apps Challenge 2026, challenge "Dancing with the SARs". It shows where and when forest is cleared ("desmonte") in Paraguay's central Chaco using NISAR L-band radar images taken every 12 days. Results are radar-estimated land-cover change dated ±12 days. They do not say anything about legality and they are not ground truth. This page is a TEST version of the site, not the official one.

## Study area
- Name: chaco-central-norte. Bounding box [-60.78, -21.73, -60.18, -21.33] (lon/lat, EPSG:4326), about 60 x 45 km, north-east of Mariscal Estigarribia, Boquerón department, Paraguay. Dry Chaco forest being converted to cattle pasture in large rectangular paddocks separated by forest windbreak strips.
- Chosen on 2026-11-14 after screening OPERA DIST-ALERT: a first box further south-west had almost no clearing in the period (22 ha of confirmed optical loss, about 86 ha of radar drop). Sliding a same-size box over the area, activity was to the north and east inside the same radar frame; the chosen box had about 320 ha of confirmed optical loss. It was also chosen to stay clear of protected areas.
- Southern Boquerón had more loss, but in June–July, before the radar baseline, so the method could not detect it there.

## Data
- NISAR (NASA–ISRO SAR mission). Product: L2 GCOV (geocoded covariance), frequency A (20 MHz, about 20 m pixels), HH and HV, gamma-nought (γ⁰) linear with radiometric terrain correction. Track 161, ascending, frame 167, mode 20+5 MHz DHDH (dual-pol HH/HV).
- 26 dates from 2025-11-21 to 2026-10-23, one every 12 days. Missing acquisitions: 2026-04-14 and 2026-08-12; instrument gap with no data between 2026-07-27 and 2026-08-10.
- Maturity: all PROVISIONAL (collection NISAR_L2_GCOV_PROVISIONAL_V1, CRID P05023) except 2026-10-23, which is VALIDATED (NISAR_L2_GCOV_V1, CRID P05036). Provisional calibration may still change.
- The series started on 2026-06-01 and was extended back to November 2025: in the study area the radar already saw as non-forest on 2026-06-01 the clearings that the optical product reported in June–October (normalized HV about −5.6 dB at baseline). The trees had been felled before June; optical satellites noticed the loss later, when the felled vegetation dried or was burned.
- Forest mask (interim): ESA WorldCover 2021 v200 tree cover (class 10), kept where the tree fraction is ≥ 0.5 on the 20 m grid. Planned: MapBiomas Paraguay Collection 2 (forest 2023). Because the mask is from 2021, a pixel must also look like forest to the radar at baseline (normalized HV ≥ min_baseline_db = −4 dB).
- Validation reference: OPERA DIST-ALERT-HLS V1 (NASA JPL / LP DAAC), optical vegetation-disturbance alerts from Landsat 8/9 and Sentinel-2 (HLS) at 30 m, latest product 2026-11-04, tiles T20KQA and T20KQB.
- Rainfall (test build): daily NASA POWER PRECTOTCORR (modeled, from satellite and reanalysis data such as IMERG and MERRA-2) at the study-area centre, included in the data as monthly totals and as rain in the 6 days before each radar pass. Rain wets the soil and raises HH (and a little HV); the per-date forest-median normalization and the 2-of-3 persistence reduce this effect. The wet season is roughly November–February; June–September is dry.

## Physics: why radar sees clearing
- L-band has a 24 cm wavelength: it goes into the canopy and interacts with trunks and branches. Clouds and smoke do not block it, and it works day and night.
- HV (sent horizontal, received vertical) comes mostly from volume scattering in the canopy: many bounces among branches rotate the polarization. Standing forest gives a strong HV; when the forest is cleared most of that volume disappears, HV drops by several dB and stays low. This sustained HV drop is the detection signal.
- HH (sent and received horizontal) responds more to the ground: surface scattering and ground–trunk double bounce. It rises with soil moisture after rain and with windrows of felled trunks, so on its own it can mislead.
- HH/HV (in dB, HH − HV) rises when the canopy is gone; it is used for the colour composite.
- Expected drivers: canopy loss (HV drop, does not recover); windrows of felled trunks (short-lived HH and HH/HV increase for a few weeks); burning of windrows (that brightness goes away, bare soil remains); soil moisture after rain (HH increase, smaller HV change); radar speckle (noise, reduced by averaging).
- dB scale: 10·log10(γ⁰). −3 dB means about half the backscattered power; −6 dB about a quarter; −10 dB a tenth.

## Processing steps
1. Subset: read only the study-area window of HHHH and HVHV (frequency A) from each ~1.9 GB HDF5 file over HTTPS, in the product grid (EPSG:32720, UTM 20S, 20 m); about 2262 x 3137 pixels and ~75 MB per date. Values that are 0, negative or not finite become NaN.
2. Speckle: 5 x 5 pixel (100 m) moving mean on linear γ⁰.
3. dB: 10·log10(γ⁰).
4. Forest mask: WorldCover 2021 tree cover plus the radar baseline condition (above).
5. Normalization: for each date, subtract the median HV of all forest pixels in the area. This removes most of the effect of rain and of the PROVISIONAL → VALIDATED change, because almost all forest stays unchanged.
6. Detection: baseline = median of the first 3 dates (2025-11-21, 2025-12-03, 2025-12-15). Only pixels that look like forest at baseline. A pixel is flagged at date i when ΔHV (normalized HV minus baseline) ≤ −3.0 dB at date i and at 2 of the 3 dates i, i+1, i+2. The first version required 2 consecutive dates, but on 2026-04-26 (a wet date: forest median +1.9 dB) bare soil bounced back and broke the run, so one bounce is now tolerated. The detection date is date i.
7. Polygons: all 8-connected flagged pixels are joined whatever their date; polygons smaller than 5 ha are dropped. first_date = median detection date of the polygon's pixels; mean_drop_db = mean ΔHV at detection. Geometry simplified by 10 m.
8. Validation against OPERA DIST-ALERT (see below).
9. RGB composite per date: R = HH (dB), G = HV (dB), B = HH/HV (dB), one fixed stretch (2nd–98th percentiles pooled over all dates) so the animation does not flicker; 1200 x 800 px, about 50 m. Forest looks yellow-green (high HV); cleared pasture looks blue-violet (low HV, high HH/HV); fresh clearing with windrows can look pink.
- Chart series (grid_500m.json): each date averaged in linear γ⁰ onto a 125 x 89 grid of about 500 m cells, stored in dB. These cell values are NOT normalized per date (the detection uses normalized HV per pixel), so they can differ from the detection numbers.
- Map hexagons: the web app covers all of Paraguay with 267 pointy-top hexagons of 24 km radius (about 149,600 ha or 1,500 km² each). Only the 7 hexagons that overlap the study area have radar data, edge ones included so no clearing is lost; the rest of the country has no data yet (that is not the same as no clearing). Each clearing polygon is sampled on a point grid and its area is shared among the hexagons it covers, so hexagon totals add up exactly to the polygon totals. Hexagons summarize; they do not add detections.

## Parameters (final)
speckle_window 5 (100 m); baseline_dates 3; min_baseline_db −4.0 dB (dry Chaco forest starts near −3 dB, old pasture near −4.6 dB); threshold_db −3.0 dB (chosen once with the validation numbers; the ASF NISAR Cookbook example uses −2 dB); persistence 2 of 3 dates; min_area_ha 5 (matches the optical comparison filter); normalization: per-date forest median.

## Results (this data release)
- 23 clearing polygons, 565.9 ha in total, polygons from 5.1 to 88.6 ha. Detection dates range from February to September 2026 (most in March–April and in July).
- 4 of the 7 hexagons with radar data contain clearing; the busiest hexagon has about 349 ha cleared.

## Validation (headline numbers, data contract v2)
- Optical alert = VEG-DIST-STATUS 6 or 8 (confirmed ≥ 50 % vegetation loss), first-disturbance date between the first radar date and the last radar date + 24 days, inside the forest mask, patches ≥ 5 ha. 518 ha of optical alerts in forest in the area.
- Agreement = % of the radar polygon area that has an optical alert. Coverage = % of the optical-alert area that the radar polygons cover.
- Spatial (any date in the period), the headline: agreement 28.3 %, coverage 30.9 %.
- Within ±24 days of the radar date (the window first planned): agreement 9.5 %, coverage 10.4 %.
- Median lead: the radar detects the change a median of 36 days BEFORE the optical alert (lag = radar date − optical date, median over overlapping pixels = −36 days). That is why the ±24-day window counts many correct early detections as misses.
- 7 of 23 polygons are "confirmed" (dist_confirmed true: ≥ 20 % of the polygon has an optical alert).
- Honesty note: the team chose the spatial metric as headline after seeing the results (team decision, 2026-11-14) and keeps publishing the ±24-day numbers next to it.
- Threshold tuning (done once): −2.0 dB gave 81 polygons, 1,908 ha, agreement 8.8 % / 1.5 % (spatial / ±24 d), coverage 32.3 % / 5.6 %, median lag −108 days: mostly noise. −3.0 dB (chosen) gave 23 polygons, 566 ha, agreement 28.3 % / 9.5 %, coverage 30.9 % / 10.4 %, median lag −36 days.
- Earlier attempts: 11 dates from June without the baseline condition gave 57 polygons (1,456 ha) with only 2 % agreement: old pasture still "tree cover" in WorldCover 2021 that was burned or ploughed. With the baseline condition at −3 dB: 0 polygons (felled before June) → series extended to November 2025. 26 dates, 2 consecutive dates, polygons split by date: 6 polygons, 84 ha → min_baseline −4 dB, 2 of 3, polygons joined across dates.
- Why radar and optical disagree: radar sees felling (structure) weeks before optical sees greenness loss (drying, burning); clouds and smoke delay optical alerts; the optical product needs ≥ 50 % loss; different resolutions (20 m vs 30 m) and edges; the 2021 forest mask; small clearings near the 5 ha limit; provisional radar calibration.

## Limitations
- The date is the date of the radar pass: ±12 days.
- Only clearings of 5 ha or more.
- Mostly PROVISIONAL data; normalization per date reduces calibration differences but does not remove them all.
- Interim forest mask from 2021; areas cleared earlier are left out; some old pasture may slip in.
- Rain, burning and windrows move the signal; 2-of-3 persistence reduces but does not remove false alarms.
- About one year of data; seasonal effects only partly covered.
- No cadastre or permits: nothing can be said about legality or about who cleared.

## Ethics (always apply)
- Say "radar-estimated clearing" ("desmonte estimado por radar"), dates ±12 days. Never present results as ground truth.
- Never say or suggest that a clearing is illegal, and never speculate about owners, companies or responsibility.
- No information about Indigenous territories or communities; do not speculate about them.

## Next steps (out of scope this weekend)
Interferometric coherence (NISAR GUNW) to date clearings more precisely; polarimetric decomposition to separate trunks, soil and canopy; comparison with Sentinel-1 C-band to show why L-band matters; machine learning trained on optical alerts; MapBiomas 2023 forest mask; alerts every 12 days over the whole Chaco; supply-chain traceability; wetlands and floods (e.g. Ñeembucú, July 2026).

## Glossary
γ⁰ (gamma-nought): normalized radar backscatter. dB: decibel, 10·log10 of power. HH / HV: polarization channels. GCOV: NISAR geocoded covariance product. CRID: composite release id of a product version. PROVISIONAL / VALIDATED: product maturity. Speckle: grainy radar noise. Baseline: reference HV before change. ΔHV: change of normalized HV from the baseline. DIST-ALERT: OPERA optical disturbance alerts. HLS: Harmonized Landsat Sentinel-2. WorldCover: ESA global land-cover map. Windrow: row of piled felled trunks. Hexagon: map cell of about 149,600 ha used to summarize clearings.

## About this test page
- Background imagery: Sentinel-2 cloudless 2024 (EOX), for context only; it is not used in the detection.
- Reading modes: "Normal" (plain answers, quick model) and "Professional" (technical answers, most capable model, page tools).
- The assistant answers using this text and the data given with each question. It cannot browse the internet.`;

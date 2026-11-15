<!-- Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md -->

# Context of the study zones

Numbers that put the radar results in context: forest loss, fires, floods and agriculture around the study zones. They come from US sources and are **not part of the detection**. Forest loss and fires are computed by us over each zone's box with `python -m pipeline.context_stats --firms <folder>` (2026-11-15); the rest are published figures.

## Forest loss per zone (UMD Global Forest Change 2000–2024 v1.12)

Forest = canopy ≥ 30 % in 2000; loss = any year 2001–2024 (Hansen et al. 2013). GFC counts **any** canopy loss: clearing, fire and plantation harvest alike.

| Zone | Forest in 2000 | Lost 2001–2024 | Years with most loss |
|---|---|---|---|
| `boqueron-norte` | 265,583 ha | 68,270 ha (26 %) | 2024: 15,997 ha · 2018: 11,052 · 2012: 5,865 |
| `boqueron-sur` | 249,458 ha | 111,255 ha (45 %) | 2009: 9,535 · 2011: 9,054 · 2012: 8,337 |
| `mbaracayu` (box) | 166,656 ha | 66,037 ha (40 %) | 2020: 8,319 · 2024: 5,826 · 2019: 4,658 |

- `boqueron-norte` lost almost nothing until 2010 and had its **worst year in 2024**: an active clearing front, consistent with what NISAR sees in 2025–2026.
- `boqueron-sur` was cleared earlier, mostly 2005–2014.
- `mbaracayu`: the box holds the reserve and its surroundings (see METHODS, control zone).

## Fires per zone (NASA FIRMS, MODIS C6.1, 2001–2025)

Vegetation-fire detections (type 0, confidence ≥ 30) inside each box. A detection is a hot 1 km pixel at the satellite pass, not a burned area.

| Zone | Detections | Years with most | Months with most |
|---|---|---|---|
| `boqueron-norte` | 1,630 | 2019: 464 · 2012: 275 · 2015: 232 | Jul–Oct |
| `boqueron-sur` | 6,258 | 2013: 667 · 2020: 492 · 2011: 427 | Sep–Nov |
| `neembucu` | 12,380 | 2020: 1,387 · 2003: 1,275 · 2023: 1,170 | Aug–Sep |
| `mbaracayu` | 9,151 | 2003: 791 · 2024: 762 · 2002: 457 | Aug–Sep |

Paraguay as a whole had its most detections in 2020 (67,022).

**Clearing or fire?** Crossing both sources:
- `boqueron-norte` 2024: 15,997 ha of loss but only **14** fire detections → clearing, not fire.
- `boqueron-norte` 2018 → 2019: 11,052 ha lost in 2018, then the zone's record of **464** detections in 2019. This fits hypothesis 3 (fell first, burn the windrows months later).
- `mbaracayu`: the loss peaks (2020, 2024) are also years with many detections, so part of that loss is fire.

## Mbaracayú Forest Nature Reserve

- Created by Law 112/91; 64,405 ha core; UNESCO biosphere reserve since 2000; managed by Fundación Moisés Bertoni.
- In 2025 SENAD destroyed **134 ha of illegal cannabis crops inside the reserve** (operations Mbaracayú I–III); FMB estimates 90,000–100,000 native trees were felled for them (Agencia IP, 2025-07-21).

## Floods (Ñeembucú)

OPERA surface water products (NASA JPL) exist over the `neembucu` box for Jun–Nov 2026: **156 DSWx-HLS** (optical, near daily) and **53 DSWx-S1** (Sentinel-1 radar) granules (NASA CMR, 2026-11-15). They would validate the water chapter as DIST-ALERT does the clearing one. Not downloaded yet (needs an Earthdata login).

## Agriculture and cattle (USDA FAS, PSD Online, Paraguay)

| | 2000 | 2010 | 2020 | 2024 |
|---|---|---|---|---|
| Soybean area harvested | 1.35 M ha | 2.87 M ha | 3.29 M ha | 3.75 M ha |
| Soybean production | 3.5 M t | 7.1 M t | 9.6 M t | 10.2 M t |
| Beef and veal exports | 58 kt | 274 kt | 371 kt | 472 kt |

National figures by market year (USDA PSD download of 2026-11-15). Beef exports grew about 8× since 2000: cattle is the driver of clearing in the Chaco. Soybean is mostly in the Eastern Region, under the zero-deforestation law (Law 6676/2020).

## Caveats

- GFC loss mixes clearing and fire; FIRMS counts detections, not hectares.
- Zone boxes are rectangles: they include land around the forest of interest.
- These numbers do not say anything about the legality of any clearing.

<!-- Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md -->

# References

Every data source, library, paper, image and tool used by CLEAR. **If you add something to the project, add its entry here in the same commit.**

Status: `used` = already in the code or the app; `planned` = listed in the plan, not used yet.

## Data credit

> NISAR data courtesy of NASA/JPL. Distributed by the Alaska Satellite Facility (ASF) DAAC.

## Data sources

| Source | Provider | Type | How we use it | Citation / link | Status |
|---|---|---|---|---|---|
| NISAR L2 GCOV, PROVISIONAL V1 (`NISAR_L2_GCOV_PROVISIONAL_V1`, CRID P05023) | NASA/JPL, ASF DAAC | satellite | HH and HV backscatter, track 161 ascending, frame 167, Nov 2025 – Oct 2026 | DOI 10.5067/NIL2GCOV-P1 · CMR C2854338529-ASF · https://www.earthdata.nasa.gov/data/catalog/asf-nisar-l2-gcov-provisional-v1-1 | used |
| NISAR L2 GCOV BETA V1 (`NISAR_L2_GCOV_BETA_V1`, not calibrated, CRIDs X05009 and X05010) | NASA/JPL, ASF DAAC | satellite | Baseline dates of `boqueron-sur` (2025-12-27, 2026-01-08) and first date of `neembucu` (2025-11-02) | DOI 10.5067/NIL2GCOV-B1 · CMR C3622214170-ASF | used |
| NISAR L2 GCOV V1 (`NISAR_L2_GCOV_V1`, VALIDATED, CRID P05036) | NASA/JPL, ASF DAAC | satellite | Same as above, for 2026-10-23 | DOI 10.5067/NIL2GCOV-V1 · CMR C3622241360-ASF · https://search.earthdata.nasa.gov/search/granules?p=C3622241360-ASF | used |
| OPERA DIST-ALERT-HLS V1 (`OPERA_L3_DIST-ALERT-HLS_V1`) | NASA JPL / LP DAAC | satellite | Validation: optical vegetation-loss alerts; also used to choose the study area | DOI 10.5067/SNWG/OPERA_L3_DIST-ALERT-HLS_V1.001 | used |
| MapBiomas Paraguay, Collection 2 | MapBiomas | modeled | 2023 forest mask | https://paraguay.mapbiomas.org/ | planned |
| NASA POWER, daily `PRECTOTCORR` | NASA LaRC | modeled | Rain bars in the time-series chart (official site and test build); `rain.json` per zone, centre of the zone's bbox (pipeline, contract v3) | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | used |
| Esri World Imagery (basemap tiles) | Esri, Maxar, Earthstar Geographics, GIS User Community | satellite | High-resolution satellite photo under the web map (default view). Optional: the map works without it | https://www.arcgis.com/home/item.html?id=10df2279f9684e4a9f6a7f08febac2a9 · attribution shown on the map | not used since 2026-11-14 (replaced by a simple grey-and-white map) |
| OpenFreeMap vector tiles (OpenMapTiles schema) | OpenFreeMap; data © OpenStreetMap contributors (ODbL) | measured | The whole base map since 2026-11-14 (simple grey and white: water, main roads, borders and place names: country, department, city, town; no villages) | https://openfreemap.org · https://www.openstreetmap.org/copyright | not used since 2026-11-15 (replaced by Natural Earth, US source) |
| OpenStreetMap Nominatim (one-off lookup) | OpenStreetMap contributors (ODbL) | measured | Coordinates of 4 reference towns (Mariscal Estigarribia, Filadelfia, Loma Plata, Neuland) in `web/src/map/places.json`, used to say "x km north of …" | https://nominatim.openstreetmap.org · looked up 2026-11-14 | not used since 2026-11-15 (reference towns now from Natural Earth) |
| Sentinel-2 cloudless 2024 (basemap tiles, **test build only**) | EOX IT Services GmbH (contains modified Copernicus Sentinel data 2024) | satellite | Offline satellite background of the private test version (`npm run build:lab`); not used by the official site | https://s2maps.eu · CC BY-NC-SA 4.0 (non-commercial, attribution on the map) | used (test only) |
| Sentinel-1 GRD (C-band, optional) | ESA / Copernicus | satellite | Frequency comparison | TODO | planned (optional) |
| NASA FIRMS active fires, MODIS C6.1, yearly country archives of Paraguay 2001–2025 | NASA LANCE / FIRMS | satellite | Fire detections per zone and year in `docs/CONTEXT.md` (`pipeline/context_stats.py`) | https://firms.modaps.eosdis.nasa.gov/country/ · MODIS Collection 6.1 Active Fire, doi:10.5067/FIRMS/MODIS/MCD14ML | used (context) |
| OPERA DSWx-HLS V1 and DSWx-S1 V1 (surface water) | NASA JPL / PO.DAAC | satellite | Planned validation of the Ñeembucú water chapter; availability checked in CMR | DOI 10.5067/OPDSW-PL3V1 · DOI 10.5067/OPDSWS1-L3V1 | planned |
| USDA FAS PSD Online (oilseeds, livestock) | US Department of Agriculture, Foreign Agricultural Service | statistics | Paraguay soybean and beef series in `docs/CONTEXT.md` | https://apps.fas.usda.gov/psdonline/ (downloaded 2026-11-15) | used (context) |
| Agencia IP (Paraguay government news agency), 2025-07-21 | Government of Paraguay | official news | SENAD operations in the Mbaracayú reserve (134 ha of illegal crops) | https://www.ip.gov.py/ip/2025/07/21/frenan-deforestacion-narco-en-reserva-mbaracayu-y-eliminan-mas-de-416-toneladas-de-cannabis/ | used (context) |
| UMD Global Forest Change 2000–2024 v1.12 (`GFC-2024-v1.12`: treecover2000, lossyear, datamask) | University of Maryland (Hansen et al.), from USGS/NASA Landsat | satellite | Alternative forest mask (`pipeline/fetch/gfc.py`), US source, not used for the published results yet; forest loss per zone in `docs/CONTEXT.md` | Hansen, M. C. et al. (2013), *Science* 342: 850–853, doi:10.1126/science.1244693; data https://storage.googleapis.com/earthenginepartners-hansen/GFC-2024-v1.12/download.html; CC-BY 4.0 | used (context); mask planned |
| ESA WorldCover 2021 v200 (10 m) | ESA | satellite | Interim forest mask for detection (`pipeline/fetch/worldcover.py`) and the Paraguay-wide zone screening | Zanaga et al. (2022), doi:10.5281/zenodo.7254221; CC-BY 4.0 | used |
| Natural Earth 1:10m v5.1 (admin-0 countries, admin-1 departments, lakes, rivers and lake centerlines, roads, populated places) | Natural Earth (NACIS, US), public domain | modeled | The whole web base map since 2026-11-15, served with the site (`web/public/basemap/`, built by `pipeline/export/basemap.py`), and the reference towns of the zone panel (`web/src/map/places.json`, 37 places in Paraguay) | https://www.naturalearthdata.com/ (public domain) | used |
| Natural Earth admin-0 / admin-1 boundaries (1:10m) | Natural Earth | modeled | Paraguay and department outlines for the zone screening | https://www.naturalearthdata.com/ (public domain) | used (screening) |
| Paraguay district boundaries (ADM2, DGEEC 2012) via geoBoundaries | geoBoundaries / DGEEC | modeled | Distance from the study area to the district where the PNCAT is located (ethics check, not shown) | Runfola et al. (2020), geoBoundaries, PLoS ONE 15(4): e0231866; CC-BY 4.0 | used (check) |
| Resolución N.º 1/2001, Dirección General de Bienes Culturales (Ministerio de Educación y Culto) | Government of Paraguay | — | Legal declaration and administrative location of the PNCAT (district of Puerto Casado, Alto Paraguay), used only to keep the study area away | — | used (ethics) |
| HLS v2.0 Sentinel-2 (HLSS30), 2025-11-19 and 2026-11-04 | NASA / USGS / ESA | satellite | Colour check of radar detections | doi:10.5067/HLS/HLSS30.002 | used (check) |
| Natural Earth admin-0 countries (1:50m, v5.1.2) | Natural Earth | modeled | Outline of Paraguay (257 points, `web/src/map/paraguay.json`) to tile the whole country with the web map's hexagon grid and to paint Paraguay white on the base map | https://www.naturalearthdata.com/ · https://github.com/nvkelso/natural-earth-vector (public domain) | used |
| NISAR L2 GCOV browse images (ASF quick-looks, `_LATLON.png` and native PNG) | NASA/JPL, ASF DAAC | satellite | Paraguay-wide before / after mosaics in the radar view (before: earliest pass of each frame, 52 frames, ~100 % of the country: Nov 2025 - Jan 2026 in the west and centre, Jun - Jul 2026 in the east, where NISAR first passed in June 2026; after: 2026-10-10..10-31, 54 frames, ~100 %; plus one mosaic per month for the timeline: each frame's latest pass up to that month-end, Nov 2025 - Oct 2026, ~100 % of the country; until May 2026 the east, not yet imaged, is filled with its first pass of Jun - Jul 2026); ASF colours, not calibrated; the July mosaic leaves out the corrupted track 60 pass of 2026-07-24 | ASF search API (`dataset=NISAR&processingLevel=GCOV`), browse URLs of each product · Data courtesy of NASA/JPL | used (context) |
| NASA FIRMS VIIRS S-NPP 375 m thermal anomalies (layer `VIIRS_SNPP_Thermal_Anomalies_375m_All`), daily, 2025-11-01..2026-10-31 | NASA LANCE / FIRMS via NASA GIBS (WMS, no login) | satellite | Red hatched fire layer (days with a detection per hexagon, top quarter shown) and "probable cause" in the hexagon panel (fire detections from 36 days before to 60 days after the clearing date); the drawn symbols are larger than the 375 m pixel, so the extent is inflated | https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi · doi:10.5067/FIRMS/VIIRS/VNP14IMGT_NRT.002 | used (context) |
| OPERA L2 RTC-S1 (Sentinel-1 radiometric terrain corrected backscatter, layer `OPERA_L2_Radiometric_Terrain_Corrected_SAR_Sentinel-1`), 2025-10-21..2025-12-20 and 2026-09-05..2026-10-23 | NASA JPL OPERA / ASF DAAC via NASA GIBS (WMS, no login); contains modified Copernicus Sentinel data (ESA) | satellite | Comparison with another radar (C band) in "¿Es confiable?": VH drop on the clearing hexagons (`pipeline/validate/s1_gibs/`, `web/public/data/radar_compare.json`); rendered images, not calibrated values | https://gibs.earthdata.nasa.gov/ · doi:10.5067/SNWG/OPERA_L2_RTC-S1_V1 | used (validation) |
| Landsat animation of the Chaco, 1985–2025 (SVS 15026) | NASA Goddard Space Flight Center Scientific Visualization Studio | satellite | Story cover and demo video | https://svs.gsfc.nasa.gov/15026 | planned |

## Software libraries

All licenses must be compatible with Apache-2.0. Re-check them with `pip-licenses` after the first install (pending).

| Library | License | Use | Status |
|---|---|---|---|
| asf_search | BSD-3-Clause | Search NISAR products at ASF | used |
| earthaccess | MIT | Earthdata login and search (OPERA, HLS) | used |
| fsspec | BSD-3-Clause | Partial HTTPS reads of HDF5 files | used |
| aiohttp | Apache-2.0 | HTTP backend for fsspec | used |
| h5py | BSD-3-Clause | Read HDF5 (GCOV) | used |
| h5netcdf | BSD-3-Clause | xarray HDF5 engine | planned |
| xarray | Apache-2.0 | Labeled arrays | planned |
| rioxarray | TODO: verify | Raster I/O and reprojection with xarray | planned |
| rasterio | BSD-3-Clause | GeoTIFF I/O and reprojection | used |
| numpy | BSD-3-Clause | Numerics | used |
| scipy | BSD-3-Clause | Speckle filter, connected components | used |
| shapely | BSD-3-Clause | Geometry (polygon export, `pipeline/process/polygons.py`) | used |
| geopandas | BSD-3-Clause | Polygons and GeoJSON export | planned |
| pyproj | MIT | Coordinate transforms | used |
| Pillow | MIT-CMU | PNG export | used |
| PyYAML | MIT | Config file | used |
| requests | Apache-2.0 | NASA POWER API | used |
| pytest | MIT | Tests | used |
| ruff | MIT | Lint and format | used |
| Vite 8.3.5 | MIT | Web build and dev server | used |
| TypeScript 7.0.2 | Apache-2.0 | Web language (strict) | used |
| MapLibre GL JS 6.16.0 | BSD-3-Clause | Interactive map, image sources, before/after maps | used |
| @fontsource-variable/space-grotesk 5.3.0 (Space Grotesk) | OFL-1.1 | Self-hosted UI typeface | used |
| @fontsource-variable/jetbrains-mono 5.3.0 (JetBrains Mono) | OFL-1.1 | Self-hosted monospace typeface | used |

## Methods and tutorials

| Reference | Use |
|---|---|
| ASF NISAR Cookbook: search and stream NISAR GCOV with asf_search. https://asfopensarlab.github.io/NISAR_Cookbook/notebooks/search-stream-nisar-gcov-asf-search | Reference for the search and partial-read approach (no code copied) |
| ASF NISAR Cookbook: SAR change detection methods with GCOV. https://asfopensarlab.github.io/NISAR_Cookbook/notebooks/nisar-gcov-sarchangedetectionmethods | Reference for the ΔHV threshold starting point |
| NISAR GCOV product specification. https://nisar-docs.asf.alaska.edu/gcov/ | HDF5 layout and units |
| NISAR data availability. https://nisar-docs.asf.alaska.edu/availability-overview/ | Acquisition dates |

## Tools

| Tool | Use |
|---|---|
| ASF Vertex (https://search.asf.alaska.edu/) | Manual check of available dates |
| Claude Code (Anthropic) | AI coding assistant; see `docs/AI_USAGE.md` |
| Claude via claude.ai Artifacts (`sample` capability) | **Test build only:** AI assistant in the hexagon panel; runs on the viewer's own Claude account, no API key |
| GitHub, GitHub Pages | Code hosting and backup mirror |
| GitHub Actions, OpenSSH, tar | Deploy pipeline (`.github/workflows/deploy.yml`, `deploy/deploy.sh`) |

## Acknowledgements

- Web hosting: MaxDominios (shared cPanel hosting). Acknowledgement only.

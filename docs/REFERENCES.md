<!-- Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md -->

# References

Every data source, library, paper, image and tool used by CLEAR. **If you add something to the project, add its entry here in the same commit.**

Status: `used` = already in the code or the app; `planned` = listed in the plan, not used yet.

## Data credit

> NISAR data courtesy of NASA/JPL. Distributed by the Alaska Satellite Facility (ASF) DAAC.

## Data sources

| Source | Provider | Type | How we use it | Citation / link | Status |
|---|---|---|---|---|---|
| NISAR L2 GCOV, PROVISIONAL V1 (`NISAR_L2_GCOV_PROVISIONAL_V1`, CRID P05023) | NASA/JPL, ASF DAAC | satellite | HH and HV backscatter, track 161 ascending, frame 167, Jun–Oct 2026 | https://www.earthdata.nasa.gov/data/catalog/asf-nisar-l2-gcov-provisional-v1-1 | used |
| NISAR L2 GCOV V1 (`NISAR_L2_GCOV_V1`, VALIDATED, CRID P05036) | NASA/JPL, ASF DAAC | satellite | Same as above, for 2026-10-23 | TODO: add collection citation | used |
| OPERA DIST-ALERT-HLS V1 (`OPERA_L3_DIST-ALERT-HLS_V1`) | NASA JPL / LP DAAC | satellite | Validation: optical vegetation-loss alerts | DOI 10.5067/SNWG/OPERA_L3_DIST-ALERT-HLS_V1.001 | planned |
| Harmonized Landsat Sentinel-2 (HLS) | NASA / USGS / ESA (Sentinel-2: partner data) | satellite | True-color context and visual checks | TODO: add HLS L30/S30 DOIs | planned |
| MapBiomas Paraguay, Collection 2 | MapBiomas | modeled | 2023 forest mask | https://paraguay.mapbiomas.org/ | planned |
| NASA POWER, daily `PRECTOTCORR` | NASA LaRC | modeled | Rain bars in the time-series chart | https://power.larc.nasa.gov/docs/services/api/temporal/daily/ | planned |
| Sentinel-1 GRD (C-band, optional) | ESA / Copernicus | satellite | Frequency comparison | TODO | planned (optional) |
| Landsat animation of the Chaco, 1985–2025 (SVS 15026) | NASA Goddard Space Flight Center Scientific Visualization Studio | satellite | Story cover and demo video | https://svs.gsfc.nasa.gov/15026 | planned |

## Software libraries

All licenses must be compatible with Apache-2.0. Re-check them with `pip-licenses` after the first install (pending).

| Library | License | Use | Status |
|---|---|---|---|
| asf_search | BSD-3-Clause | Search NISAR products at ASF | used |
| earthaccess | MIT | Earthdata login and search (OPERA, HLS) | planned |
| fsspec | BSD-3-Clause | Partial HTTPS reads of HDF5 files | used |
| aiohttp | Apache-2.0 | HTTP backend for fsspec | used |
| h5py | BSD-3-Clause | Read HDF5 (GCOV) | used |
| h5netcdf | BSD-3-Clause | xarray HDF5 engine | planned |
| xarray | Apache-2.0 | Labeled arrays | planned |
| rioxarray | TODO: verify | Raster I/O and reprojection with xarray | planned |
| rasterio | BSD-3-Clause | GeoTIFF I/O and reprojection | used |
| numpy | BSD-3-Clause | Numerics | used |
| scipy | BSD-3-Clause | Speckle filter, connected components | planned |
| shapely | BSD-3-Clause | Geometry | planned |
| geopandas | BSD-3-Clause | Polygons and GeoJSON export | planned |
| pyproj | MIT | Coordinate transforms | used |
| Pillow | MIT-CMU | PNG export | planned |
| PyYAML | MIT | Config file | used |
| requests | Apache-2.0 | NASA POWER API | planned |
| pytest | MIT | Tests | used |
| ruff | MIT | Lint and format | used |
| Vite | MIT | Web build | planned |
| TypeScript | Apache-2.0 | Web language | planned |
| MapLibre GL JS | BSD-3-Clause | Interactive map | planned |

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
| GitHub, GitHub Pages | Code hosting and backup mirror |
| GitHub Actions, OpenSSH, tar | Deploy pipeline (`.github/workflows/deploy.yml`, `deploy/deploy.sh`) |

## Acknowledgements

- Web hosting: MaxDominios (shared cPanel hosting). Acknowledgement only.

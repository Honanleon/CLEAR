# CLEAR
**Chaco L-band Early Alerts from Radar.** NASA Space Apps Challenge 2026, challenge "Dancing with the SARs".

CLEAR is an interactive story map that shows where and when forest is being cleared in Paraguay's Chaco (northern Boquerón), using NISAR L-band radar images taken every 12 days between November 2025 and October 2026. The signal is a sustained drop in the HV channel: when the forest is cut, the volume scattering from the canopy is lost.

Results are **radar-estimated land-cover change, dated to the radar pass (±12 days, longer after a missing pass)**. They do not say anything about the legality of any clearing.

> Work in progress during the hackathon (Nov 14–15, 2026).

## Repository

| Folder | Content |
|---|---|
| `pipeline/` | Python: download, process, detect and export (runs offline, on laptops or Colab) |
| `web/` | Static site: Vite + TypeScript + MapLibre GL JS |
| `docs/` | [Methods](docs/METHODS.md), [data contract](docs/DATA_CONTRACT.md), [references](docs/REFERENCES.md), [context of the zones](docs/CONTEXT.md), [AI usage](docs/AI_USAGE.md) |

## Data credit
NISAR data courtesy of NASA/JPL, distributed by the ASF DAAC. Full list of data sources and libraries in [docs/REFERENCES.md](docs/REFERENCES.md).

## License
[Apache-2.0](LICENSE)

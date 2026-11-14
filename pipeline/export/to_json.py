# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Build web/public/data/index.json following docs/DATA_CONTRACT.md (schema_version 1)."""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import numpy as np

SCHEMA_VERSION = 1
NISAR_SOURCE = "NISAR L2 GCOV (NASA/JPL, ASF DAAC)"


def image_coordinates(bbox: Sequence[float]) -> list[list[float]]:
    """MapLibre image corners: top-left, top-right, bottom-right, bottom-left."""
    lon_min, lat_min, lon_max, lat_max = bbox
    return [[lon_min, lat_max], [lon_max, lat_max], [lon_max, lat_min], [lon_min, lat_min]]


def build_index(
    aoi_id: str,
    bbox: Sequence[float],
    nisar_cfg: Mapping[str, Any],
    scenes: Sequence[Mapping[str, Any]],
    detection_cfg: Mapping[str, Any],
    generated_at: datetime | None = None,
) -> dict[str, Any]:
    """`scenes`: dicts with date, granule_id, maturity, crid and rgb (path relative to web/public/data)."""
    when = generated_at or datetime.now(ZoneInfo("America/Asuncion"))
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": when.isoformat(timespec="seconds"),
        "aoi": {"id": aoi_id, "bbox": list(bbox)},
        "nisar": {
            "track": nisar_cfg["relative_orbit"],
            "direction": nisar_cfg["flight_direction"],
            "frame": nisar_cfg["frame"],
            "mode": "20+5 DHDH",
        },
        "scenes": [
            {"date": s["date"], "id": s["granule_id"], "maturity": s["maturity"], "crid": s["crid"], "rgb": s["rgb"]}
            for s in sorted(scenes, key=lambda s: s["date"])
        ],
        "image_coordinates": image_coordinates(bbox),
        "detection": {
            "threshold_db": detection_cfg["threshold_db"],
            "persistence": detection_cfg["persistence"],
            "min_area_ha": detection_cfg["min_area_ha"],
            "n_polygons": 0,
            "area_ha_total": 0,
        },
        "validation": {"agreement_pct": None, "coverage_pct": None, "reference": "OPERA DIST-ALERT-HLS V1"},
        "provenance": [{"layer": "rgb", "type": "satellite", "source": NISAR_SOURCE}],
    }


def db_x10(a: np.ndarray) -> list[int | None]:
    """Row-major list of round(10 * dB) of linear gamma0; invalid cells -> None."""
    flat = np.asarray(a, dtype=np.float64).ravel()
    out: list[int | None] = []
    with np.errstate(divide="ignore", invalid="ignore"):
        v = 10.0 * np.log10(flat)
    for x in np.round(v * 10):
        out.append(int(x) if np.isfinite(x) else None)
    return out


def build_grid(
    bbox: Sequence[float], dates: Sequence[str], hv: Sequence[np.ndarray], hh: Sequence[np.ndarray]
) -> dict[str, Any]:
    """grid_500m.json: one row per date (aligned with `dates`), cells row-major from the north-west corner."""
    ny, nx = hv[0].shape
    lon_min, lat_min, lon_max, lat_max = bbox
    return {
        "dates": list(dates),
        "origin": [lon_min, lat_max],
        "cell_deg": [round((lon_max - lon_min) / nx, 7), round(-(lat_max - lat_min) / ny, 7)],
        "nx": nx,
        "ny": ny,
        "hv_db_x10": [db_x10(a) for a in hv],
        "hh_db_x10": [db_x10(a) for a in hh],
    }


def write_json(obj: Any, path: Path, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, separators=(",", ":")) if compact else json.dumps(obj, indent=2, ensure_ascii=False)
    path.write_text(text + "\n")

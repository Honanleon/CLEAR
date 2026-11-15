# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Water classes from L-band HH/HV (chapter 2) and a per-date quality gate.

Open water: smooth water reflects the radar away, so HH and HV are both very low.
Flooded vegetation: water under plants adds a water-stem double bounce, so HH is very high and much higher than HV.
Thresholds are estimates checked by eye (CLAUDE.md section 9); results are labelled "estimado".
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np

NODATA, OTHER, OPEN_WATER, FLOODED_VEG = 255, 0, 1, 2


def classify(
    hh_db: np.ndarray,
    hv_db: np.ndarray,
    open_water_hh_db: float = -18.0,
    open_water_hv_db: float = -24.0,
    flooded_hh_db: float = -4.0,
    flooded_ratio_db: float = 10.0,
) -> np.ndarray:
    """uint8 classes: OTHER, OPEN_WATER, FLOODED_VEG, or NODATA where HH or HV is missing."""
    hh, hv = np.asarray(hh_db), np.asarray(hv_db)
    out = np.full(hh.shape, OTHER, dtype=np.uint8)
    valid = np.isfinite(hh) & np.isfinite(hv)
    out[valid & (hh < open_water_hh_db) & (hv < open_water_hv_db)] = OPEN_WATER
    out[valid & (hh > flooded_hh_db) & ((hh - hv) > flooded_ratio_db)] = FLOODED_VEG
    out[~valid] = NODATA
    return out


def pixel_area_ha(bbox: Sequence[float], shape: tuple[int, int]) -> np.ndarray:
    """Area (ha) of each row's pixels on a north-up EPSG:4326 grid covering bbox; shape (rows, 1)."""
    lon_min, lat_min, lon_max, lat_max = bbox
    rows, cols = shape
    dlon, dlat = (lon_max - lon_min) / cols, (lat_max - lat_min) / rows
    lat = lat_max - (np.arange(rows) + 0.5) * dlat
    return ((dlon * 111320 * np.cos(np.radians(lat))) * (dlat * 110574) / 1e4)[:, None]


def class_areas_ha(classes: np.ndarray, area_ha: np.ndarray) -> dict[str, float]:
    a = np.broadcast_to(area_ha, classes.shape)
    return {
        "open_water_ha": round(float(a[classes == OPEN_WATER].sum()), 1),
        "flooded_veg_ha": round(float(a[classes == FLOODED_VEG].sum()), 1),
    }


def bad_dates(levels: Sequence[float], max_dev_db: float) -> list[int]:
    """Indexes of dates whose reference level is more than max_dev_db from the median of all dates.

    A whole-scene jump of several dB is a calibration or product problem, not a change on the ground.
    """
    lv = np.asarray(levels, dtype=float)
    med = np.nanmedian(lv)
    return [int(i) for i in np.flatnonzero(~np.isfinite(lv) | (np.abs(lv - med) > max_dev_db))]


def class_rgba(classes: np.ndarray) -> np.ndarray:
    """Transparent background, blue open water, green flooded vegetation."""
    rgba = np.zeros((*classes.shape, 4), dtype=np.uint8)
    rgba[classes == OPEN_WATER] = (30, 110, 255, 230)
    rgba[classes == FLOODED_VEG] = (0, 200, 120, 210)
    return rgba

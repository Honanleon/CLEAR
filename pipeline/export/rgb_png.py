# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Per-date RGB composite (R = HH, G = HV, B = HH/HV) reprojected to EPSG:4326 as WebP.

All dates share one stretch (fixed dB limits per channel), so the time-lapse does not flicker.
"""

from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np

from pipeline.process.calibrate import boxcar_mean, to_db

CHANNELS = ("hh_db", "hv_db", "ratio_db")


@dataclass(frozen=True)
class Stretch:
    """dB limits per channel, mapped to 0..255."""

    hh_db: tuple[float, float]
    hv_db: tuple[float, float]
    ratio_db: tuple[float, float]


def grid_4326(bbox: Sequence[float], res_deg: float) -> tuple[int, int]:
    """(width, height) of a north-up EPSG:4326 grid covering `bbox` at `res_deg`."""
    lon_min, lat_min, lon_max, lat_max = bbox
    return round((lon_max - lon_min) / res_deg), round((lat_max - lat_min) / res_deg)


def channels_db(hh: np.ndarray, hv: np.ndarray) -> dict[str, np.ndarray]:
    """HH, HV and HH/HV in dB from linear gamma0 (already filtered and resampled)."""
    hh_db, hv_db = to_db(hh), to_db(hv)
    return {"hh_db": hh_db, "hv_db": hv_db, "ratio_db": hh_db - hv_db}


def fit_stretch(samples: Mapping[str, np.ndarray], low: float = 2.0, high: float = 98.0) -> Stretch:
    """Percentile limits per channel over the pooled samples of all dates."""
    lim = {}
    for c in CHANNELS:
        v = samples[c][np.isfinite(samples[c])]
        if v.size == 0:
            raise ValueError(f"no valid samples for {c}")
        lo, hi = np.percentile(v, [low, high])
        lim[c] = (round(float(lo), 2), round(float(hi), 2))
    return Stretch(**lim)


def to_rgba(ch: Mapping[str, np.ndarray], stretch: Stretch) -> np.ndarray:
    """uint8 RGBA image; alpha 0 where any channel is NaN."""
    shape = ch["hh_db"].shape
    rgba = np.zeros((*shape, 4), dtype=np.uint8)
    valid = np.ones(shape, dtype=bool)
    for i, c in enumerate(CHANNELS):
        lo, hi = getattr(stretch, c)
        v = ch[c]
        valid &= np.isfinite(v)
        scaled = np.clip((np.nan_to_num(v, nan=lo) - lo) / (hi - lo), 0.0, 1.0)
        rgba[..., i] = np.round(scaled * 255).astype(np.uint8)
    rgba[..., 3] = np.where(valid, 255, 0)
    rgba[~valid, :3] = 0
    return rgba


def resample_to_grid(
    tif: Path, bbox: Sequence[float], width: int, height: int, speckle_window: int
) -> dict[str, np.ndarray]:
    """Read a crop, filter speckle on linear gamma0 and average it onto a width x height EPSG:4326 grid.

    The grid is north-up and covers `bbox` exactly (row 0 = north edge).
    Returns linear gamma0 arrays {"HHHH": ..., "HVHV": ...}.
    """
    import rasterio
    from rasterio.transform import from_bounds
    from rasterio.warp import Resampling, reproject

    dst_transform = from_bounds(*bbox, width, height)
    out: dict[str, np.ndarray] = {}
    with rasterio.open(tif) as src:
        for i, name in enumerate(src.descriptions, start=1):
            filtered = boxcar_mean(src.read(i), speckle_window)
            dst = np.full((height, width), np.nan, dtype=np.float32)
            reproject(
                filtered,
                dst,
                src_transform=src.transform,
                src_crs=src.crs,
                src_nodata=np.nan,
                dst_transform=dst_transform,
                dst_crs="EPSG:4326",
                dst_nodata=np.nan,
                resampling=Resampling.average,
            )
            out[name] = dst
    return out


def load_resampled(tif: Path, bbox: Sequence[float], res_deg: float, speckle_window: int) -> dict[str, np.ndarray]:
    """`resample_to_grid` at `res_deg` resolution (the RGB grid)."""
    return resample_to_grid(tif, bbox, *grid_4326(bbox, res_deg), speckle_window)


def write_webp(rgba: np.ndarray, path: Path, quality: int = 80) -> None:
    """Lossy WebP (~250 KB for 1200 x 800). Alpha is kept only if some pixel is transparent."""
    from PIL import Image

    path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.fromarray(rgba)
    if rgba[..., 3].min() == 255:
        img = img.convert("RGB")
    img.save(path, "WEBP", quality=quality, method=6)


def save_stretch(stretch: Stretch, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(asdict(stretch), indent=2) + "\n")

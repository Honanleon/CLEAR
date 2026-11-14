# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Forest mask from ESA WorldCover 2021 v200 (10 m, CC-BY 4.0), read from the public COGs on AWS.

Interim mask: CLAUDE.md asks for MapBiomas Paraguay 2023, which has no simple direct download.
`forest_mask` is the only entry point, so it can be swapped for MapBiomas without touching the rest.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from affine import Affine

URL = "https://esa-worldcover.s3.eu-central-1.amazonaws.com/v200/2021/map/ESA_WorldCover_10m_2021_v200_{}_Map.tif"
TREE_COVER = 10  # WorldCover class "Tree cover"
SOURCE = "ESA WorldCover 2021 v200 (tree cover), CC-BY 4.0"
# Without timeouts GDAL can wait forever on a stalled HTTP connection (seen on 2026-11-14).
GDAL_HTTP = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_TIMEOUT": "60",
    "GDAL_HTTP_CONNECTTIMEOUT": "20",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "5",
}


def tile_names(bbox: Sequence[float]) -> list[str]:
    """3x3 degree WorldCover tiles covering bbox. A tile is named by its south-west corner, e.g. S24W063."""
    lon_min, lat_min, lon_max, lat_max = bbox
    names = []
    for lat0 in range(math.floor(lat_min / 3) * 3, math.ceil(lat_max / 3) * 3, 3):
        for lon0 in range(math.floor(lon_min / 3) * 3, math.ceil(lon_max / 3) * 3, 3):
            ns = f"{'S' if lat0 < 0 else 'N'}{abs(lat0):02d}"
            ew = f"{'W' if lon0 < 0 else 'E'}{abs(lon0):03d}"
            names.append(ns + ew)
    return names


def forest_mask(bbox: Sequence[float], dst_transform: Affine, dst_shape: tuple[int, int], dst_crs: str) -> np.ndarray:
    """Boolean forest mask on the destination grid: tree-cover fraction >= 0.5 within each pixel."""
    import rasterio
    from rasterio.warp import Resampling, reproject
    from rasterio.windows import from_bounds

    frac = np.zeros(dst_shape, dtype=np.float32)
    with rasterio.Env(**GDAL_HTTP):
        for name in tile_names(bbox):
            with rasterio.open(URL.format(name)) as src:
                lon_min, lat_min, lon_max, lat_max = bbox
                pad = 0.01  # degrees, so the reprojected edges are covered
                win = from_bounds(lon_min - pad, lat_min - pad, lon_max + pad, lat_max + pad, src.transform)
                win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                cls = src.read(1, window=win)
                tree = (cls == TREE_COVER).astype(np.float32)
                tmp = np.full(dst_shape, np.nan, dtype=np.float32)
                reproject(
                    tree,
                    tmp,
                    src_transform=src.window_transform(win),
                    src_crs=src.crs,
                    dst_transform=dst_transform,
                    dst_crs=dst_crs,
                    dst_nodata=np.nan,
                    resampling=Resampling.average,
                )
                ok = np.isfinite(tmp)
                frac[ok] = tmp[ok]
    return frac >= 0.5


def cached_forest_mask(
    cache: Path, bbox: Sequence[float], dst_transform: Affine, dst_shape: tuple[int, int], dst_crs: str
) -> np.ndarray:
    """`forest_mask`, stored once as a GeoTIFF in `cache` and reused while the grid stays the same."""
    import rasterio

    if cache.exists():
        with rasterio.open(cache) as src:
            if src.shape == dst_shape and src.transform == dst_transform and src.crs.to_string() == dst_crs:
                return src.read(1).astype(bool)
    mask = forest_mask(bbox, dst_transform, dst_shape, dst_crs)
    cache.parent.mkdir(parents=True, exist_ok=True)
    tmp = cache.with_suffix(".tmp.tif")
    profile = {
        "driver": "GTiff",
        "width": dst_shape[1],
        "height": dst_shape[0],
        "count": 1,
        "dtype": "uint8",
        "crs": dst_crs,
        "transform": dst_transform,
        "compress": "deflate",
    }
    with rasterio.open(tmp, "w", **profile) as dst:
        dst.write(mask.astype(np.uint8), 1)
        dst.update_tags(source=SOURCE)
    tmp.replace(cache)
    return mask

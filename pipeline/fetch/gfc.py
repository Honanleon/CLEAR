# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Forest mask from the University of Maryland Global Forest Change 2000-2024 (Hansen et al. 2013, v1.12).

US product (UMD, built from USGS/NASA Landsat), CC-BY 4.0, read from the public GeoTIFFs on Google Cloud Storage.
Forest at the end of 2024 = tree canopy cover in 2000 >= `min_treecover` % AND no loss recorded 2001-2024
AND land in the data mask. Forest gain is not used (it is only given for 2000-2012).

Same interface as `worldcover`: `forest_mask` / `cached_forest_mask`, chosen with `detection.forest_mask`
in config.yaml.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from pathlib import Path

import numpy as np
from affine import Affine

VERSION = "GFC-2024-v1.12"
URL = "https://storage.googleapis.com/earthenginepartners-hansen/{v}/Hansen_{v}_{layer}_{tile}.tif"
SOURCE = "UMD Global Forest Change 2000-2024 v1.12 (Hansen et al. 2013): tree cover 2000 minus loss to 2024, CC-BY 4.0"
DEFAULT_MIN_TREECOVER = 30  # %, the Global Forest Watch default canopy threshold
LAND = 1  # datamask: 0 no data, 1 land, 2 permanent water
GDAL_HTTP = {
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "GDAL_HTTP_TIMEOUT": "60",
    "GDAL_HTTP_CONNECTTIMEOUT": "20",
    "GDAL_HTTP_MAX_RETRY": "3",
    "GDAL_HTTP_RETRY_DELAY": "5",
}


def tile_names(bbox: Sequence[float]) -> list[str]:
    """10x10 degree GFC tiles covering bbox. A tile is named by its NORTH-WEST corner, e.g. 20S_070W
    covers 20-30 S and 70-60 W."""
    lon_min, lat_min, lon_max, lat_max = bbox
    names = []
    for lat_top in range(math.ceil(lat_max / 10) * 10, math.floor(lat_min / 10) * 10, -10):
        for lon_left in range(math.floor(lon_min / 10) * 10, math.ceil(lon_max / 10) * 10, 10):
            ns = f"{abs(lat_top):02d}{'S' if lat_top < 0 else 'N'}"
            ew = f"{abs(lon_left):03d}{'W' if lon_left < 0 else 'E'}"
            names.append(f"{ns}_{ew}")
    return names


def forest_2024(treecover: np.ndarray, lossyear: np.ndarray, datamask: np.ndarray, min_treecover: float) -> np.ndarray:
    """Per GFC pixel: canopy >= min_treecover in 2000, never lost 2001-2024, on land."""
    return (treecover >= min_treecover) & (lossyear == 0) & (datamask == LAND)


def forest_mask(
    bbox: Sequence[float],
    dst_transform: Affine,
    dst_shape: tuple[int, int],
    dst_crs: str,
    min_treecover: float = DEFAULT_MIN_TREECOVER,
) -> np.ndarray:
    """Boolean forest mask on the destination grid: forest fraction >= 0.5 within each pixel (as worldcover)."""
    import rasterio
    from rasterio.warp import Resampling, reproject
    from rasterio.windows import from_bounds

    frac = np.zeros(dst_shape, dtype=np.float32)
    lon_min, lat_min, lon_max, lat_max = bbox
    pad = 0.01  # degrees, so the reprojected edges are covered
    with rasterio.Env(**GDAL_HTTP):
        for tile in tile_names(bbox):
            layers = {}
            for layer in ("treecover2000", "lossyear", "datamask"):
                with rasterio.open(URL.format(v=VERSION, layer=layer, tile=tile)) as src:
                    win = from_bounds(lon_min - pad, lat_min - pad, lon_max + pad, lat_max + pad, src.transform)
                    win = win.intersection(rasterio.windows.Window(0, 0, src.width, src.height))
                    layers[layer] = src.read(1, window=win)
                    transform, crs = src.window_transform(win), src.crs
            forest = forest_2024(layers["treecover2000"], layers["lossyear"], layers["datamask"], min_treecover)
            tmp = np.full(dst_shape, np.nan, dtype=np.float32)
            reproject(
                forest.astype(np.float32),
                tmp,
                src_transform=transform,
                src_crs=crs,
                dst_transform=dst_transform,
                dst_crs=dst_crs,
                dst_nodata=np.nan,
                resampling=Resampling.average,
            )
            ok = np.isfinite(tmp)
            frac[ok] = tmp[ok]
    return frac >= 0.5


def cached_forest_mask(
    cache: Path,
    bbox: Sequence[float],
    dst_transform: Affine,
    dst_shape: tuple[int, int],
    dst_crs: str,
    min_treecover: float = DEFAULT_MIN_TREECOVER,
) -> np.ndarray:
    """`forest_mask`, stored once as a GeoTIFF in `cache` and reused while the grid and threshold stay the same."""
    import rasterio

    tag = f"{VERSION} min_treecover={min_treecover}"
    if cache.exists():
        with rasterio.open(cache) as src:
            same_grid = src.shape == dst_shape and src.transform == dst_transform and src.crs.to_string() == dst_crs
            if same_grid and src.tags().get("mask") == tag:
                return src.read(1).astype(bool)
    mask = forest_mask(bbox, dst_transform, dst_shape, dst_crs, min_treecover)
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
        dst.update_tags(source=SOURCE, mask=tag)
    tmp.replace(cache)
    return mask

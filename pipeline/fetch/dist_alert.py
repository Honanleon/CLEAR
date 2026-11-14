# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""OPERA DIST-ALERT-HLS V1 (LP DAAC): latest vegetation-disturbance status and date on a target grid.

Layer meanings were checked in the files' own metadata (2026-11-14):
VEG-DIST-STATUS flag_values 0..8, 255 = no data
  (6 = confirmed >=50% loss, 8 = confirmed >=50% loss, finished);
VEG-DIST-DATE = days since 2020-12-31 of the first disturbance detection (0 = none, -1 = no data).
"""

from __future__ import annotations

import time
from collections.abc import Sequence
from datetime import date

import numpy as np
from affine import Affine

SHORT_NAME = "OPERA_L3_DIST-ALERT-HLS_V1"
REF_DATE = date(2020, 12, 31)
CONFIRMED_GE50 = (6, 8)
SOURCE = "OPERA DIST-ALERT-HLS V1 (NASA JPL, LP DAAC)"


def to_days(d: date) -> int:
    return (d - REF_DATE).days


def latest_granules(bbox: Sequence[float], temporal: tuple[str, str]) -> dict[str, list[str]]:
    """Data links of the most recent granule per MGRS tile intersecting bbox."""
    import earthaccess

    res = earthaccess.search_data(short_name=SHORT_NAME, bounding_box=tuple(bbox), temporal=temporal, count=2000)
    latest: dict[str, tuple[str, list[str]]] = {}
    for g in res:
        ur = g["umm"]["GranuleUR"]
        tile = ur.split("_")[3]
        if tile not in latest or ur > latest[tile][0]:
            latest[tile] = (ur, g.data_links())
    return {t: links for t, (_, links) in latest.items()}


def signed_url(url: str, token: str, attempts: int = 3) -> str:
    """Resolve the LP DAAC redirect with the bearer token (GDAL would forward the token to CloudFront)."""
    import requests

    for k in range(attempts):  # small request: a short bounded retry for transient 5xx
        r = requests.get(
            url, headers={"Authorization": f"Bearer {token}", "Range": "bytes=0-0"}, allow_redirects=False, timeout=60
        )
        if r.status_code in (302, 303, 307):
            return r.headers["Location"]
        time.sleep(3 * (k + 1))
    raise RuntimeError(f"LP DAAC returned {r.status_code} for {url}")


def read_dist(
    bbox: Sequence[float],
    dst_transform: Affine,
    dst_shape: tuple[int, int],
    dst_crs: str,
    token: str,
    temporal: tuple[str, str],
) -> tuple[np.ndarray, np.ndarray, list[str]]:
    """(status uint8, date int16, granule ids) on the destination grid, nearest resampling."""
    import rasterio
    from rasterio.warp import Resampling, reproject

    status = np.full(dst_shape, 255, dtype=np.uint8)
    days = np.full(dst_shape, -1, dtype=np.int16)
    used = []
    from pipeline.fetch.worldcover import GDAL_HTTP

    with rasterio.Env(**GDAL_HTTP):
        for _tile, links in sorted(latest_granules(bbox, temporal).items()):
            lk = {u.rsplit("_", 1)[-1].removesuffix(".tif"): u for u in links}
            used.append(lk["VEG-DIST-STATUS"].rsplit("/", 1)[-1].removesuffix("_VEG-DIST-STATUS.tif"))
            for key, arr, nodata in (("VEG-DIST-STATUS", status, 255), ("VEG-DIST-DATE", days, -1)):
                with rasterio.open(signed_url(lk[key], token)) as src:
                    tmp = np.full(dst_shape, nodata, dtype=arr.dtype)
                    reproject(
                        rasterio.band(src, 1),
                        tmp,
                        dst_transform=dst_transform,
                        dst_crs=dst_crs,
                        dst_nodata=nodata,
                        resampling=Resampling.nearest,
                    )
                    fill = (arr == nodata) & (tmp != nodata)
                    arr[fill] = tmp[fill]
    return status, days, used

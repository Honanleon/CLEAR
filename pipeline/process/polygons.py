# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Group flagged pixels into polygons, one detection date per polygon, and export GeoJSON (EPSG:4326)."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import numpy as np
from affine import Affine
from scipy import ndimage

from pipeline.process.detect import NO_DETECTION


def label_by_date(first: np.ndarray) -> tuple[np.ndarray, list[int]]:
    """Connected components (8-neighbour) of pixels sharing the same detection date.

    Returns a label image (0 = background) and, for each label k (1-based), its date index.
    """
    labels = np.zeros(first.shape, dtype=np.int32)
    date_of: list[int] = []
    for d in np.unique(first[first != NO_DETECTION]):
        lab, n = ndimage.label(first == d, structure=np.ones((3, 3)))
        m = lab > 0
        labels[m] = lab[m] + len(date_of)
        date_of.extend([int(d)] * n)
    return labels, date_of


def polygons(
    first: np.ndarray,
    delta: np.ndarray,
    transform: Affine,
    crs: str,
    dates: Sequence[str],
    min_area_ha: float,
    simplify_m: float = 10.0,
) -> list[dict[str, Any]]:
    """GeoJSON features (EPSG:4326) for components >= min_area_ha, largest first.

    `transform`/`crs` must be a projected grid in metres (areas are computed there).
    """
    from rasterio.features import shapes
    from rasterio.warp import transform_geom
    from shapely.geometry import mapping, shape
    from shapely.ops import unary_union

    px_ha = abs(transform.a * transform.e) / 1e4
    labels, date_of = label_by_date(first)
    if not date_of:
        return []
    idx = np.arange(1, len(date_of) + 1)
    counts = ndimage.sum(np.ones_like(labels), labels, index=idx)
    keep = {int(k) for k, c in zip(idx, counts, strict=True) if c * px_ha >= min_area_ha}
    if not keep:
        return []

    # mean drop at the detection date, per component
    d_at = np.take_along_axis(delta, np.clip(first, 0, None)[None].astype(np.int64), axis=0)[0]
    mean_drop = ndimage.mean(np.nan_to_num(d_at), labels, index=idx)

    parts: dict[int, list] = {}
    masked = np.where(np.isin(labels, list(keep)), labels, 0).astype(np.int32)
    for geom, value in shapes(masked, mask=masked > 0, transform=transform, connectivity=8):
        parts.setdefault(int(value), []).append(shape(geom))

    feats = []
    for k in sorted(keep, key=lambda k: -counts[k - 1]):
        g = unary_union(parts[k]).simplify(simplify_m, preserve_topology=True)
        g4326 = transform_geom(crs, "EPSG:4326", mapping(g), precision=5)
        feats.append(
            {
                "type": "Feature",
                "geometry": g4326,
                "properties": {
                    "first_date": dates[date_of[k - 1]],
                    "area_ha": round(float(counts[k - 1] * px_ha), 1),
                    "mean_drop_db": round(float(mean_drop[k - 1]), 2),
                    "dist_confirmed": None,
                    "status": "estimado",
                },
            }
        )
    for i, f in enumerate(feats, start=1):
        f["properties"] = {"id": f"p{i:04d}", **f["properties"]}
    return feats

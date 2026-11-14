# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Aggregate detected clearing into a regular hexagon grid (pointy-top), so the app never publishes exact shapes.

The exact polygons stay in data/interim/ (not published). Each published hexagon carries the cleared area
inside it, the median detection date, the mean drop and whether optical alerts confirm it.
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

import numpy as np
from affine import Affine

SQRT3 = math.sqrt(3.0)


def radius_for_width(width_m: float) -> float:
    """Circumradius of a pointy-top hexagon whose flat-to-flat width is width_m."""
    return width_m / SQRT3


def axial_round(qf: np.ndarray, rf: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Round fractional axial coordinates to the containing hexagon (cube rounding)."""
    xf, zf = qf, rf
    yf = -xf - zf
    rx, ry, rz = np.round(xf), np.round(yf), np.round(zf)
    dx, dy, dz = np.abs(rx - xf), np.abs(ry - yf), np.abs(rz - zf)
    fix_x = (dx > dy) & (dx > dz)
    fix_z = ~fix_x & (dz >= dy)
    rx = np.where(fix_x, -ry - rz, rx)
    rz = np.where(fix_z, -rx - ry, rz)
    return rx.astype(np.int64), rz.astype(np.int64)


def to_axial(x: np.ndarray, y: np.ndarray, radius: float, origin: tuple[float, float]) -> tuple[np.ndarray, np.ndarray]:
    """Projected coordinates (m) -> axial hex coordinates (q, r) for a pointy-top grid anchored at origin."""
    px, py = (np.asarray(x) - origin[0]) / radius, (np.asarray(y) - origin[1]) / radius
    return axial_round(SQRT3 / 3 * px - py / 3, 2 / 3 * py)


def hex_center(q: int, r: int, radius: float, origin: tuple[float, float]) -> tuple[float, float]:
    return origin[0] + radius * SQRT3 * (q + r / 2), origin[1] + radius * 1.5 * r


def hex_ring(q: int, r: int, radius: float, origin: tuple[float, float]) -> list[tuple[float, float]]:
    """Closed ring of the hexagon's 6 corners (pointy-top), in projected coordinates."""
    cx, cy = hex_center(q, r, radius, origin)
    pts = [
        (cx + radius * math.cos(math.radians(30 + 60 * k)), cy + radius * math.sin(math.radians(30 + 60 * k)))
        for k in range(6)
    ]
    return pts + [pts[0]]


def aggregate(
    flagged: np.ndarray,
    first: np.ndarray,
    delta_at: np.ndarray,
    alert: np.ndarray | None,
    transform: Affine,
    crs: str,
    dates: Sequence[str],
    width_m: float,
    origin: tuple[float, float],
    confirmed_frac: float = 0.2,
) -> list[dict[str, Any]]:
    """GeoJSON hexagon features (EPSG:4326) for every hexagon with cleared pixels, largest area first."""
    from rasterio.warp import transform_geom

    rows, cols = np.nonzero(flagged)
    if rows.size == 0:
        return []
    radius = radius_for_width(width_m)
    x = transform.c + (cols + 0.5) * transform.a
    y = transform.f + (rows + 0.5) * transform.e
    q, r = to_axial(x, y, radius, origin)
    keys = q * 1_000_003 + r
    px_ha = abs(transform.a * transform.e) / 1e4
    feats = []
    for k in np.unique(keys):
        m = keys == k
        qq, rr = int(q[m][0]), int(r[m][0])
        ring = hex_ring(qq, rr, radius, origin)
        geom = transform_geom(crs, "EPSG:4326", {"type": "Polygon", "coordinates": [ring]}, precision=5)
        conf = None if alert is None else bool(alert[rows[m], cols[m]].mean() >= confirmed_frac)
        feats.append(
            {
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "first_date": dates[int(np.floor(np.median(first[rows[m], cols[m]])))],
                    "area_ha": round(float(m.sum() * px_ha), 1),
                    "mean_drop_db": round(float(np.nanmean(delta_at[rows[m], cols[m]])), 2),
                    "dist_confirmed": conf,
                    "status": "estimado",
                },
            }
        )
    feats.sort(key=lambda f: -f["properties"]["area_ha"])
    for i, f in enumerate(feats, start=1):
        f["properties"] = {"id": f"h{i:04d}", **f["properties"]}
    return feats

# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
import math

import numpy as np
from affine import Affine

from pipeline.export.hexes import aggregate, hex_center, hex_ring, radius_for_width, to_axial

ORIGIN = (600000.0, 7700000.0)


def test_points_go_to_nearest_hex_center():
    rng = np.random.default_rng(1)
    R = radius_for_width(1000)
    x = ORIGIN[0] + rng.uniform(-5000, 5000, 2000)
    y = ORIGIN[1] + rng.uniform(-5000, 5000, 2000)
    q, r = to_axial(x, y, R, ORIGIN)
    cx = np.array([hex_center(a, b, R, ORIGIN)[0] for a, b in zip(q, r, strict=True)])
    cy = np.array([hex_center(a, b, R, ORIGIN)[1] for a, b in zip(q, r, strict=True)])
    d = np.hypot(x - cx, y - cy)
    assert d.max() <= R + 1e-6  # every point lies within its hexagon's circumradius
    for dq, dr in ((1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)):  # and no neighbour is closer
        nx = np.array([hex_center(a + dq, b + dr, R, ORIGIN)[0] for a, b in zip(q, r, strict=True)])
        ny = np.array([hex_center(a + dq, b + dr, R, ORIGIN)[1] for a, b in zip(q, r, strict=True)])
        assert np.all(np.hypot(x - nx, y - ny) >= d - 1e-6)


def test_hex_area_and_width():
    R = radius_for_width(1000)
    ring = hex_ring(0, 0, R, ORIGIN)
    xs, ys = zip(*ring, strict=True)
    area = 0.5 * abs(sum(xs[i] * ys[i + 1] - xs[i + 1] * ys[i] for i in range(6)))
    assert math.isclose(area / 1e4, 3 * math.sqrt(3) / 2 * R * R / 1e4, rel_tol=1e-9)
    assert math.isclose(max(xs) - min(xs), 1000, rel_tol=1e-9)  # flat-to-flat width (pointy-top)


def test_aggregate_hides_shape_and_keeps_totals():
    t = Affine(20, 0, ORIGIN[0], 0, -20, ORIGIN[1])
    flagged = np.zeros((100, 100), bool)
    flagged[10:40, 10:40] = True  # 900 px = 36 ha
    first = np.full((100, 100), 4, np.int16)
    delta = np.full((100, 100), -4.0, np.float32)
    alert = np.zeros((100, 100), bool)
    alert[10:40, 10:25] = True
    dates = [f"2026-0{m}-01" for m in range(1, 8)]
    feats = aggregate(flagged, first, delta, alert, t, "EPSG:32720", dates, 1000, ORIGIN)
    assert abs(sum(f["properties"]["area_ha"] for f in feats) - 36.0) <= 0.05 * len(feats)  # per-hex rounding to 0.1 ha
    assert all(len(f["geometry"]["coordinates"][0]) == 7 for f in feats)  # hexagons, not the block's shape
    p = feats[0]["properties"]
    assert (
        p["id"] == "h0001"
        and p["first_date"] == "2026-05-01"
        and p["prev_date"] == "2026-04-01"
        and p["mean_drop_db"] == -4.0
        and p["status"] == "estimado"
    )
    assert (
        aggregate(np.zeros((5, 5), bool), first[:5, :5], delta[:5, :5], None, t, "EPSG:32720", dates, 1000, ORIGIN)
        == []
    )

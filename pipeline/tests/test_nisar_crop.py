# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Tests for the AOI window, transform and gamma0 cleaning (synthetic grids, no network)."""

import numpy as np
import pytest

from pipeline.fetch.nisar import Window, aoi_window, bbox_to_projected, clean_gamma0, window_transform

# Synthetic 20 m grid: pixel centers, x ascending, y descending (as in GCOV)
X = 1000.0 + 20.0 * np.arange(100)  # 1000 .. 2980
Y = 5000.0 - 20.0 * np.arange(50)  # 5000 .. 4020


def test_window_selects_pixel_centers_inside_bounds():
    w = aoi_window(X, Y, (1100.0, 4500.0, 1300.0, 4900.0))
    assert w == Window(row0=5, row1=26, col0=5, col1=16)
    assert X[w.col0] == 1100.0 and X[w.col1 - 1] == 1300.0
    assert Y[w.row0] == 4900.0 and Y[w.row1 - 1] == 4500.0
    assert w.shape == (21, 11)


def test_window_outside_grid_raises():
    with pytest.raises(ValueError):
        aoi_window(X, Y, (5000.0, 0.0, 6000.0, 100.0))


def test_window_partly_outside_is_clipped():
    w = aoi_window(X, Y, (0.0, 4900.0, 1040.0, 9999.0))
    assert w == Window(row0=0, row1=6, col0=0, col1=3)


def test_transform_maps_pixel_corner_and_center():
    w = Window(5, 26, 5, 16)
    t = window_transform(X, Y, w)
    assert t @ (0, 0) == (1090.0, 4910.0)  # top-left corner of the first pixel
    assert t @ (0.5, 0.5) == (X[5], Y[5])  # its center
    assert t.a == 20.0 and t.e == -20.0


def test_clean_gamma0_sets_invalid_to_nan():
    a = np.array([[0.0, -1.0, np.inf], [np.nan, 0.05, 1e-6]], dtype=np.float64)
    out = clean_gamma0(a)
    assert out.dtype == np.float32
    assert np.isnan(out[0]).all() and np.isnan(out[1, 0])
    assert out[1, 1] == np.float32(0.05) and out[1, 2] == np.float32(1e-6)
    assert a[0, 0] == 0.0  # input untouched


def test_bbox_to_projected_utm20s():
    # Central meridian of UTM 20S at the equator: easting 500000, northing 10000000
    xmin, ymin, xmax, ymax = bbox_to_projected((-63.0, 0.0, -63.0, 0.0), 32720)
    assert xmin == pytest.approx(500000.0) and ymin == pytest.approx(10000000.0)
    # The chapter 1 AOI lies inside the frame-167 grid seen in the product (x 492490..822230, y 7512490..7832150)
    xmin, ymin, xmax, ymax = bbox_to_projected((-61.0, -21.95, -60.4, -21.55), 32720)
    assert 492490 < xmin < xmax < 822230 and 7512490 < ymin < ymax < 7832150

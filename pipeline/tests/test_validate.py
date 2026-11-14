# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
from datetime import date

import numpy as np

from pipeline.fetch.dist_alert import to_days
from pipeline.process.detect import NO_DETECTION
from pipeline.validate.dist_compare import alert_mask, compare, drop_small, polygon_confirmed


def test_to_days_reference():
    assert to_days(date(2026, 11, 4)) == 2134  # Valid_max seen in the 2026-11-04 product


def test_alert_mask_status_and_dates():
    status = np.array([[6, 8, 3, 6]])
    days = np.array([[100, 150, 120, 400]])
    assert alert_mask(status, days, 90, 200, (6, 8)).tolist() == [[True, True, False, False]]


def test_drop_small_patches():
    m = np.zeros((10, 10), bool)
    m[0:5, 0:5] = True  # 25 px
    m[8, 8] = True  # 1 px
    out = drop_small(m, px_ha=0.04, min_area_ha=0.5)  # 0.5 ha = 12.5 px
    assert out.sum() == 25 and not out[8, 8]


def test_compare_spatial_temporal_and_lag():
    radar_days = [0, 12, 24, 36, 48]
    first = np.full((1, 4), NO_DETECTION, np.int16)
    first[0, :3] = [3, 3, 1]  # radar flags 3 px: day 36, 36, 12
    alert = np.array([[True, True, False, True]])  # optical on px 0, 1, 3
    alert_days = np.array([[40, 100, 0, 50]])
    r = compare(first, radar_days, alert, alert_days, tol_days=24)
    assert r["agreement_pct"] == round(200 / 3, 1)  # px 0, 1 of 3 flagged
    assert r["agreement_pct_tol"] == round(100 / 3, 1)  # only px 0 within 24 d
    assert r["coverage_pct"] == round(200 / 3, 1)  # 2 of 3 optical px
    assert r["median_lag_days"] == (-4 + -64) // 2  # radar earlier: negative


def test_polygon_confirmed_fraction():
    labels = np.array([[1, 1, 1, 1, 2, 2]])
    alert = np.array([[True, False, False, False, False, False]])
    assert polygon_confirmed(labels, alert, 2, 0.2) == [True, False]

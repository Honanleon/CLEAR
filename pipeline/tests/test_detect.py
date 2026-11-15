# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Detection tests on small synthetic rasters (no network)."""

import numpy as np
import pytest
from affine import Affine

from pipeline.fetch.worldcover import tile_names
from pipeline.process.detect import NO_DETECTION, baseline, first_detection, sanity_checks
from pipeline.process.normalize import forest_medians, normalize
from pipeline.process.polygons import label_components, polygons

DATES = [f"2026-{m:02d}-01" for m in range(1, 8)]  # 7 dates


def test_worldcover_tiles_for_aoi():
    assert tile_names([-60.78, -21.73, -60.18, -21.33]) == ["S24W063"]
    assert tile_names([-60.5, -21.5, -59.5, -20.5]) == [
        "S24W063",
        "S24W060",
        "S21W063",
        "S21W060",
    ]  # crosses -60 and -21


def test_normalize_removes_per_date_offset():
    stack = np.zeros((3, 4, 4), np.float32) - 12.0
    stack[1] += 1.5  # wet date: everything brighter
    forest = np.ones((4, 4), bool)
    med = forest_medians(stack, forest)
    assert med.tolist() == pytest.approx([-12.0, -10.5, -12.0])
    assert np.allclose(normalize(stack, med), 0.0)


def test_forest_medians_use_only_forest():
    stack = np.zeros((1, 2, 2), np.float32)
    stack[0] = [[-10, -10], [-20, -20]]
    forest = np.array([[True, True], [False, False]])
    assert forest_medians(stack, forest)[0] == -10


def test_first_detection_needs_persistence_and_skips_baseline():
    # one pixel per scenario, 7 dates, baseline = first 3
    delta = np.zeros((7, 1, 4), np.float32)
    delta[3:, 0, 0] = -4  # sustained drop from date 3
    delta[4, 0, 1] = -4  # single-date drop: not flagged
    delta[5:, 0, 2] = -2.5  # drop above threshold: not flagged
    delta[1:3, 0, 3] = -4  # drop inside the baseline only
    first = first_detection(delta, threshold_db=-3.0, persistence=2, start=3)
    assert first[0].tolist() == [3, NO_DETECTION, NO_DETECTION, NO_DETECTION]


def test_first_detection_last_date_cannot_start_a_run():
    delta = np.zeros((7, 1, 1), np.float32)
    delta[6] = -5
    assert first_detection(delta, -3.0, 2, 3)[0, 0] == NO_DETECTION


def test_nan_is_never_a_drop():
    delta = np.full((7, 1, 1), np.nan, np.float32)
    assert first_detection(delta, -3.0, 2, 3)[0, 0] == NO_DETECTION


def test_baseline_is_median_of_first_dates():
    stack = np.array([[[1.0]], [[3.0]], [[2.0]], [[-9.0]]], np.float32)
    assert baseline(stack, 3)[0, 0] == 2.0


def test_sanity_flags_median_jump_and_mass_detection():
    first = np.full((10, 10), NO_DETECTION, np.int16)
    first[:2, :] = 4  # 20% of the forest on one date
    forest = np.ones((10, 10), bool)
    med = np.array([-12, -12, -12, -12, -9.5, -12, -12], np.float32)
    r = sanity_checks(DATES, med, first, forest)
    assert len(r.problems) == 2
    assert r.jump_dates == ("2026-04-01", "2026-05-01")
    assert r.max_flagged_date == "2026-05-01" and r.max_flagged_pct == 20.0
    ok = sanity_checks(DATES, np.full(7, -12, np.float32), np.full((10, 10), NO_DETECTION, np.int16), forest)
    assert ok.problems == ()


def test_label_components_merges_touching_dates_and_uses_median():
    first = np.full((4, 7), NO_DETECTION, np.int16)
    first[:, 0:3] = 3  # 12 px on date 3
    first[:, 3:5] = 4  # 8 px on date 4, touching
    first[0, 6] = 9  # separate pixel
    labels, date_of = label_components(first)
    assert len(date_of) == 2
    assert date_of[labels[0, 0] - 1] == 3  # median of 12 x 3 and 8 x 4
    assert labels[0, 0] == labels[0, 4] != labels[0, 6]


def test_polygons_filter_by_area_and_carry_properties():
    # 20 m pixels in a UTM 20S grid: 0.04 ha per pixel; 5 ha = 125 pixels
    t = Affine(20, 0, 600000, 0, -20, 7600000)
    first = np.full((40, 40), NO_DETECTION, np.int16)
    first[0:15, 0:15] = 3  # 225 px = 9 ha -> kept
    first[30:35, 30:35] = 5  # 25 px = 1 ha -> dropped
    delta = np.zeros((7, 40, 40), np.float32)
    delta[3, 0:15, 0:15] = -4.0
    feats = polygons(first, delta, t, "EPSG:32720", DATES, min_area_ha=5)
    assert len(feats) == 1
    p = feats[0]["properties"]
    assert p == {
        "id": "p0001",
        "first_date": "2026-04-01",
        "prev_date": "2026-03-01",
        "area_ha": 9.0,
        "mean_drop_db": -4.0,
        "dist_confirmed": None,
        "status": "estimado",
    }
    assert feats[0]["geometry"]["type"] == "Polygon"
    lon, lat = feats[0]["geometry"]["coordinates"][0][0]
    assert -62.2 < lon < -61.9 and -21.8 < lat < -21.6  # easting 600 km in UTM 20S: western Chaco


def test_two_of_three_tolerates_one_bounce():
    delta = np.zeros((8, 1, 3), np.float32)
    delta[[3, 5, 6], 0, 0] = -4  # drop, bounce at 4 (wet date), drop again
    delta[[3, 6], 0, 1] = -4  # two drops but 3 dates apart: not 2 of 3
    delta[4, 0, 2] = -4  # bounce first: the run must start with a drop
    delta[[5], 0, 2] = -4
    consecutive = first_detection(delta, -3.0, 2, 3)
    two_of_three = first_detection(delta, -3.0, 2, 3, window=3)
    assert consecutive[0].tolist() == [5, NO_DETECTION, 4]
    assert two_of_three[0].tolist() == [3, NO_DETECTION, 4]

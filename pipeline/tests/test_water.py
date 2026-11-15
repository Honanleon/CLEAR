# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
import numpy as np

from pipeline.process.water import (
    FLOODED_VEG,
    NODATA,
    OPEN_WATER,
    OTHER,
    bad_dates,
    class_areas_ha,
    class_rgba,
    classify,
    pixel_area_ha,
)


def test_classify_open_water_flooded_and_other():
    hh = np.array([-22.0, -2.0, -8.0, -2.0, np.nan])
    hv = np.array([-28.0, -14.0, -16.0, -9.0, -20.0])
    assert classify(hh, hv).tolist() == [OPEN_WATER, FLOODED_VEG, OTHER, OTHER, NODATA]  # 4th: ratio only 7 dB


def test_bad_dates_flags_whole_scene_jumps():
    levels = [-13.9, -14.1, -35.5, -13.5, -4.9, -14.0, np.nan]
    assert bad_dates(levels, 4.0) == [2, 4, 6]


def test_areas_and_pixel_size():
    area = pixel_area_ha([-58.0, -27.0, -57.0, -26.0], (10, 10))
    assert (
        area.shape == (10, 1) and 10900 < area[5, 0] < 11100
    )  # 0.1 x 0.1 deg near 26.5 S: 9.96 km x 11.06 km ~ 1.10e4 ha
    cls = np.full((10, 10), OTHER, np.uint8)
    cls[0, :2] = OPEN_WATER
    cls[9, 0] = FLOODED_VEG
    a = class_areas_ha(cls, area)
    assert abs(a["open_water_ha"] - 2 * area[0, 0]) < 0.1 and abs(a["flooded_veg_ha"] - area[9, 0]) < 0.1


def test_rgba_is_transparent_except_water():
    rgba = class_rgba(np.array([[OTHER, OPEN_WATER, FLOODED_VEG, NODATA]], np.uint8))
    assert rgba[0, 0, 3] == 0 and rgba[0, 3, 3] == 0 and rgba[0, 1, 3] > 0 and rgba[0, 2, 3] > 0

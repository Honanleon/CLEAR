# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
import numpy as np
import pytest

from pipeline.fetch.gfc import forest_2024, tile_names
from pipeline.run import forest_mask_for


def test_tile_names_use_the_north_west_corner():
    # boqueron-norte and mbaracayu: both inside 20-30 S
    assert tile_names([-61.6, -20.9, -61.0, -20.5]) == ["20S_070W"]
    assert tile_names([-55.7, -24.4, -55.2, -24.0]) == ["20S_060W"]


def test_tile_names_across_a_tile_edge():
    assert tile_names([-60.5, -20.5, -59.5, -19.5]) == ["10S_070W", "10S_060W", "20S_070W", "20S_060W"]


def test_forest_2024_needs_canopy_no_loss_and_land():
    tc = np.array([80, 80, 80, 10, 80], dtype=np.uint8)
    loss = np.array([0, 18, 0, 0, 0], dtype=np.uint8)  # 18 = loss in 2018
    land = np.array([1, 1, 2, 1, 1], dtype=np.uint8)  # 2 = permanent water
    assert forest_2024(tc, loss, land, 30).tolist() == [True, False, False, False, True]


def test_forest_mask_for_rejects_unknown_source(tmp_path):
    with pytest.raises(ValueError, match="worldcover' or 'gfc"):
        forest_mask_for({"forest_mask": "mapbiomas"}, tmp_path, "", [0, 0, 1, 1], None, (1, 1), "EPSG:4326")

# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np

from pipeline.export.rgb_png import Stretch, channels_db, fit_stretch, grid_4326, to_rgba, write_webp
from pipeline.export.to_json import build_grid, build_index, db_x10, image_coordinates

BBOX = [-61.0, -21.95, -60.4, -21.55]


def test_grid_4326_size():
    assert grid_4326(BBOX, 0.0005) == (1200, 800)


def test_channels_ratio_is_hh_minus_hv_in_db():
    ch = channels_db(np.array([0.1]), np.array([0.01]))
    assert np.isclose(ch["hh_db"][0], -10) and np.isclose(ch["hv_db"][0], -20) and np.isclose(ch["ratio_db"][0], 10)


def test_fit_stretch_percentiles_ignore_nan():
    v = np.append(np.arange(101, dtype=np.float32), np.nan)
    s = fit_stretch({"hh_db": v, "hv_db": v, "ratio_db": v}, 2, 98)
    assert s.hh_db == (2.0, 98.0)


def test_to_rgba_scales_clips_and_masks():
    st = Stretch(hh_db=(-20, -10), hv_db=(-25, -15), ratio_db=(0, 10))
    ch = {
        "hh_db": np.array([[-20.0, -15.0, -5.0]]),
        "hv_db": np.array([[-25.0, -20.0, np.nan]]),
        "ratio_db": np.array([[0.0, 5.0, 10.0]]),
    }
    rgba = to_rgba(ch, st)
    assert rgba[0, 0].tolist() == [0, 0, 0, 255]
    assert rgba[0, 1].tolist() == [128, 128, 128, 255]
    assert rgba[0, 2].tolist() == [0, 0, 0, 0]  # NaN in one channel -> transparent


def test_index_follows_contract():
    nisar_cfg = {"relative_orbit": 161, "flight_direction": "ASCENDING", "frame": 167}
    det = {"threshold_db": -3.0, "persistence": 2, "min_area_ha": 5}
    scenes = [
        {
            "date": "2026-06-13",
            "granule_id": "B",
            "maturity": "PROVISIONAL",
            "crid": "P05023",
            "rgb": "rgb/2026-06-13.webp",
        },
        {
            "date": "2026-06-01",
            "granule_id": "A",
            "maturity": "PROVISIONAL",
            "crid": "P05023",
            "rgb": "rgb/2026-06-01.webp",
        },
    ]
    when = datetime(2026, 11, 14, 18, 0, tzinfo=ZoneInfo("America/Asuncion"))
    idx = build_index("chaco-central-norte", BBOX, nisar_cfg, scenes, det, when)
    assert idx["schema_version"] == 1
    assert idx["generated_at"] == "2026-11-14T18:00:00-03:00"
    assert [s["date"] for s in idx["scenes"]] == ["2026-06-01", "2026-06-13"]
    assert set(idx["scenes"][0]) == {"date", "id", "maturity", "crid", "rgb"}
    assert idx["image_coordinates"] == [[-61.0, -21.55], [-60.4, -21.55], [-60.4, -21.95], [-61.0, -21.95]]
    assert image_coordinates(BBOX)[0] == [-61.0, -21.55]
    assert idx["validation"]["agreement_pct"] is None
    assert idx["provenance"][0]["type"] == "satellite"


def test_write_webp_roundtrip(tmp_path):
    from PIL import Image

    rgba = np.zeros((8, 12, 4), dtype=np.uint8)
    rgba[..., 1] = 200
    rgba[..., 3] = 255
    out = tmp_path / "rgb" / "x.webp"
    write_webp(rgba, out)
    with Image.open(out) as im:
        assert im.format == "WEBP" and im.size == (12, 8) and im.mode == "RGB"


def test_db_x10_rounds_and_nulls():
    assert db_x10(np.array([[0.1, 0.01], [np.nan, 0.0]])) == [-100, -200, None, None]


def test_grid_layout_follows_contract():
    hv = [np.full((89, 125), 0.05), np.full((89, 125), 0.02)]
    hh = [np.full((89, 125), 0.1), np.full((89, 125), 0.1)]
    hv[0][0, 1] = np.nan
    g = build_grid(BBOX, ["2026-06-01", "2026-06-13"], hv, hh)
    assert g["origin"] == [-61.0, -21.55]
    assert g["nx"] == 125 and g["ny"] == 89
    assert g["cell_deg"][0] == 0.0048 and round(g["cell_deg"][1], 4) == -0.0045
    assert len(g["hv_db_x10"]) == 2 and len(g["hv_db_x10"][0]) == 125 * 89
    assert g["hv_db_x10"][0][0] == -130 and g["hv_db_x10"][0][1] is None
    assert g["hv_db_x10"][1][0] == -170 and g["hh_db_x10"][0][0] == -100

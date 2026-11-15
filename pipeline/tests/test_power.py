# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
from pipeline.fetch.power import center, parse


def test_center_of_bbox():
    assert center([-61.6, -20.9, -61.0, -20.5]) == [-61.3, -20.7]


def test_parse_sorts_dates_and_nulls_fill_values():
    payload = {"properties": {"parameter": {"PRECTOTCORR": {"20260102": 3.456, "20260101": -999.0, "20260103": 0.0}}}}
    out = parse(payload, [-61.3, -20.7])
    assert out == {
        "dates": ["2026-01-01", "2026-01-02", "2026-01-03"],
        "mm": [None, 3.5, 0.0],
        "source": "NASA POWER PRECTOTCORR",
        "point": [-61.3, -20.7],
    }

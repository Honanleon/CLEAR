# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Tests for NISAR granule name parsing and one-per-date selection (no network)."""

from datetime import date, datetime

import pytest

from pipeline.fetch.nisar import (
    compare_dates,
    h5_url,
    matches_frame,
    maturity_for,
    parse_granule_name,
    pick_one_per_date,
)

EXAMPLE = "NISAR_L2_PR_GCOV_032_161_A_167_2005_DHDH_A_20261011T095756_20261011T095834_P05023_N_F_J_001"
CRIDS = {"P05023": "PROVISIONAL", "P05036": "VALIDATED"}


def name(day: str, cycle: int = 21, frame: int = 167, crid: str = "P05023", version: int = 1) -> str:
    """Build a granule name for the date `day` (YYYYMMDD)."""
    return (
        f"NISAR_L2_PR_GCOV_{cycle:03d}_161_A_{frame:03d}_2005_DHDH_A_"
        f"{day}T095756_{day}T095834_{crid}_N_F_J_{version:03d}"
    )


def test_parse_example_name():
    g = parse_granule_name(EXAMPLE)
    assert g.cycle == 32
    assert g.track == 161
    assert g.direction == "A"
    assert g.frame == 167
    assert g.polarizations == "DHDH"
    assert g.start == datetime(2026, 10, 11, 9, 57, 56)
    assert g.date == date(2026, 10, 11)
    assert g.crid == "P05023"
    assert g.crid_number == 5023
    assert g.version == 1


def test_parse_accepts_file_name_with_extension():
    assert parse_granule_name(f"https://example.org/x/{EXAMPLE}.h5").granule_id == EXAMPLE


def test_parse_rejects_other_products():
    with pytest.raises(ValueError):
        parse_granule_name(EXAMPLE.replace("GCOV", "GSLC"))


def test_matches_frame_rejects_neighbouring_frame():
    assert matches_frame(parse_granule_name(name("20261104", frame=167)), 161, "ASCENDING", 167)
    assert not matches_frame(parse_granule_name(name("20261104", frame=166)), 161, "ASCENDING", 167)
    assert not matches_frame(parse_granule_name(name("20261104")), 161, "DESCENDING", 167)


def test_pick_highest_version_on_same_date():
    picked = pick_one_per_date(
        parse_granule_name(n) for n in [name("20260625", version=1), name("20260625", version=2)]
    )
    assert [g.version for g in picked] == [2]


def test_newer_crid_wins_over_higher_version():
    picked = pick_one_per_date(
        parse_granule_name(n)
        for n in [name("20261023", crid="P05023", version=3), name("20261023", crid="P05036", version=1)]
    )
    assert [(g.crid, g.version) for g in picked] == [("P05036", 1)]


def test_one_per_date_sorted_by_date():
    names = [name("20260913"), name("20260601"), name("20260905", version=2), name("20260905", version=1)]
    picked = pick_one_per_date(parse_granule_name(n) for n in names)
    assert [g.date.isoformat() for g in picked] == ["2026-06-01", "2026-09-05", "2026-09-13"]
    assert picked[1].version == 2


def test_maturity_from_crid():
    assert maturity_for("P05023", CRIDS) == "PROVISIONAL"
    assert maturity_for("P05036", CRIDS) == "VALIDATED"
    assert maturity_for("P09999", CRIDS) == "UNKNOWN"


def test_compare_dates():
    missing, extra = compare_dates(["2026-06-01", "2026-06-02"], ["2026-06-01", "2026-06-13"])
    assert missing == ["2026-06-13"]
    assert extra == ["2026-06-02"]


def test_h5_url_prefers_h5_from_result():
    props = {"url": "https://x/a.png", "additionalUrls": ["https://x/a.xml", "https://x/a.h5"]}
    assert h5_url(props) == "https://x/a.h5"
    assert h5_url({"url": "https://x/a.png"}) is None

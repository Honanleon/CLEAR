# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
from pathlib import Path

from pipeline.run import load_config, manifest_path, zone_cfg, zone_ids

CFG = load_config(Path("pipeline/config.yaml"))


def test_zone_order_and_primary():
    ids = zone_ids(CFG)
    assert ids[0] == "boqueron-norte"
    assert zone_cfg(CFG, ids[0])["zone"]["prefix"] == ""
    assert all(zone_cfg(CFG, i)["zone"]["prefix"] == f"zones/{i}/" for i in ids[1:])


def test_zone_orbit_and_overrides_do_not_leak():
    sur = zone_cfg(CFG, "boqueron-sur")
    assert sur["nisar"]["frame"] == 166 and sur["detection"]["baseline_dates"] == 2
    norte = zone_cfg(CFG, "boqueron-norte")
    assert norte["nisar"]["frame"] == 167 and norte["detection"]["baseline_dates"] == 3
    assert CFG["detection"]["baseline_dates"] == 3  # the shared config is not modified
    mb = zone_cfg(CFG, "mbaracayu")
    assert mb["nisar"]["flight_direction"] == "DESCENDING" and mb["zone"]["kind"] == "control"


def test_expected_dates_are_strings_and_manifest_is_per_zone():
    norte = zone_cfg(CFG, "boqueron-norte")
    assert norte["nisar"]["expected_dates"][0] == "2025-11-21" and len(norte["nisar"]["expected_dates"]) == 26
    assert zone_cfg(CFG, "neembucu")["nisar"]["expected_dates"] == []
    assert manifest_path(norte) == Path("data/interim/boqueron-norte/nisar_scenes.json")


def test_zones_stay_far_from_pncat_district():
    # Ethics guard (CLAUDE.md section 4): no zone may extend north of -20 deg latitude in the
    # Alto Paraguay / northern Boqueron belt without a documented team decision.
    for i in zone_ids(CFG):
        assert CFG["aois"][i]["bbox"][3] <= -20.0, i

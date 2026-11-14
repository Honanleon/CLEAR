# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""CLEAR pipeline entry point.

python -m pipeline.run --config pipeline/config.yaml --stage fetch|process|validate|export|all
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from dataclasses import asdict
from pathlib import Path
from typing import Any

import numpy as np
import yaml

from pipeline.export import rgb_png, to_json
from pipeline.fetch import nisar

log = logging.getLogger("pipeline")

STAGES = ("fetch", "process", "validate", "export")


def load_config(path: Path) -> dict[str, Any]:
    with path.open() as f:
        return yaml.safe_load(f)


def stage_fetch(cfg: dict[str, Any], only_dates: list[str] | None = None) -> bool:
    """Search NISAR, write the scene manifest and crop the AOI for each date.

    Returns False if any crop failed. Crops that already exist are not downloaded again.
    """
    nisar_cfg = cfg["nisar"]
    scenes = nisar.search_scenes(nisar_cfg)
    manifest = Path(cfg["paths"]["interim"]) / "nisar_scenes.json"
    nisar.write_manifest(scenes, manifest)

    for s in scenes:
        log.info("  %s  cycle %03d  %s  %s  v%03d", s.date, s.cycle, s.crid, s.maturity, s.version)
    log.info("wrote %s (%d scenes)", manifest, len(scenes))

    missing, extra = nisar.compare_dates([s.date for s in scenes], nisar_cfg.get("expected_dates", []))
    if missing:
        log.warning("expected dates not found: %s", ", ".join(missing))
    if extra:
        log.warning("dates found but not expected: %s", ", ".join(extra))

    aoi_id = cfg["aoi"]
    bbox = cfg["aois"][aoi_id]["bbox"]
    interim = Path(cfg["paths"]["interim"])
    todo = [s for s in scenes if not only_dates or s.date in only_dates]
    if only_dates and len(todo) != len(set(only_dates)):
        log.warning(
            "some requested dates are not in the manifest: %s", sorted(set(only_dates) - {s.date for s in todo})
        )
    token = nisar.load_token()
    failed: list[str] = []
    for s in todo:
        out = nisar.crop_path(interim, aoi_id, s.date)
        if out.exists():
            log.info("%s: crop exists, skipping (%s)", s.date, out)
            continue
        t0 = time.monotonic()
        try:
            crop = nisar.read_crop(s.url, token, bbox, nisar_cfg["frequency"], nisar_cfg["polarizations"])
        except Exception as e:  # one bad date must not stop the others; no automatic retries
            log.error("%s: crop failed: %s", s.date, e)
            failed.append(s.date)
            continue
        nisar.write_crop(out, crop, s)
        log.info(
            "%s: wrote %s, %dx%d px, %.0f s, %.1f MB",
            s.date,
            out,
            *crop.window.shape,
            time.monotonic() - t0,
            out.stat().st_size / 1e6,
        )
    if failed:
        log.error("failed dates (re-run to try again): %s", ", ".join(failed))
    return not failed


def stage_export(cfg: dict[str, Any]) -> bool:
    """RGB PNG per date (one shared stretch) and index.json for the web app."""
    aoi_id = cfg["aoi"]
    bbox = cfg["aois"][aoi_id]["bbox"]
    interim = Path(cfg["paths"]["interim"])
    web_data = Path(cfg["paths"]["web_data"])
    exp = cfg["export"]
    scenes = nisar.read_manifest(interim / "nisar_scenes.json")

    channels: dict[str, dict[str, Any]] = {}
    for s in scenes:
        tif = nisar.crop_path(interim, aoi_id, s.date)
        if not tif.exists():
            log.warning("%s: no crop yet, skipping (run --stage fetch)", s.date)
            continue
        lin = rgb_png.load_resampled(tif, bbox, exp["rgb_res_deg"], cfg["detection"]["speckle_window"])
        channels[s.date] = rgb_png.channels_db(lin["HHHH"], lin["HVHV"])
    if not channels:
        log.error("no crops to export")
        return False

    pooled = {c: np.concatenate([ch[c].ravel() for ch in channels.values()]) for c in rgb_png.CHANNELS}
    stretch = rgb_png.fit_stretch(pooled, *exp["rgb_percentiles"])
    rgb_png.save_stretch(stretch, interim / aoi_id / "rgb_stretch.json")
    log.info("RGB stretch (dB) over %d dates: %s", len(channels), stretch)

    exported = []
    for s in scenes:
        if s.date not in channels:
            continue
        rel = f"rgb/{s.date}.webp"
        rgb_png.write_webp(rgb_png.to_rgba(channels[s.date], stretch), web_data / rel, exp["rgb_webp_quality"])
        log.info("%s: wrote %s (%.0f KB)", s.date, web_data / rel, (web_data / rel).stat().st_size / 1e3)
        exported.append({**asdict(s), "rgb": rel})

    # Time series for the chart (grid_500m.json); speckle filter not needed at 500 m
    dates, hv, hh = [], [], []
    for s in scenes:
        if s.date not in channels:
            continue
        g = rgb_png.resample_to_grid(
            nisar.crop_path(interim, aoi_id, s.date), bbox, exp["grid_nx"], exp["grid_ny"], speckle_window=1
        )
        dates.append(s.date)
        hv.append(g["HVHV"])
        hh.append(g["HHHH"])
    grid_path = web_data / "grid_500m.json"
    to_json.write_json(to_json.build_grid(bbox, dates, hv, hh), grid_path, compact=True)
    log.info("wrote %s (%d dates, %.0f KB)", grid_path, len(dates), grid_path.stat().st_size / 1e3)

    index = to_json.build_index(aoi_id, bbox, cfg["nisar"], exported, cfg["detection"])
    to_json.write_json(index, web_data / "index.json")
    log.info("wrote %s (%d scenes)", web_data / "index.json", len(exported))
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=Path("pipeline/config.yaml"))
    parser.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    parser.add_argument("--date", action="append", dest="dates", metavar="YYYY-MM-DD", help="only crop these dates")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    for noisy in ("asf_search", "fsspec"):
        logging.getLogger(noisy).setLevel(logging.INFO if args.verbose else logging.WARNING)
    cfg = load_config(args.config)
    stages = STAGES if args.stage == "all" else (args.stage,)
    for stage in stages:
        if stage == "fetch":
            if not stage_fetch(cfg, args.dates):
                return 1
        elif stage == "export":
            if not stage_export(cfg):
                return 1
        else:
            log.error("stage %r is not implemented yet", stage)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

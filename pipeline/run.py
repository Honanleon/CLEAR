# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""CLEAR pipeline entry point.

python -m pipeline.run --config pipeline/config.yaml --stage fetch|process|validate|export|all
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path
from typing import Any

import yaml

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
        else:
            log.error("stage %r is not implemented yet", stage)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

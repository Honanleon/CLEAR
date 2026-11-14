# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""CLEAR pipeline entry point.

python -m pipeline.run --config pipeline/config.yaml --stage fetch|process|validate|export|all
"""

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

import yaml

from pipeline.fetch import nisar

log = logging.getLogger("pipeline")

STAGES = ("fetch", "process", "validate", "export")


def load_config(path: Path) -> dict[str, Any]:
    with path.open() as f:
        return yaml.safe_load(f)


def stage_fetch(cfg: dict[str, Any]) -> None:
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
    # TODO(step 3): read the AOI window of HH/HV for each scene into data/interim/.


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=Path("pipeline/config.yaml"))
    parser.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    logging.getLogger("asf_search").setLevel(logging.INFO if args.verbose else logging.WARNING)
    cfg = load_config(args.config)
    stages = STAGES if args.stage == "all" else (args.stage,)
    for stage in stages:
        if stage == "fetch":
            stage_fetch(cfg)
        else:
            log.error("stage %r is not implemented yet", stage)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

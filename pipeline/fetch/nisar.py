# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Search NISAR L2 GCOV products at ASF and pick one product per date.

The pure functions (name parsing, de-duplication, date checks) do not touch the
network and are covered by tests. `search_scenes` is the only network call.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable, Mapping
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# Example: NISAR_L2_PR_GCOV_032_161_A_167_2005_DHDH_A_20261011T095756_20261011T095834_P05023_N_F_J_001
_GCOV_NAME = re.compile(
    r"^NISAR_L2_(?P<config>[A-Z]{2})_GCOV"
    r"_(?P<cycle>\d{3})_(?P<track>\d{3})_(?P<direction>[AD])_(?P<frame>\d{3})"
    r"_(?P<mode>[0-9A-Z]{4})_(?P<pols>[A-Z]{4})_[A-Z]"
    r"_(?P<start>\d{8}T\d{6})_(?P<end>\d{8}T\d{6})"
    r"_(?P<crid>[A-Z]\d{5})_[A-Z]_[A-Z]_[A-Z]_(?P<version>\d{3})$"
)


@dataclass(frozen=True)
class GranuleName:
    """Fields encoded in a NISAR GCOV granule name."""

    granule_id: str
    config: str
    cycle: int
    track: int
    direction: str  # "A" ascending, "D" descending
    frame: int
    mode: str
    polarizations: str
    start: datetime
    crid: str
    version: int

    @property
    def date(self) -> date:
        return self.start.date()

    @property
    def crid_number(self) -> int:
        return int(self.crid[1:])


@dataclass(frozen=True)
class Scene:
    """One selected NISAR acquisition: what the rest of the pipeline consumes."""

    date: str  # ISO date
    granule_id: str
    url: str
    cycle: int
    crid: str
    version: int
    maturity: str  # PROVISIONAL | VALIDATED | UNKNOWN


def parse_granule_name(name: str) -> GranuleName:
    """Parse a GCOV granule id or file name (a trailing .h5 is ignored)."""
    stem = Path(name).name.removesuffix(".h5")
    m = _GCOV_NAME.match(stem)
    if m is None:
        raise ValueError(f"not a NISAR L2 GCOV granule name: {name!r}")
    g = m.groupdict()
    return GranuleName(
        granule_id=stem,
        config=g["config"],
        cycle=int(g["cycle"]),
        track=int(g["track"]),
        direction=g["direction"],
        frame=int(g["frame"]),
        mode=g["mode"],
        polarizations=g["pols"],
        start=datetime.strptime(g["start"], "%Y%m%dT%H%M%S"),
        crid=g["crid"],
        version=int(g["version"]),
    )


def matches_frame(g: GranuleName, track: int, direction: str, frame: int) -> bool:
    """True if the granule is on the wanted track, direction and frame."""
    return g.track == track and g.direction == direction[0].upper() and g.frame == frame


def pick_one_per_date(granules: Iterable[GranuleName]) -> list[GranuleName]:
    """Keep one granule per date: newest CRID, then highest version suffix.

    Returns granules sorted by date.
    """
    best: dict[date, GranuleName] = {}
    for g in granules:
        current = best.get(g.date)
        if current is None or (g.crid_number, g.version) > (current.crid_number, current.version):
            best[g.date] = g
    return [best[d] for d in sorted(best)]


def maturity_for(crid: str, crid_maturity: Mapping[str, str]) -> str:
    """PROVISIONAL / VALIDATED from the CRID; UNKNOWN (with a warning) otherwise."""
    m = crid_maturity.get(crid)
    if m is None:
        log.warning("unknown CRID %s: maturity set to UNKNOWN; add it to config nisar.crid_maturity", crid)
        return "UNKNOWN"
    return m


def compare_dates(found: Iterable[str], expected: Iterable[str]) -> tuple[list[str], list[str]]:
    """Return (missing, extra) ISO dates of `found` against `expected`."""
    f, e = set(found), set(expected)
    return sorted(e - f), sorted(f - e)


def h5_url(properties: Mapping[str, Any]) -> str | None:
    """The .h5 download URL of an asf_search result, taken from the result itself."""
    candidates = [properties.get("url"), *(properties.get("additionalUrls") or [])]
    for u in candidates:
        if isinstance(u, str) and u.endswith(".h5"):
            return u
    return None


def search_scenes(nisar_cfg: Mapping[str, Any]) -> list[Scene]:
    """Search ASF and return one GCOV scene per date for the configured frame."""
    import asf_search as asf  # imported here so tests do not need it

    results = asf.search(
        dataset=[nisar_cfg["dataset"]],
        processingLevel=[nisar_cfg["processing_level"]],
        productionConfiguration=[nisar_cfg["production_configuration"]],
        relativeOrbit=[nisar_cfg["relative_orbit"]],
        flightDirection=nisar_cfg["flight_direction"],
        start=nisar_cfg["start"],
        end=nisar_cfg["end"],
    )
    log.info("asf_search returned %d results", len(results))

    frame_tag = f"_{nisar_cfg['relative_orbit']:03d}_{nisar_cfg['flight_direction'][0]}_{nisar_cfg['frame']:03d}_"
    parsed: list[GranuleName] = []
    urls: dict[str, str] = {}
    for r in results:
        props = r.properties
        file_id = str(props.get("fileID") or props.get("sceneName") or "")
        if frame_tag not in file_id:
            continue
        try:
            g = parse_granule_name(file_id)
        except ValueError:
            log.warning("skipping result with unexpected name: %s", file_id)
            continue
        if not matches_frame(g, nisar_cfg["relative_orbit"], nisar_cfg["flight_direction"], nisar_cfg["frame"]):
            continue
        url = h5_url(props)
        if url is None:
            log.warning("no .h5 URL in result %s", file_id)
            continue
        parsed.append(g)
        urls[g.granule_id] = url

    selected = pick_one_per_date(parsed)
    log.info("%d granules on frame, %d after one-per-date selection", len(parsed), len(selected))
    return [
        Scene(
            date=g.date.isoformat(),
            granule_id=g.granule_id,
            url=urls[g.granule_id],
            cycle=g.cycle,
            crid=g.crid,
            version=g.version,
            maturity=maturity_for(g.crid, nisar_cfg.get("crid_maturity", {})),
        )
        for g in selected
    ]


def write_manifest(scenes: Iterable[Scene], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([asdict(s) for s in scenes], indent=2) + "\n")


def read_manifest(path: Path) -> list[Scene]:
    return [Scene(**s) for s in json.loads(path.read_text())]

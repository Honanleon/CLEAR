# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Search NISAR L2 GCOV products at ASF, pick one product per date and crop the AOI.

The pure functions (name parsing, de-duplication, date checks, AOI window, cleaning)
do not touch the network and are covered by tests. `search_scenes` and `read_crop`
are the only network calls. `read_crop` reads only the AOI window of each ~1.9 GB
HDF5 file over HTTPS; it never downloads the whole file.
"""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import asdict, dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

import numpy as np
from affine import Affine

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
    maturity: str  # PROVISIONAL | VALIDATED | BETA | UNKNOWN


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
    """PROVISIONAL / VALIDATED / BETA from the CRID; UNKNOWN (with a warning) otherwise."""
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


# --- AOI crop ---------------------------------------------------------------

GRID_PATH = "/science/LSAR/GCOV/grids/{frequency}"


@dataclass(frozen=True)
class Window:
    """Half-open row/column window into the product grid."""

    row0: int
    row1: int
    col0: int
    col1: int

    @property
    def shape(self) -> tuple[int, int]:
        return self.row1 - self.row0, self.col1 - self.col0


@dataclass(frozen=True)
class Crop:
    bands: dict[str, np.ndarray]  # polarization term (e.g. "HVHV") -> gamma0, linear
    transform: Affine  # pixel-corner transform of the window
    epsg: int
    window: Window


def load_token(env_file: Path = Path(".env")) -> str:
    """Earthdata token from $EARTHDATA_TOKEN or from the .env file. Never logged."""
    token = os.environ.get("EARTHDATA_TOKEN", "").strip()
    if not token and env_file.exists():
        for line in env_file.read_text().splitlines():
            if line.startswith("EARTHDATA_TOKEN="):
                token = line.split("=", 1)[1].strip().strip("\"'")
    if not token:
        raise RuntimeError("EARTHDATA_TOKEN is not set (put it in .env at the repository root)")
    return token


def bbox_to_projected(bbox: Sequence[float], epsg: int) -> tuple[float, float, float, float]:
    """Lon/lat bbox -> (xmin, ymin, xmax, ymax) envelope in `epsg`, with densified edges."""
    from pyproj import Transformer

    t = Transformer.from_crs(4326, epsg, always_xy=True)
    xmin, ymin, xmax, ymax = t.transform_bounds(*bbox, densify_pts=21)
    return float(xmin), float(ymin), float(xmax), float(ymax)


def aoi_window(x: np.ndarray, y: np.ndarray, bounds: Sequence[float]) -> Window:
    """Window of the pixels whose centers fall inside `bounds` (projected units).

    `x` (ascending) and `y` (descending) are the pixel-center coordinates of the grid.
    """
    xmin, ymin, xmax, ymax = bounds
    cols = np.flatnonzero((x >= xmin) & (x <= xmax))
    rows = np.flatnonzero((y >= ymin) & (y <= ymax))
    if cols.size == 0 or rows.size == 0:
        raise ValueError("the AOI does not overlap the product grid")
    if xmin < x.min() or xmax > x.max() or ymin < y.min() or ymax > y.max():
        log.warning("the AOI is only partly inside the product grid")
    return Window(int(rows[0]), int(rows[-1]) + 1, int(cols[0]), int(cols[-1]) + 1)


def window_transform(x: np.ndarray, y: np.ndarray, w: Window) -> Affine:
    """Affine transform (pixel corners) of window `w` from pixel-center coordinates."""
    dx = float(x[1] - x[0])
    dy = float(y[1] - y[0])  # negative: north-up grid
    return Affine(dx, 0.0, float(x[w.col0]) - dx / 2, 0.0, dy, float(y[w.row0]) - dy / 2)


def clean_gamma0(a: np.ndarray) -> np.ndarray:
    """float32 copy with 0, negative and non-finite values set to NaN."""
    out = np.asarray(a, dtype=np.float32).copy()
    out[~np.isfinite(out) | (out <= 0)] = np.nan
    return out


def read_crop(url: str, token: str, bbox: Sequence[float], frequency: str, polarizations: Sequence[str]) -> Crop:
    """Read only the AOI window of each polarization from a remote GCOV file."""
    import fsspec
    import h5py

    fs = fsspec.filesystem("https", client_kwargs={"headers": {"Authorization": f"Bearer {token}"}})
    with fs.open(url, "rb", block_size=2**21, cache_type="blockcache") as f, h5py.File(f, "r") as h:
        g = h[GRID_PATH.format(frequency=frequency)]
        epsg = int(g["projection"][()])
        x = g["xCoordinates"][:]
        y = g["yCoordinates"][:]
        w = aoi_window(x, y, bbox_to_projected(bbox, epsg))
        bands = {p: clean_gamma0(g[p][w.row0 : w.row1, w.col0 : w.col1]) for p in polarizations}
        transform = window_transform(x, y, w)
    return Crop(bands=bands, transform=transform, epsg=epsg, window=w)


def crop_path(interim: Path, aoi_id: str, day: str) -> Path:
    return interim / aoi_id / f"nisar_{day}.tif"


def crop_bbox(path: Path) -> list[float] | None:
    """The AOI bbox a crop was made for (tag written by `write_crop`), or None if unknown."""
    import rasterio

    with rasterio.open(path) as src:
        tag = src.tags().get("aoi_bbox")
    return json.loads(tag) if tag else None


def write_crop(path: Path, crop: Crop, scene: Scene, bbox: Sequence[float]) -> None:
    """Write a multi-band GeoTIFF (gamma0 linear, NaN nodata). Atomic: tmp file, then rename."""
    import rasterio

    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp.tif")
    names = list(crop.bands)
    rows, cols = crop.window.shape
    profile = {
        "driver": "GTiff",
        "width": cols,
        "height": rows,
        "count": len(names),
        "dtype": "float32",
        "crs": f"EPSG:{crop.epsg}",
        "transform": crop.transform,
        "nodata": float("nan"),
        "compress": "deflate",
        "predictor": 3,
        "tiled": True,
        "blockxsize": 512,
        "blockysize": 512,
    }
    with rasterio.open(tmp, "w", **profile) as dst:
        for i, name in enumerate(names, start=1):
            dst.write(crop.bands[name], i)
            dst.set_band_description(i, name)
        dst.update_tags(
            aoi_bbox=json.dumps(list(bbox)),
            date=scene.date,
            granule_id=scene.granule_id,
            crid=scene.crid,
            maturity=scene.maturity,
            units="gamma0, linear",
            source="NISAR L2 GCOV (NASA/JPL, ASF DAAC)",
        )
    tmp.replace(path)

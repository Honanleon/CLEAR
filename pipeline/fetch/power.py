# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Daily precipitation (NASA POWER, PRECTOTCORR) at one point, for the rain bars in the web chart.

API: https://power.larc.nasa.gov/docs/services/api/temporal/daily/ (no key needed).
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from datetime import date, datetime
from typing import Any

URL = "https://power.larc.nasa.gov/api/temporal/daily/point"
PARAMETER = "PRECTOTCORR"
SOURCE = "NASA POWER PRECTOTCORR"
FILL = -999.0


def center(bbox: Sequence[float]) -> list[float]:
    lon_min, lat_min, lon_max, lat_max = bbox
    return [round((lon_min + lon_max) / 2, 4), round((lat_min + lat_max) / 2, 4)]


def parse(payload: Mapping[str, Any], point: Sequence[float]) -> dict[str, Any]:
    """POWER JSON -> rain.json (docs/DATA_CONTRACT.md). Fill values (-999) become null."""
    series = payload["properties"]["parameter"][PARAMETER]
    dates, mm = [], []
    for k in sorted(series):
        dates.append(datetime.strptime(k, "%Y%m%d").date().isoformat())
        v = series[k]
        mm.append(None if v is None or v <= FILL + 1e-6 else round(float(v), 1))
    return {"dates": dates, "mm": mm, "source": SOURCE, "point": list(point)}


def fetch_rain(bbox: Sequence[float], start: date, end: date) -> dict[str, Any]:
    import requests

    point = center(bbox)
    params = {
        "parameters": PARAMETER,
        "community": "AG",
        "longitude": point[0],
        "latitude": point[1],
        "start": start.strftime("%Y%m%d"),
        "end": end.strftime("%Y%m%d"),
        "format": "JSON",
    }
    r = requests.get(URL, params=params, timeout=120)
    r.raise_for_status()
    return parse(r.json(), point)

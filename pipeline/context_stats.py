# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Context numbers for each study zone, from US sources: forest loss per year (UMD Global Forest Change
2000-2024 v1.12) and active-fire detections per year and month (NASA FIRMS MODIS C6.1, country archives).

Not part of the detection: these numbers only give context (docs/CONTEXT.md). Usage:

    python -m pipeline.context_stats --firms <folder with modis_<year>_Paraguay.csv>

FIRMS yearly country files are public: https://firms.modaps.eosdis.nasa.gov/data/country/modis/<year>/modis_<year>_Paraguay.csv
"""

from __future__ import annotations

import argparse
import collections
import csv
import json
import math
from pathlib import Path

import yaml

from pipeline.fetch import gfc

MIN_TREECOVER = 30  # % canopy in 2000, as the gfc mask
FIRMS_MIN_CONFIDENCE = 30  # MODIS confidence: nominal and high only
GFC_PIXEL_DEG = 0.00025


def gfc_loss_by_year(bbox: list[float]) -> dict:
    """Forest (canopy >= 30 % in 2000) and its loss per year 2001-2024 inside bbox, in hectares."""
    import rasterio
    from rasterio.windows import from_bounds

    (tile,) = gfc.tile_names(bbox)  # every zone fits in one 10-degree tile
    layers = {}
    with rasterio.Env(**gfc.GDAL_HTTP):
        for layer in ("treecover2000", "lossyear"):
            with rasterio.open(gfc.URL.format(v=gfc.VERSION, layer=layer, tile=tile)) as src:
                layers[layer] = src.read(1, window=from_bounds(*bbox, src.transform))
    lat = (bbox[1] + bbox[3]) / 2
    px_ha = (GFC_PIXEL_DEG * 111_320 * math.cos(math.radians(lat))) * (GFC_PIXEL_DEG * 110_574) / 1e4
    forest = layers["treecover2000"] >= MIN_TREECOVER
    loss = {2000 + y: round(float(((layers["lossyear"] == y) & forest).sum() * px_ha)) for y in range(1, 25)}
    return {
        "forest_2000_ha": round(float(forest.sum() * px_ha)),
        "loss_ha_by_year": loss,
        "loss_ha_total": sum(loss.values()),
    }


def firms_counts(folder: Path, bbox: list[float]) -> dict:
    """MODIS vegetation-fire detections (type 0, confidence >= 30) inside bbox, per year and per month."""
    x0, y0, x1, y1 = bbox
    by_year: collections.Counter[str] = collections.Counter()
    by_month: collections.Counter[str] = collections.Counter()
    for f in sorted(folder.glob("modis_*_Paraguay.csv")):
        with open(f, encoding="utf-8") as fh:
            for r in csv.DictReader(fh):
                if int(r["confidence"]) < FIRMS_MIN_CONFIDENCE or r.get("type", "0") != "0":
                    continue
                lat, lon = float(r["latitude"]), float(r["longitude"])
                if x0 <= lon <= x1 and y0 <= lat <= y1:
                    by_year[r["acq_date"][:4]] += 1
                    by_month[r["acq_date"][5:7]] += 1
    return {
        "by_year": dict(sorted(by_year.items())),
        "by_month": dict(sorted(by_month.items())),
        "total": sum(by_year.values()),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", type=Path, default=Path("pipeline/config.yaml"))
    ap.add_argument("--firms", type=Path, help="folder with the FIRMS MODIS yearly CSVs of Paraguay")
    args = ap.parse_args()
    cfg = yaml.safe_load(args.config.read_text(encoding="utf-8"))
    out = {}
    for zone in cfg["zones"]:
        bbox = cfg["aois"][zone]["bbox"]
        out[zone] = {"bbox": bbox}
        if cfg["aois"][zone].get("kind") != "water":
            out[zone]["gfc"] = gfc_loss_by_year(bbox)
        if args.firms:
            out[zone]["firms_modis"] = firms_counts(args.firms, bbox)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()

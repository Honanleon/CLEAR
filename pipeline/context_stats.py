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


USDA_SERIES = {  # (file, commodity, attribute) -> key in context.json
    ("psd_oilseeds.csv", "Oilseed, Soybean", "Area Harvested"): "soy_area_kha",
    ("psd_livestock.csv", "Meat, Beef and Veal", "Exports"): "beef_exports_kt",
}


def usda_series(folder: Path, first: int = 2000, last: int = 2024) -> dict[str, dict[str, float]]:
    """Paraguay series from the USDA FAS PSD Online CSV downloads (psd_oilseeds.csv, psd_livestock.csv)."""
    out: dict[str, dict[str, float]] = {}
    for (name, commodity, attribute), key in USDA_SERIES.items():
        (path,) = folder.rglob(name)
        with open(path, encoding="utf-8-sig") as fh:
            for r in csv.DictReader(fh):
                if (r["Country_Name"], r["Commodity_Description"], r["Attribute_Description"]) != (
                    "Paraguay",
                    commodity,
                    attribute,
                ):
                    continue
                year = int(r["Market_Year"])
                if first <= year <= last:
                    out.setdefault(key, {})[str(year)] = float(r["Value"])
    return {k: dict(sorted(v.items())) for k, v in out.items()}


def web_context(stats: dict, national: dict) -> dict:
    """Compact file for the web (web/public/data/context.json): yearly series only."""
    zones = {}
    for zone, s in stats.items():
        z = {}
        if "gfc" in s:
            z["loss_ha"] = {y: v for y, v in s["gfc"]["loss_ha_by_year"].items()}
            z["forest_2000_ha"] = s["gfc"]["forest_2000_ha"]
        if "firms_modis" in s:
            z["fires"] = s["firms_modis"]["by_year"]
        zones[zone] = z
    return {
        "generated": "see docs/CONTEXT.md",
        "zones": zones,
        "national": national,
        "sources": {
            "loss_ha": "UMD Global Forest Change 2000-2024 v1.12 (Hansen et al. 2013), canopy >= 30 %",
            "fires": "NASA FIRMS, MODIS C6.1 active fires (vegetation, confidence >= 30)",
            "national": "USDA FAS PSD Online (Paraguay)",
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", type=Path, default=Path("pipeline/config.yaml"))
    ap.add_argument("--firms", type=Path, help="folder with the FIRMS MODIS yearly CSVs of Paraguay")
    ap.add_argument("--usda", type=Path, help="folder with the unzipped USDA PSD CSVs (oilseeds, livestock)")
    ap.add_argument("--web", type=Path, help="also write the compact web file here (web/public/data/context.json)")
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
    national = usda_series(args.usda) if args.usda else {}
    print(json.dumps({"zones": out, "national": national}, indent=1))
    if args.web:
        text = json.dumps(web_context(out, national), ensure_ascii=False, separators=(",", ":"))
        args.web.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()

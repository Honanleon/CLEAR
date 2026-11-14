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
from pipeline.fetch import nisar, worldcover
from pipeline.process import detect, normalize, polygons
from pipeline.process.calibrate import boxcar_mean, to_db

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
            if nisar.crop_bbox(out) == list(bbox):
                log.info("%s: crop exists, skipping (%s)", s.date, out)
                continue
            log.warning("%s: existing crop was made for another bbox; cropping again", s.date)
        t0 = time.monotonic()
        try:
            crop = nisar.read_crop(s.url, token, bbox, nisar_cfg["frequency"], nisar_cfg["polarizations"])
        except Exception as e:  # one bad date must not stop the others; no automatic retries
            log.error("%s: crop failed: %s", s.date, e)
            failed.append(s.date)
            continue
        nisar.write_crop(out, crop, s, bbox)
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


def stage_process(cfg: dict[str, Any], ignore_sanity: bool = False) -> bool:
    """Forest mask, normalization, detection and polygons. Writes to data/interim/<aoi>/."""
    import json

    import rasterio

    aoi_id = cfg["aoi"]
    bbox = cfg["aois"][aoi_id]["bbox"]
    interim = Path(cfg["paths"]["interim"])
    det = cfg["detection"]
    scenes = nisar.read_manifest(interim / "nisar_scenes.json")
    paths = [nisar.crop_path(interim, aoi_id, s.date) for s in scenes]
    missing = [s.date for s, p in zip(scenes, paths, strict=True) if not p.exists() or nisar.crop_bbox(p) != list(bbox)]
    if missing:
        log.error("crops missing or made for another bbox: %s (run --stage fetch)", ", ".join(missing))
        return False
    dates = [s.date for s in scenes]

    layers = []
    for s, p in zip(scenes, paths, strict=True):
        with rasterio.open(p) as src:
            hv = src.read(list(src.descriptions).index("HVHV") + 1)
            transform, crs, shape = src.transform, src.crs.to_string(), (src.height, src.width)
        layers.append(to_db(boxcar_mean(hv, det["speckle_window"])))
        log.info("%s: HV loaded and filtered", s.date)
    stack = np.stack(layers)
    del layers

    forest = worldcover.cached_forest_mask(interim / aoi_id / "forest_worldcover2021.tif", bbox, transform, shape, crs)
    forest &= np.all(np.isfinite(stack), axis=0)
    log.info("forest mask (%s): %.0f%% of the AOI", worldcover.SOURCE, forest.mean() * 100)

    medians = normalize.forest_medians(stack, forest)
    log.info(
        "forest HV median per date (dB): %s", " ".join(f"{d[5:]}:{m:.2f}" for d, m in zip(dates, medians, strict=True))
    )
    stack = normalize.normalize(stack, medians)
    base = detect.baseline(stack, det["baseline_dates"])
    delta = stack - base[None]
    del stack
    forest_like = base >= det["min_baseline_db"]
    log.info(
        "radar forest-like at baseline (normalized HV >= %s dB): %.0f%% of the mask",
        det["min_baseline_db"],
        np.mean(forest_like[forest]) * 100,
    )
    first = detect.first_detection(
        delta, det["threshold_db"], det["persistence"], start=det["baseline_dates"], window=det["persistence_window"]
    )
    first[~(forest & forest_like)] = detect.NO_DETECTION

    report = detect.sanity_checks(dates, medians, first, forest)
    feats = polygons.polygons(first, delta, transform, crs, dates, det["min_area_ha"])
    total_ha = round(sum(f["properties"]["area_ha"] for f in feats), 1)
    by_date = {
        d: round(sum(f["properties"]["area_ha"] for f in feats if f["properties"]["first_date"] == d), 1) for d in dates
    }
    log.info("%d polygons >= %s ha, %.0f ha in total", len(feats), det["min_area_ha"], total_ha)
    for d, a in by_date.items():
        if a:
            log.info("  %s: %.0f ha", d, a)

    out = interim / aoi_id
    to_json.write_json({"type": "FeatureCollection", "features": feats}, out / "polygons.geojson", compact=True)
    profile = {
        "driver": "GTiff",
        "width": shape[1],
        "height": shape[0],
        "count": 2,
        "dtype": "int16",
        "crs": crs,
        "transform": transform,
        "nodata": -32768,
        "compress": "deflate",
        "tiled": True,
    }
    with rasterio.open(out / "detection.tif", "w", **profile) as dst:
        dst.write(first, 1)
        dst.write(forest.astype(np.int16), 2)
        dst.set_band_description(1, "first_detection_date_index")
        dst.set_band_description(2, "forest_mask")
        dst.update_tags(dates=json.dumps(dates))
    summary = {
        "dates": dates,
        "forest_median_hv_db": [round(float(m), 3) for m in medians],
        "forest_mask_source": worldcover.SOURCE,
        "forest_pct_of_aoi": round(float(forest.mean() * 100), 1),
        "n_polygons": len(feats),
        "area_ha_total": total_ha,
        "area_ha_by_date": by_date,
        "sanity": {
            "max_median_jump_db": round(report.max_median_jump_db, 2),
            "jump_dates": report.jump_dates,
            "max_flagged_pct": round(report.max_flagged_pct, 2),
            "max_flagged_date": report.max_flagged_date,
            "problems": list(report.problems),
        },
        "params": {
            k: det[k]
            for k in (
                "speckle_window",
                "baseline_dates",
                "min_baseline_db",
                "threshold_db",
                "persistence",
                "min_area_ha",
            )
        },
    }
    to_json.write_json(summary, out / "detection_summary.json")
    log.info(
        "sanity: median jump max %.2f dB (%s -> %s), max flagged %.2f%% of forest (%s)",
        report.max_median_jump_db,
        *report.jump_dates,
        report.max_flagged_pct,
        report.max_flagged_date,
    )
    if report.problems:
        for prob in report.problems:
            log.error("SANITY: %s", prob)
        if not ignore_sanity:
            log.error("stopping: fix the cause or re-run with --ignore-sanity once it is understood")
            return False
        log.warning("continuing despite sanity problems (--ignore-sanity)")
    return True


def stage_validate(cfg: dict[str, Any]) -> bool:
    """Compare detections with OPERA DIST-ALERT; set dist_confirmed per polygon; write validation_summary.json."""
    import json
    from datetime import date

    import rasterio
    from rasterio.features import rasterize
    from rasterio.warp import transform_geom
    from shapely.geometry import shape

    from pipeline.fetch import dist_alert
    from pipeline.validate import dist_compare

    aoi_id = cfg["aoi"]
    bbox = cfg["aois"][aoi_id]["bbox"]
    out = Path(cfg["paths"]["interim"]) / aoi_id
    val = cfg["validation"]
    if not (out / "detection.tif").exists():
        log.error("no detection yet (run --stage process)")
        return False
    with rasterio.open(out / "detection.tif") as d:
        first, forest = d.read(1), d.read(2).astype(bool)
        transform, crs, shape_ = d.transform, d.crs.to_string(), (d.height, d.width)
        dates = json.loads(d.tags()["dates"])
    radar_days = [dist_alert.to_days(date.fromisoformat(x)) for x in dates]
    d0, d1 = radar_days[0], radar_days[-1] + val["tol_days"]

    status, days, granules = dist_alert.read_dist(
        bbox, transform, shape_, crs, nisar.load_token(), (dates[-1], (date.today()).isoformat())
    )
    log.info("DIST-ALERT granules: %s", ", ".join(granules))
    px_ha = abs(transform.a * transform.e) / 1e4
    alert = dist_compare.alert_mask(status, days, d0, d1, val["reference_statuses"]) & forest
    alert = dist_compare.drop_small(alert, px_ha, val["min_alert_area_ha"])

    # Only the published polygons count (CLAUDE.md: agreement = % of our polygon area), not loose pixels < min area
    poly_path = out / "polygons.geojson"
    fc = json.loads(poly_path.read_text())
    feats = fc["features"]
    labels = np.zeros(shape_, dtype=np.int32)
    if feats:
        geoms = [(shape(transform_geom("EPSG:4326", crs, f["geometry"])), i + 1) for i, f in enumerate(feats)]
        labels = rasterize(geoms, out_shape=shape_, transform=transform, fill=0, dtype="int32")
    first_poly = np.where(labels > 0, first, -1).astype(first.dtype)
    res = dist_compare.compare(first_poly, radar_days, alert, days, val["tol_days"])
    log.info(
        "validation vs DIST-ALERT: agreement %s%% (+-%sd: %s%%), coverage %s%% (+-%sd: %s%%), median lag %s days "
        "(radar polygons %.0f ha, optical %.0f ha)",
        res["agreement_pct"],
        val["tol_days"],
        res["agreement_pct_tol"],
        res["coverage_pct"],
        val["tol_days"],
        res["coverage_pct_tol"],
        res["median_lag_days"],
        res["radar_px"] * px_ha,
        res["alert_px"] * px_ha,
    )

    if feats:
        conf = dist_compare.polygon_confirmed(labels, alert, len(feats), val["polygon_confirmed_frac"])
        for f, c in zip(feats, conf, strict=True):
            f["properties"]["dist_confirmed"] = c
        to_json.write_json(fc, poly_path, compact=True)
        log.info("dist_confirmed: %d of %d polygons", sum(conf), len(conf))
        res["polygons_confirmed"] = int(sum(conf))
    res["polygons_total"] = len(feats)
    res.setdefault("polygons_confirmed", 0)
    to_json.write_json(
        {
            **res,
            "reference": dist_alert.SOURCE,
            "granules": granules,
            "tol_days": val["tol_days"],
            "statuses": val["reference_statuses"],
            "px_ha": px_ha,
        },
        out / "validation_summary.json",
    )
    return True


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

    summary_path = interim / aoi_id / "detection_summary.json"
    summary = None
    if summary_path.exists():
        import json
        import shutil

        summary = json.loads(summary_path.read_text())
        shutil.copyfile(interim / aoi_id / "polygons.geojson", web_data / "polygons.geojson")
        log.info("copied polygons.geojson (%d polygons)", summary["n_polygons"])
    else:
        log.warning("no detection yet (run --stage process): index.json will report 0 polygons")
    val_path = interim / aoi_id / "validation_summary.json"
    if summary is not None and val_path.exists():
        summary["validation"] = json.loads(val_path.read_text())

    index = to_json.build_index(aoi_id, bbox, cfg["nisar"], exported, cfg["detection"], summary=summary)
    to_json.write_json(index, web_data / "index.json")
    log.info("wrote %s (%d scenes)", web_data / "index.json", len(exported))
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=Path("pipeline/config.yaml"))
    parser.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    parser.add_argument("--date", action="append", dest="dates", metavar="YYYY-MM-DD", help="only crop these dates")
    parser.add_argument("--ignore-sanity", action="store_true", help="continue after a failed sanity check")
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
        elif stage == "process":
            if not stage_process(cfg, args.ignore_sanity):
                return 1
        elif stage == "validate":
            if not stage_validate(cfg):
                return 1
        elif stage == "export":
            if not stage_export(cfg):
                return 1
        else:
            log.warning("stage %r is not implemented yet, skipping", stage)
    return 0


if __name__ == "__main__":
    sys.exit(main())

# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""CLEAR pipeline entry point.

python -m pipeline.run --config pipeline/config.yaml --stage fetch|process|validate|export|all [--aoi ID ...]

Without --aoi, every zone in `zones` (config) is processed in order; the first one is the primary zone.
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


def zone_ids(cfg: dict[str, Any]) -> list[str]:
    """Zones in processing order; the first is the primary zone. Falls back to the old single `aoi` key."""
    return list(cfg.get("zones") or [cfg["aoi"]])


def zone_cfg(cfg: dict[str, Any], aoi_id: str) -> dict[str, Any]:
    """Config for one zone: its orbit, date range and detection overrides, plus where its outputs go.

    The primary zone is exported to web/public/data/ (as before); the others to web/public/data/zones/<id>/.
    """
    import copy

    z = copy.deepcopy(cfg)
    a = cfg["aois"][aoi_id]
    primary = aoi_id == zone_ids(cfg)[0]
    z["aoi"] = aoi_id
    z["nisar"].update(a.get("orbit", {}))
    for k in ("start", "end"):
        if k in a:
            z["nisar"][k] = str(a[k])
    z["nisar"]["expected_dates"] = [str(d) for d in a.get("expected_dates", [])]
    z["detection"].update(a.get("detection", {}))
    z["zone"] = {
        "id": aoi_id,
        "kind": a.get("kind", "clearing"),
        "chapter": a.get("chapter"),
        "name": a.get("name", {}),
        "primary": primary,
        "prefix": "" if primary else f"zones/{aoi_id}/",
        "orbit": {k: z["nisar"][k] for k in ("relative_orbit", "flight_direction", "frame")},
    }
    return z


def manifest_path(cfg: dict[str, Any]) -> Path:
    return Path(cfg["paths"]["interim"]) / cfg["aoi"] / "nisar_scenes.json"


def stage_fetch(cfg: dict[str, Any], only_dates: list[str] | None = None) -> bool:
    """Search NISAR, write the scene manifest and crop the AOI for each date.

    Returns False if any crop failed. Crops that already exist are not downloaded again.
    """
    nisar_cfg = cfg["nisar"]
    scenes = nisar.search_scenes(nisar_cfg)
    manifest = manifest_path(cfg)
    nisar.write_manifest(scenes, manifest)

    for s in scenes:
        log.info("  %s  cycle %03d  %s  %s  v%03d", s.date, s.cycle, s.crid, s.maturity, s.version)
    log.info("wrote %s (%d scenes)", manifest, len(scenes))

    expected = nisar_cfg.get("expected_dates", [])
    missing, extra = nisar.compare_dates([s.date for s in scenes], expected) if expected else ([], [])
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
    rain_path = Path(cfg["paths"]["interim"]) / cfg["aoi"] / "rain.json"
    try:  # small request; the crops do not depend on it
        from datetime import date, timedelta

        from pipeline.fetch import power

        d0 = date.fromisoformat(scenes[0].date) - timedelta(days=12)
        d1 = min(date.fromisoformat(scenes[-1].date), date.today())
        rain = power.fetch_rain(cfg["aois"][cfg["aoi"]]["bbox"], d0, d1)
        to_json.write_json(rain, rain_path, compact=True)
        log.info(
            "wrote %s (%d days, %d with data)", rain_path, len(rain["dates"]), sum(v is not None for v in rain["mm"])
        )
    except Exception as e:
        log.warning("rain (NASA POWER) not updated: %s", e)

    token = nisar.load_token()
    failed: list[str] = []
    no_pol: list[str] = []
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
        except KeyError as e:  # the product lacks a polarization (other acquisition mode): leave the date out
            log.warning("%s: product has no %s, date left out: %s", s.date, "/".join(nisar_cfg["polarizations"]), e)
            no_pol.append(s.date)
            continue
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
    if no_pol:
        scenes = [s for s in scenes if s.date not in no_pol]
        nisar.write_manifest(scenes, manifest)
        log.warning("manifest rewritten without %s (%d scenes)", ", ".join(no_pol), len(scenes))
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
    scenes = nisar.read_manifest(manifest_path(cfg))
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
    # forest-like on EVERY baseline date: a crop or tall pasture can match forest HV on one wet-season date
    forest_like = np.nanmin(stack[: det["baseline_dates"]], axis=0) >= det["min_baseline_db"]
    delta = stack - base[None]
    del stack
    log.info(
        "radar forest-like on all baseline dates (normalized HV >= %s dB): %.0f%% of the mask",
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
        "count": 3,
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
        d_at = np.take_along_axis(delta, np.clip(first, 0, None)[None].astype(np.int64), axis=0)[0]
        drop = np.where(first >= 0, np.round(np.nan_to_num(d_at) * 100), -32768).astype(np.int16)
        dst.write(drop, 3)
        dst.set_band_description(1, "first_detection_date_index")
        dst.set_band_description(2, "forest_mask")
        dst.set_band_description(3, "drop_at_detection_db_x100")
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
    with rasterio.open(
        out / "dist_alert.tif",
        "w",
        driver="GTiff",
        width=shape_[1],
        height=shape_[0],
        count=1,
        dtype="uint8",
        crs=crs,
        transform=transform,
        compress="deflate",
    ) as dst:
        dst.write(alert.astype(np.uint8), 1)

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
    prefix = cfg["zone"]["prefix"]
    web_data = Path(cfg["paths"]["web_data"]) / prefix  # zone folder; rgb paths in index.json stay relative to the root
    exp = cfg["export"]
    scenes = nisar.read_manifest(manifest_path(cfg))

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

    # Quality gate: a whole-scene jump of several dB in the forest level is a product problem, not a change
    from rasterio.transform import from_bounds

    from pipeline.process import water

    gw, gh = rgb_png.grid_4326(bbox, exp["rgb_res_deg"])
    forest_g = worldcover.cached_forest_mask(
        interim / aoi_id / "forest_worldcover2021_rgbgrid.tif", bbox, from_bounds(*bbox, gw, gh), (gh, gw), "EPSG:4326"
    )
    kept = list(channels)
    levels = [float(np.nanmedian(channels[d]["hv_db"][forest_g])) if forest_g.any() else float("nan") for d in kept]
    med = float(np.nanmedian(levels))
    excluded = []
    for i in water.bad_dates(levels, cfg["quality"]["max_ref_deviation_db"]):
        d = kept[i]
        reason = f"forest HV median {levels[i]:.1f} dB vs zone median {med:.1f} dB (product problem)"
        log.warning("%s: excluded by the quality gate: %s", d, reason)
        excluded.append({"date": d, "reason": reason})
        del channels[d]

    pooled = {c: np.concatenate([ch[c].ravel() for ch in channels.values()]) for c in rgb_png.CHANNELS}
    stretch = rgb_png.fit_stretch(pooled, *exp["rgb_percentiles"])
    rgb_png.save_stretch(stretch, interim / aoi_id / "rgb_stretch.json")
    log.info("RGB stretch (dB) over %d dates: %s", len(channels), stretch)

    exported = []
    water_rows: list[dict[str, Any]] = []
    for s in scenes:
        if s.date not in channels:
            continue
        rel = f"rgb/{s.date}.webp"
        rgb_png.write_webp(rgb_png.to_rgba(channels[s.date], stretch), web_data / rel, exp["rgb_webp_quality"])
        log.info("%s: wrote %s (%.0f KB)", s.date, web_data / rel, (web_data / rel).stat().st_size / 1e3)
        entry = {**asdict(s), "rgb": prefix + rel}
        if cfg["zone"]["kind"] == "water":
            classes = water.classify(channels[s.date]["hh_db"], channels[s.date]["hv_db"], **cfg["water"])
            wrel = f"water/{s.date}.png"
            (web_data / "water").mkdir(parents=True, exist_ok=True)
            from PIL import Image

            Image.fromarray(water.class_rgba(classes)).save(web_data / wrel, optimize=True)
            areas = water.class_areas_ha(classes, water.pixel_area_ha(bbox, classes.shape))
            water_rows.append({"date": s.date, **areas})
            entry["water"] = prefix + wrel
        exported.append(entry)

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

    import json

    summary_path = interim / aoi_id / "detection_summary.json"
    summary = None
    if cfg["zone"]["kind"] != "water" and summary_path.exists():
        summary = json.loads(summary_path.read_text())
        hex_feats = export_hexes(interim / aoi_id, bbox, exp["hex_width_m"])
        to_json.write_json(
            {"type": "FeatureCollection", "features": hex_feats}, web_data / "polygons.geojson", compact=True
        )
        summary["n_hexes"] = len(hex_feats)
        summary["hex_width_m"] = exp["hex_width_m"]
        log.info(
            "wrote polygons.geojson as %d hexagons of %s m (from %d exact polygons, kept in data/interim only)",
            len(hex_feats),
            exp["hex_width_m"],
            summary["n_polygons"],
        )
    elif cfg["zone"]["kind"] != "water":
        log.warning("no detection yet (run --stage process): index.json will report 0 polygons")
    val_path = interim / aoi_id / "validation_summary.json"
    if summary is not None and val_path.exists():
        summary["validation"] = json.loads(val_path.read_text())

    rain_src = interim / aoi_id / "rain.json"
    if rain_src.exists():
        import shutil

        shutil.copyfile(rain_src, web_data / "rain.json")
        log.info("copied rain.json")
    else:
        log.warning("no rain.json yet (run --stage fetch)")

    index = to_json.build_index(aoi_id, bbox, cfg["nisar"], exported, cfg["detection"], summary=summary)
    index["zone"] = {k: cfg["zone"][k] for k in ("kind", "chapter", "name", "primary")}
    index["excluded_scenes"] = excluded
    if water_rows:
        to_json.write_json(
            {
                "dates": [r["date"] for r in water_rows],
                "open_water_ha": [r["open_water_ha"] for r in water_rows],
                "flooded_veg_ha": [r["flooded_veg_ha"] for r in water_rows],
                "thresholds_db": cfg["water"],
                "status": "estimado",
                "source": f"{to_json.NISAR_SOURCE}, HH and HV",
            },
            web_data / "water.json",
        )
        index["water"] = {"json": prefix + "water.json", "status": "estimado"}
        index["provenance"].append(
            {"layer": "water", "type": "satellite", "source": f"CLEAR water classes on {to_json.NISAR_SOURCE}"}
        )
        log.info(
            "water: open water %s ha, flooded vegetation %s ha (per date)",
            [round(r["open_water_ha"]) for r in water_rows],
            [round(r["flooded_veg_ha"]) for r in water_rows],
        )
    to_json.write_json(index, web_data / "index.json")
    log.info("wrote %s (%d scenes)", web_data / "index.json", len(exported))
    return True


def export_hexes(out: Path, bbox: list[float], width_m: float) -> list[dict[str, Any]]:
    """Hexagon features from the exact polygons' pixels (polygons >= min area only); see pipeline/export/hexes.py."""
    import json

    import rasterio
    from rasterio.features import rasterize
    from rasterio.warp import transform_bounds, transform_geom
    from shapely.geometry import shape

    from pipeline.export import hexes

    with rasterio.open(out / "detection.tif") as d:
        first, drop = d.read(1), d.read(3).astype(np.float32) / 100
        transform, crs, shape_ = d.transform, d.crs.to_string(), (d.height, d.width)
        dates = json.loads(d.tags()["dates"])
    exact = json.loads((out / "polygons.geojson").read_text())["features"]
    if not exact:
        return []
    geoms = [(shape(transform_geom("EPSG:4326", crs, f["geometry"])), 1) for f in exact]
    inside = rasterize(geoms, out_shape=shape_, transform=transform, fill=0, dtype="uint8").astype(bool)
    alert = None
    if (out / "dist_alert.tif").exists():
        with rasterio.open(out / "dist_alert.tif") as a:
            alert = a.read(1).astype(bool)
    xmin, ymin, _, _ = transform_bounds("EPSG:4326", crs, *bbox)  # fixed grid anchor per AOI
    return hexes.aggregate(inside & (first >= 0), first, drop, alert, transform, crs, dates, width_m, (xmin, ymin))


def write_zones_index(cfg: dict[str, Any]) -> None:
    """web/public/data/zones.json: every configured zone that has been exported, with where to find its files."""
    import json

    root = Path(cfg["paths"]["web_data"])
    zones = []
    for aoi_id in zone_ids(cfg):
        z = zone_cfg(cfg, aoi_id)["zone"]
        idx_path = root / z["prefix"] / "index.json"
        if not idx_path.exists():
            continue
        idx = json.loads(idx_path.read_text())
        det = idx.get("detection", {})
        zones.append(
            {
                "id": aoi_id,
                "name": z["name"],
                "kind": z["kind"],
                "chapter": z["chapter"],
                "primary": z["primary"],
                "path": z["prefix"],
                "bbox": idx["aoi"]["bbox"],
                "orbit": z["orbit"],
                "n_scenes": len(idx["scenes"]),
                "first_date": idx["scenes"][0]["date"] if idx["scenes"] else None,
                "last_date": idx["scenes"][-1]["date"] if idx["scenes"] else None,
                "n_polygons": det.get("n_polygons", 0) if z["kind"] != "water" else None,
                "area_ha_total": det.get("area_ha_total", 0) if z["kind"] != "water" else None,
            }
        )
    to_json.write_json({"schema_version": to_json.SCHEMA_VERSION, "zones": zones}, root / "zones.json")
    log.info("wrote %s (%d zones)", root / "zones.json", len(zones))


def run_zone(cfg: dict[str, Any], stages: tuple[str, ...], args: argparse.Namespace) -> bool:
    kind = cfg["zone"]["kind"]
    log.info("=== zone %s (%s, chapter %s)", cfg["aoi"], kind, cfg["zone"]["chapter"])
    for stage in stages:
        if stage in ("process", "validate") and kind == "water":
            log.info("%s: skipped for a water zone (no water classification yet)", stage)
            continue
        if stage == "fetch":
            ok = stage_fetch(cfg, args.dates)
        elif stage == "process":
            ok = stage_process(cfg, args.ignore_sanity)
        elif stage == "validate":
            ok = stage_validate(cfg)
        else:
            ok = stage_export(cfg)
        if not ok:
            log.error("zone %s: stage %s failed", cfg["aoi"], stage)
            return False
    return True


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--config", type=Path, default=Path("pipeline/config.yaml"))
    parser.add_argument("--stage", choices=(*STAGES, "all"), default="all")
    parser.add_argument("--date", action="append", dest="dates", metavar="YYYY-MM-DD", help="only crop these dates")
    parser.add_argument("--ignore-sanity", action="store_true", help="continue after a failed sanity check")
    parser.add_argument("--aoi", action="append", dest="aois", metavar="ID", help="only these zones (default: all)")
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
    ids = args.aois or zone_ids(cfg)
    unknown = [i for i in ids if i not in cfg["aois"]]
    if unknown:
        log.error("unknown zone(s): %s", ", ".join(unknown))
        return 2
    failed = [i for i in ids if not run_zone(zone_cfg(cfg, i), stages, args)]
    if "export" in stages:
        write_zones_index(cfg)
    if failed:
        log.error("zones with errors: %s", ", ".join(failed))
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())

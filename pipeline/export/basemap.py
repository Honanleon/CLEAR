# Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
"""Base map of the web app from Natural Earth 1:10m (public domain, NACIS, US): no OpenStreetMap, no tile server.

Writes small GeoJSON files to web/public/basemap/ (countries, departments, lakes, rivers, roads, labels) and the
reference towns of the zone panel to web/src/map/places.json. Run once when the base map changes:

    python -m pipeline.export.basemap <folder with the unzipped ne_10m_* layers>

Layers used (https://www.naturalearthdata.com/downloads/10m-...): admin_0_countries, admin_1_states_provinces,
lakes, rivers_lake_centerlines, roads, populated_places.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

BOX = (-67.0, -31.0, -50.0, -16.0)  # MAX_BOUNDS of web/src/map/radar-map.ts
SIMPLIFY_DEG = 0.004  # ~400 m: enough for a country-scale grey map
DIGITS = 4
SOURCE = "Natural Earth 1:10m v5.1 (public domain)"


def _round(obj):
    if isinstance(obj, float):
        return round(obj, DIGITS)
    if isinstance(obj, (list, tuple)):
        return [_round(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _round(v) for k, v in obj.items()}
    return obj


def _clean(v):
    """A property value for JSON: NaN (missing) -> None."""
    return None if isinstance(v, float) and v != v else v


def _write(gdf, props: dict[str, str], path: Path) -> int:
    """Write gdf with the renamed properties `props` (source column -> output name) as compact GeoJSON."""
    feats = []
    for _, row in gdf.iterrows():
        if row.geometry is None or row.geometry.is_empty:
            continue
        geom = json.loads(json.dumps(row.geometry.__geo_interface__))
        # missing values (pandas NaN, e.g. unnamed lakes) become null: NaN is not valid JSON and the browser rejects the file
        feats.append({"type": "Feature", "properties": {o: _clean(row[s]) for s, o in props.items()}, "geometry": _round(geom)})
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    path.write_text(text, encoding="utf-8")
    return len(text.encode("utf-8"))


def _clip(gdf, simplify: bool = True):
    from shapely.geometry import box

    b = box(*BOX)
    gdf = gdf[gdf.intersects(b)].copy()
    gdf["geometry"] = gdf.geometry.intersection(b)
    if simplify:
        gdf["geometry"] = gdf.geometry.simplify(SIMPLIFY_DEG, preserve_topology=True)
    return gdf[~gdf.geometry.is_empty]


def build(ne: Path, web: Path) -> dict[str, int]:
    import geopandas as gpd
    from shapely.geometry import Point

    def read(name: str):
        return gpd.read_file(ne / name / f"{name}.shp")

    out = web / "public" / "basemap"
    sizes = {}

    countries = _clip(read("ne_10m_admin_0_countries"))
    sizes["countries"] = _write(
        countries, {"ADM0_A3": "iso", "NAME_ES": "name_es", "NAME_EN": "name_en"}, out / "countries.geojson"
    )

    a1 = read("ne_10m_admin_1_states_provinces")
    departments = _clip(a1[a1["admin"] == "Paraguay"])
    sizes["departments"] = _write(departments, {"name": "name"}, out / "departments.geojson")

    sizes["lakes"] = _write(_clip(read("ne_10m_lakes")), {"name": "name"}, out / "lakes.geojson")
    sizes["rivers"] = _write(
        _clip(read("ne_10m_rivers_lake_centerlines")), {"name": "name", "scalerank": "rank"}, out / "rivers.geojson"
    )

    roads = read("ne_10m_roads")
    roads = _clip(roads[roads["type"].isin(["Major Highway", "Road"])])
    sizes["roads"] = _write(roads, {"type": "type"}, out / "roads.geojson")

    # labels: neighbour countries and Paraguay's departments at Natural Earth's own label points
    labels = []
    for _, r in countries.iterrows():
        if r["ADM0_A3"] in ("PRY", "BOL", "BRA", "ARG"):
            # Paraguay at Natural Earth's label point; neighbours inside the part of them that the map shows
            if r["ADM0_A3"] == "PRY":
                xy = [r["LABEL_X"], r["LABEL_Y"]]
            else:
                p = r.geometry.representative_point()
                xy = [p.x, p.y]
            labels.append({"kind": "country", "name_es": r["NAME_ES"], "name_en": r["NAME_EN"], "lonlat": xy})
    for _, r in departments.iterrows():
        if r["name"] != "Asunción":  # the capital is labelled as a city
            labels.append(
                {
                    "kind": "department",
                    "name_es": r["name"],
                    "name_en": r["name"],
                    "lonlat": [r["longitude"], r["latitude"]],
                }
            )

    # towns: every Natural Earth populated place in Paraguay (capitals and towns only; no villages or communities)
    pp = read("ne_10m_populated_places")
    pp = pp[pp["ADM0NAME"] == "Paraguay"].sort_values("SCALERANK")
    towns = []
    for _, r in pp.iterrows():
        p: Point = r.geometry
        towns.append({"name": r["NAME"], "lonlat": [p.x, p.y], "rank": int(r["SCALERANK"])})
        labels.append(
            {
                "kind": "town",
                "name_es": r["NAME"],
                "name_en": r["NAME"],
                "lonlat": [p.x, p.y],
                "rank": int(r["SCALERANK"]),
            }
        )

    text = json.dumps(_round(labels), ensure_ascii=False, separators=(",", ":"))
    (out / "labels.json").write_text(text, encoding="utf-8")
    sizes["labels"] = len(text.encode("utf-8"))

    places = web / "src" / "map" / "places.json"
    places.write_text(
        "[\n" + ",\n".join("  " + json.dumps(_round(t), ensure_ascii=False) for t in towns) + "\n]\n", encoding="utf-8"
    )
    sizes["places"] = places.stat().st_size
    return sizes


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("ne", type=Path, help="folder with the unzipped ne_10m_* layers")
    ap.add_argument("--web", type=Path, default=Path("web"))
    args = ap.parse_args()
    for k, v in build(args.ne, args.web).items():
        print(f"{k:12s} {v / 1024:7.1f} KB")


if __name__ == "__main__":
    main()

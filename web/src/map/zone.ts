// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Plain-language facts about a tapped spot: nearest town and direction, size in soccer fields,
// echo drop as a percentage, and clearings nearby. Pure functions; the panel lives in index.ts.
// Town coordinates come from Natural Earth 1:10m populated places (public domain; pipeline/export/basemap.py).

import type { LngLat as XY, PolygonCollection, PolygonGeometry } from "../data";
import places from "./places.json";

/** A FIFA pitch, 105 m × 68 m, in hectares. */
export const SOCCER_FIELD_HA = 0.714;
const R_KM = 6371;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: XY, b: XY): number {
  const dLat = rad(b[1] - a[1]);
  const dLon = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

export type Dir = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

/** Compass direction of `to` as seen from `from`. */
export function direction(from: XY, to: XY): Dir {
  const y = Math.sin(rad(to[0] - from[0])) * Math.cos(rad(to[1]));
  const x = Math.cos(rad(from[1])) * Math.sin(rad(to[1])) - Math.sin(rad(from[1])) * Math.cos(rad(to[1])) * Math.cos(rad(to[0] - from[0]));
  const deg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
  return (["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const)[Math.round(deg / 45) % 8] as Dir;
}

/** Reference towns: Natural Earth populated places of Paraguay (pipeline/export/basemap.py). */
const TOWNS = (places as { name: string; lonlat: number[] }[]).map((p) => ({ name: p.name, lonlat: [p.lonlat[0], p.lonlat[1]] as XY }));

export function nearestTown(pt: XY): { name: string; km: number; dir: Dir } {
  let best = { name: "", km: Infinity, dir: "n" as Dir };
  for (const p of TOWNS) {
    const km = distanceKm(p.lonlat, pt);
    if (km < best.km) best = { name: p.name, km, dir: direction(p.lonlat, pt) };
  }
  return best;
}

export function center(geom: PolygonGeometry): XY {
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
}

/** Clearings whose centre is within `km` of the point, up to scene `upTo`. */
export function nearby(fc: PolygonCollection, pt: XY, km: number, upTo: number, exclude?: number): { n: number; ha: number } {
  let n = 0;
  let ha = 0;
  for (const f of fc.features) {
    if (f.id === exclude || (f.properties.t ?? 0) > upTo) continue;
    if (distanceKm(center(f.geometry), pt) <= km) {
      n++;
      ha += f.properties.area_ha;
    }
  }
  return { n, ha };
}

/** A drop of `db` decibels as "percent less signal" (−3 dB ≈ 50 %). */
export function dropPercent(db: number): number {
  return (1 - 10 ** (db / 10)) * 100;
}

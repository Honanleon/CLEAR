// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Hexagon aggregation of the clearing polygons, computed in the browser (no change to the data
// contract). The study area is tiled with pointy-top hexagons (default radius 2 km ≈ 1,040 ha).
// Each polygon is sampled on a regular point grid; every sample is assigned to the hexagon that
// contains it and the polygon's area_ha is shared out in proportion. Result: hectares cleared per
// hexagon and per scene date, so the map can colour the cells by "hectares cleared up to date t".

import type { BBox, LngLat as XY, PolygonCollection, PolygonGeometry } from "../data";

export interface HexCell {
  id: number;
  /** Centre inside the study area. Edge cells (centre outside, hexagon overlapping it) exist so no clearing is lost; they are drawn only when they hold clearing. */
  inside: boolean;
  center: XY;
  ring: XY[];
  areaHa: number;
  /** Hectares first detected at each scene index. */
  addedHa: number[];
  /** Cumulative hectares up to each scene index. */
  cumHa: number[];
  polyIds: number[];
  firstT: number | null;
}

export interface HexGrid {
  radiusM: number;
  cells: HexCell[];
  /** Only the cells with some clearing, with a{t} = cumulative ha at scene t. */
  data: GeoJSON;
  /** Every cell of the study area (outline grid). */
  outline: GeoJSON;
  /** Number of cells whose first clearing is at each scene index. */
  newCells: number[];
  /** Hexagons drawn on the map: centre inside the study area, or holding clearing. */
  shownCount: number;
  locate(lon: number, lat: number): HexCell | null;
}

type GeoJSON = { type: "FeatureCollection"; features: unknown[] };

const SQRT3 = Math.sqrt(3);

/** Hexagon radius used across the site: 2 km ≈ 1,040 ha per hexagon, big enough to read the clearing pattern at a glance. */
export const HEX_RADIUS_M = 2000;

export function buildHexGrid(aoi: BBox, polygons: PolygonCollection, nScenes: number, radiusM = HEX_RADIUS_M): HexGrid {
  const R = radiusM;
  const lon0 = (aoi[0] + aoi[2]) / 2;
  const lat0 = (aoi[1] + aoi[3]) / 2;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_574;
  const toXY = (lon: number, lat: number): XY => [(lon - lon0) * kx, (lat - lat0) * ky];
  const toLL = (x: number, y: number): XY => [lon0 + x / kx, lat0 + y / ky];

  const [xmin, ymin] = toXY(aoi[0], aoi[1]);
  const [xmax, ymax] = toXY(aoi[2], aoi[3]);
  const center = (q: number, r: number): XY => [R * SQRT3 * (q + r / 2), R * 1.5 * r];

  const cells: HexCell[] = [];
  const byKey = new Map<string, HexCell>();
  const areaHa = ((3 * SQRT3) / 2) * R * R * 1e-4;
  const rMin = Math.floor(ymin / (1.5 * R)) - 1;
  const rMax = Math.ceil(ymax / (1.5 * R)) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor(xmin / (R * SQRT3) - r / 2) - 1;
    const qMax = Math.ceil(xmax / (R * SQRT3) - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++) {
      const [cx, cy] = center(q, r);
      // keep every hexagon that overlaps the study area (centre within one radius of it)
      if (cx < xmin - R || cx > xmax + R || cy < ymin - R || cy > ymax + R) continue;
      const inside = cx >= xmin && cx <= xmax && cy >= ymin && cy <= ymax;
      const ring: XY[] = [];
      for (let i = 0; i <= 6; i++) {
        const a = ((60 * (i % 6) - 30) * Math.PI) / 180;
        ring.push(toLL(cx + R * Math.cos(a), cy + R * Math.sin(a)));
      }
      const cell: HexCell = {
        id: cells.length,
        inside,
        center: toLL(cx, cy),
        ring,
        areaHa,
        addedHa: new Array(nScenes).fill(0),
        cumHa: new Array(nScenes).fill(0),
        polyIds: [],
        firstT: null,
      };
      cells.push(cell);
      byKey.set(`${q},${r}`, cell);
    }
  }

  const locateXY = (x: number, y: number): HexCell | null => {
    // axial coordinates of a point, then cube rounding
    const fq = ((SQRT3 / 3) * x - y / 3) / R;
    const fr = ((2 / 3) * y) / R;
    const fs = -fq - fr;
    let q = Math.round(fq);
    let r = Math.round(fr);
    const s = Math.round(fs);
    const dq = Math.abs(q - fq);
    const dr = Math.abs(r - fr);
    const ds = Math.abs(s - fs);
    if (dq > dr && dq > ds) q = -r - s;
    else if (dr > ds) r = -q - s;
    return byKey.get(`${q},${r}`) ?? null;
  };

  // share each polygon's area among the cells it covers
  for (const f of polygons.features) {
    const t = Math.min(nScenes - 1, Math.max(0, f.properties.t ?? 0));
    const rings = ringsOf(f.geometry).map((ring) => ring.map(([lon, lat]) => toXY(lon, lat)));
    let [bx0, by0, bx1, by1] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const ring of rings) {
      for (const [x, y] of ring) {
        bx0 = Math.min(bx0, x);
        by0 = Math.min(by0, y);
        bx1 = Math.max(bx1, x);
        by1 = Math.max(by1, y);
      }
    }
    const step = Math.min(100, Math.max(15, Math.sqrt(f.properties.area_ha * 1e4) / 10));
    const counts = new Map<HexCell, number>();
    let total = 0;
    for (let y = by0 + step / 2; y < by1; y += step) {
      for (let x = bx0 + step / 2; x < bx1; x += step) {
        if (!insideRings(x, y, rings)) continue;
        const cell = locateXY(x, y);
        if (!cell) continue;
        counts.set(cell, (counts.get(cell) ?? 0) + 1);
        total++;
      }
    }
    if (total === 0) {
      const cell = locateXY((bx0 + bx1) / 2, (by0 + by1) / 2);
      if (cell) {
        counts.set(cell, 1);
        total = 1;
      }
    }
    for (const [cell, n] of counts) {
      cell.addedHa[t] = (cell.addedHa[t] ?? 0) + (f.properties.area_ha * n) / total;
      if (typeof f.id === "number") cell.polyIds.push(f.id);
    }
  }

  const newCells = new Array(nScenes).fill(0) as number[];
  const dataFeatures: unknown[] = [];
  for (const cell of cells) {
    let acc = 0;
    for (let t = 0; t < nScenes; t++) {
      acc += cell.addedHa[t] ?? 0;
      cell.cumHa[t] = acc;
      if (cell.firstT === null && acc > 0) cell.firstT = t;
    }
    if (cell.firstT === null) continue;
    newCells[cell.firstT] = (newCells[cell.firstT] ?? 0) + 1;
    const props: Record<string, number> = { id: cell.id, area: Math.round(cell.areaHa) };
    cell.cumHa.forEach((v, t) => (props[`a${t}`] = Math.round(v * 10) / 10));
    dataFeatures.push({ type: "Feature", id: cell.id, properties: props, geometry: { type: "Polygon", coordinates: [cell.ring] } });
  }

  const shown = cells.filter((c) => c.inside || c.firstT !== null);
  return {
    radiusM: R,
    cells,
    shownCount: shown.length,
    data: { type: "FeatureCollection", features: dataFeatures },
    outline: {
      type: "FeatureCollection",
      features: shown.map((c) => ({ type: "Feature", id: c.id, properties: { id: c.id }, geometry: { type: "Polygon", coordinates: [c.ring] } })),
    },
    newCells,
    locate: (lon, lat) => {
      if (lon < aoi[0] || lon > aoi[2] || lat < aoi[1] || lat > aoi[3]) return null;
      const [x, y] = toXY(lon, lat);
      return locateXY(x, y);
    },
  };
}

function ringsOf(geom: PolygonGeometry): XY[][] {
  return geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
}

/** Even-odd rule over all rings: holes and multipolygons work without special cases. */
function insideRings(x: number, y: number, rings: XY[][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i] as XY;
      const [xj, yj] = ring[j] as XY;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

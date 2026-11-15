// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Hexagon aggregation of the clearing polygons, computed in the browser (no change to the data
// contract). Paraguay is tiled with pointy-top hexagons (default radius 40.8 km ≈ 432,500 ha); only the
// hexagons that overlap the study area carry radar data, the rest of the country is an empty grid.
// Each polygon is sampled on a regular point grid; every sample is assigned to the hexagon that
// contains it and the polygon's area_ha is shared out in proportion. Result: hectares cleared per
// hexagon and per scene date, so the map can colour the cells by "hectares cleared up to date t".

import type { BBox, LngLat as XY, PolygonCollection, PolygonGeometry } from "../data";

export interface HexCell {
  id: number;
  /** Overlaps the study area, so it has radar data. The other cells only complete the grid over Paraguay: no data, not "no clearing". */
  studied: boolean;
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
  /** Every cell (outline grid); property s = 1 when the cell has radar data. */
  outline: GeoJSON;
  /** Number of cells whose first clearing is at each scene index. */
  newCells: number[];
  /** Hexagons that overlap the study area (the ones with radar data). */
  studiedCount: number;
  /** The studied hexagon at a point, or null (outside the study area: no data). */
  locate(lon: number, lat: number): HexCell | null;
}

export type GeoJSON = { type: "FeatureCollection"; features: unknown[] };

const SQRT3 = Math.sqrt(3);

/** Hexagon radius used across the site: 40.8 km ≈ 432,500 ha (≈ 4,300 km²) per hexagon, big enough to see from the whole-country view. */
export const HEX_RADIUS_M = 40800;

/** Mini hexagons drawn inside the big ones when zoomed in: 2 km ≈ 1,040 ha, over the study area only. */
export const MINI_HEX_RADIUS_M = 2000;

/** Map zoom from which the mini hexagons replace the big ones (cross-fade ±0.4 around it). */
export const MINI_ZOOM = 8.4;

/** One study area or several (zones.json): the first one anchors the projection, so every grid lines up. */
type Areas = BBox | BBox[];
const areasOf = (a: Areas): BBox[] => (typeof a[0] === "number" ? [a as BBox] : (a as BBox[]));

/** The study areas in projected metres, and a test "does a hexagon at (cx, cy) of radius R overlap one?". */
function studiedTest(areas: BBox[], toXY: (lon: number, lat: number) => XY) {
  const boxes = areas.map((b) => [...toXY(b[0], b[1]), ...toXY(b[2], b[3])] as [number, number, number, number]);
  return {
    boxes,
    overlaps: (cx: number, cy: number, R: number) => boxes.some(([x0, y0, x1, y1]) => !(cx < x0 - R || cx > x1 + R || cy < y0 - R || cy > y1 + R)),
  };
}

/**
 * @param aoi the study area, or several (one per zone): hexagons that overlap any of them carry data.
 * @param country optional outer ring (lon, lat) of the country: hexagons whose centre falls inside it
 * are added around the study areas, with no data, so the grid covers the whole map.
 */
export function buildHexGrid(aoi: Areas, polygons: PolygonCollection, nScenes: number, radiusM = HEX_RADIUS_M, country?: XY[]): HexGrid {
  const R = radiusM;
  const areas = areasOf(aoi);
  const { toXY, toLL } = projection(areas[0]!);
  const { boxes, overlaps } = studiedTest(areas, toXY);
  const countryXY = country?.map(([lon, lat]) => toXY(lon, lat));
  // extent of the loop: the study areas, plus the country when given
  let [ex0, ey0, ex1, ey1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x0, y0, x1, y1] of boxes) {
    ex0 = Math.min(ex0, x0);
    ey0 = Math.min(ey0, y0);
    ex1 = Math.max(ex1, x1);
    ey1 = Math.max(ey1, y1);
  }
  for (const [x, y] of countryXY ?? []) {
    ex0 = Math.min(ex0, x);
    ey0 = Math.min(ey0, y);
    ex1 = Math.max(ex1, x);
    ey1 = Math.max(ey1, y);
  }
  const center = (q: number, r: number): XY => [R * SQRT3 * (q + r / 2), R * 1.5 * r];

  const cells: HexCell[] = [];
  const byKey = new Map<string, HexCell>();
  const areaHa = ((3 * SQRT3) / 2) * R * R * 1e-4;
  const rMin = Math.floor(ey0 / (1.5 * R)) - 1;
  const rMax = Math.ceil(ey1 / (1.5 * R)) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor(ex0 / (R * SQRT3) - r / 2) - 1;
    const qMax = Math.ceil(ex1 / (R * SQRT3) - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++) {
      const [cx, cy] = center(q, r);
      // every hexagon that overlaps a study area (centre within one radius of it) has data
      const studied = overlaps(cx, cy, R);
      if (!studied && !(countryXY && insideRings(cx, cy, [countryXY]))) continue;
      const ring = hexRing(cx, cy, R, toLL);
      const cell: HexCell = {
        id: cells.length,
        studied,
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

  return {
    radiusM: R,
    cells,
    studiedCount: cells.filter((c) => c.studied).length,
    data: { type: "FeatureCollection", features: dataFeatures },
    outline: {
      type: "FeatureCollection",
      features: cells.map((c) => ({ type: "Feature", id: c.id, properties: { id: c.id, s: c.studied ? 1 : 0 }, geometry: { type: "Polygon", coordinates: [c.ring] } })),
    },
    newCells,
    locate: (lon, lat) => {
      const [x, y] = toXY(lon, lat);
      const cell = locateXY(x, y);
      return cell?.studied ? cell : null;
    },
  };
}

/** Local equirectangular projection centred on the study area, in metres; every grid of the site uses it, so grids line up. */
function projection(aoi: BBox) {
  const lon0 = (aoi[0] + aoi[2]) / 2;
  const lat0 = (aoi[1] + aoi[3]) / 2;
  const kx = 111_320 * Math.cos((lat0 * Math.PI) / 180);
  const ky = 110_574;
  return {
    toXY: (lon: number, lat: number): XY => [(lon - lon0) * kx, (lat - lat0) * ky],
    toLL: (x: number, y: number): XY => [lon0 + x / kx, lat0 + y / ky],
  };
}

function hexRing(cx: number, cy: number, R: number, toLL: (x: number, y: number) => XY): XY[] {
  const ring: XY[] = [];
  for (let i = 0; i <= 6; i++) {
    const a = ((60 * (i % 6) - 30) * Math.PI) / 180;
    ring.push(toLL(cx + R * Math.cos(a), cy + R * Math.sin(a)));
  }
  return ring;
}

/**
 * Outline of the hexagons of the same grid as buildHexGrid(aoi, …, radiusM) inside `view`, for the
 * rest of the country (centre inside `country`, not overlapping the study area: those have no data).
 * Used to draw the mini hexagons all over Paraguay only where the map is looking.
 */
export function hexOutlineIn(view: BBox, aoi: Areas, radiusM: number, country: XY[], maxCells = 30_000): GeoJSON {
  const R = radiusM;
  const areas = areasOf(aoi);
  const { toXY, toLL } = projection(areas[0]!);
  const { overlaps } = studiedTest(areas, toXY);
  const countryXY = country.map(([lon, lat]) => toXY(lon, lat));
  let [cx0, cy0, cx1, cy1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of countryXY) {
    cx0 = Math.min(cx0, x);
    cy0 = Math.min(cy0, y);
    cx1 = Math.max(cx1, x);
    cy1 = Math.max(cy1, y);
  }
  // the part of the view that can hold country hexagons
  const [vx0, vy0] = toXY(view[0], view[1]);
  const [vx1, vy1] = toXY(view[2], view[3]);
  const [x0, y0, x1, y1] = [Math.max(vx0, cx0), Math.max(vy0, cy0), Math.min(vx1, cx1), Math.min(vy1, cy1)];
  const features: unknown[] = [];
  if (x0 >= x1 || y0 >= y1) return { type: "FeatureCollection", features };
  if (((x1 - x0) * (y1 - y0)) / (((3 * SQRT3) / 2) * R * R) > maxCells) return { type: "FeatureCollection", features };
  const rMin = Math.floor(y0 / (1.5 * R)) - 1;
  const rMax = Math.ceil(y1 / (1.5 * R)) + 1;
  for (let r = rMin; r <= rMax; r++) {
    const qMin = Math.floor(x0 / (R * SQRT3) - r / 2) - 1;
    const qMax = Math.ceil(x1 / (R * SQRT3) - r / 2) + 1;
    for (let q = qMin; q <= qMax; q++) {
      const cx = R * SQRT3 * (q + r / 2);
      const cy = R * 1.5 * r;
      if (cx < x0 - R || cx > x1 + R || cy < y0 - R || cy > y1 + R) continue;
      if (overlaps(cx, cy, R) || !insideRings(cx, cy, [countryXY])) continue;
      features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [hexRing(cx, cy, R, toLL)] } });
    }
  }
  return { type: "FeatureCollection", features };
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

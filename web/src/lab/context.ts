// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST build only. Plain data objects the AI assistant and the expert panel use:
// - study context: the whole study area (every clearing, every date, every hexagon with clearing, validation);
// - hexagon context: one tapped hexagon in detail;
// - radar signal at any point (also offered to the expert assistant as a tool).

import { BASELINE_DATES, type Dataset, median, type PolygonCollection, type PolygonFeature, type Rain } from "../data";
import type { HexCell, HexGrid } from "../map/hexgrid";
import { center, nearestTown } from "../map/zone";

const r1 = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? null : Math.round(v * 10) / 10);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export interface Signal {
  note: string;
  point_lon_lat: [number, number];
  cell_col_row: [number, number];
  dates: string[];
  hv_db: (number | null)[];
  hh_db: (number | null)[];
  hv_baseline_db: number | null;
  hv_at_date_db: number | null;
  hv_last_db: number | null;
  hv_delta_last_minus_baseline_db: number | null;
  hv_min_db: number | null;
  hv_min_date: string | null;
  hh_baseline_db: number | null;
  hh_last_db: number | null;
}

/** HV/HH series of the 500 m cell that contains the point, or null outside the grid / without data. */
export async function signalAt(ds: Dataset, lon: number, lat: number, atDate?: string): Promise<Signal | null> {
  const grid = await ds.grid();
  const col = Math.floor((lon - grid.origin[0]) / grid.cell_deg[0]);
  const row = Math.floor((lat - grid.origin[1]) / grid.cell_deg[1]);
  if (col < 0 || row < 0 || col >= grid.nx || row >= grid.ny) return null;
  const k = row * grid.nx + col;
  const hv = grid.hv_db_x10.map((r) => (r[k] == null ? null : (r[k] as number) / 10));
  const hh = grid.hh_db_x10.map((r) => (r[k] == null ? null : (r[k] as number) / 10));
  const nn = (a: (number | null)[]) => a.filter((v): v is number => v !== null);
  if (!nn(hv).length) return null;
  const hvBase = median(nn(hv.slice(0, BASELINE_DATES)));
  const hvLast = [...hv].reverse().find((v) => v !== null) ?? null;
  const di = atDate ? grid.dates.indexOf(atDate) : -1;
  const minV = Math.min(...nn(hv));
  return {
    note: "Mean of linear gamma0 in a ~500 m cell, in dB; NOT normalized per date (detection uses per-date normalized HV per pixel).",
    point_lon_lat: [r4(lon), r4(lat)],
    cell_col_row: [col, row],
    dates: grid.dates,
    hv_db: hv,
    hh_db: hh,
    hv_baseline_db: r1(hvBase),
    hv_at_date_db: di >= 0 ? r1(hv[di]) : null,
    hv_last_db: r1(hvLast),
    hv_delta_last_minus_baseline_db: hvBase !== null && hvLast !== null ? r1(hvLast - hvBase) : null,
    hv_min_db: r1(minV),
    hv_min_date: grid.dates[hv.indexOf(minV)] ?? null,
    hh_baseline_db: r1(median(nn(hh.slice(0, BASELINE_DATES)))),
    hh_last_db: r1([...hh].reverse().find((v) => v !== null) ?? null),
  };
}

function validationOf(ds: Dataset, fc: PolygonCollection) {
  const v = ds.index.validation;
  const checked = fc.features.filter((f) => f.properties.dist_confirmed !== null);
  return {
    reference: v.reference,
    agreement_pct_spatial: v.agreement_pct,
    coverage_pct_spatial: v.coverage_pct,
    agreement_pct_24d: v.agreement_pct_24d ?? null,
    coverage_pct_24d: v.coverage_pct_24d ?? null,
    median_radar_lead_days: v.median_lead_days ?? null,
    polygons_confirmed: v.polygons_confirmed ?? checked.filter((f) => f.properties.dist_confirmed === true).length,
    polygons_total: v.polygons_total ?? checked.length,
  };
}

export type StudyContext = ReturnType<typeof buildStudyContextSync>;

/** Rain per month and in the 6 days before each radar pass (soil moisture raises HH). */
export function rainSummary(ds: Dataset, rain: Rain | null) {
  if (!rain) return null;
  const monthly: Record<string, number> = {};
  rain.dates.forEach((d, i) => (monthly[d.slice(0, 7)] = (monthly[d.slice(0, 7)] ?? 0) + (rain.mm[i] ?? 0)));
  const idx = new Map(rain.dates.map((d, i) => [d, i]));
  return {
    source: `${rain.source} (modeled daily precipitation, mm), at lon/lat ${rain.point.join(", ")}`,
    monthly_mm: Object.entries(monthly).map(([month, mm]) => ({ month, mm: r1(mm) })),
    mm_in_6_days_before_each_pass: ds.index.scenes.map((s) => {
      const i = idx.get(s.date);
      let mm = 0;
      if (i !== undefined) for (let k = Math.max(0, i - 6); k <= i; k++) mm += rain.mm[k] ?? 0;
      return { date: s.date, mm: i === undefined ? null : r1(mm) };
    }),
  };
}

function buildStudyContextSync(ds: Dataset, fc: PolygonCollection, hex: HexGrid, rain: Rain | null) {
  const { index } = ds;
  const scenes = index.scenes;
  const perDate = scenes.map((s, i) => {
    const polys = fc.features.filter((f) => (f.properties.t ?? 0) === i);
    return { date: s.date, maturity: s.maturity, crid: s.crid, new_ha: r1(polys.reduce((a, f) => a + f.properties.area_ha, 0)) ?? 0, new_polygons: polys.length };
  });
  let cum = 0;
  const perDateCum = perDate.map((d) => ((cum += d.new_ha), { ...d, cumulative_ha: r1(cum) ?? 0 }));
  return {
    study_area: { id: index.aoi.id, bbox: index.aoi.bbox, nisar: index.nisar, generated_at: index.generated_at, schema_version: index.schema_version },
    detection: index.detection,
    validation: validationOf(ds, fc),
    dates: perDateCum,
    clearings: fc.features.map((f) => {
      const c = center(f.geometry);
      return {
        id: f.properties.id,
        first_date: f.properties.first_date,
        area_ha: f.properties.area_ha,
        mean_hv_drop_db: f.properties.mean_drop_db,
        optical_alert: f.properties.dist_confirmed,
        center_lon_lat: [r4(c[0]), r4(c[1])],
        hexagon_id: hex.locate(c[0], c[1])?.id ?? null,
      };
    }),
    hexagons_with_clearing: hex.cells
      .filter((c) => c.firstT !== null)
      .map((c) => ({
        id: c.id,
        center_lon_lat: [r4(c.center[0]), r4(c.center[1])],
        cleared_ha: r1(c.cumHa[scenes.length - 1]),
        first_date: scenes[c.firstT ?? 0]?.date,
      })),
    hexagons_total: hex.cells.length,
    hexagon_area_ha: Math.round(hex.cells[0]?.areaHa ?? 0),
    rainfall: rainSummary(ds, rain) ?? "no rainfall data",
  };
}

export async function buildStudyContext(ds: Dataset, hex: HexGrid): Promise<StudyContext> {
  const [fc, rain] = await Promise.all([ds.polygons(), ds.rain()]);
  return buildStudyContextSync(ds, fc, hex, rain);
}

export interface HexContext {
  timeline_date: string;
  hexagon: {
    id: number;
    center_lon_lat: [number, number];
    area_ha: number;
    nearest_town: { name: string; km: number; direction: string };
    cleared_ha_up_to_timeline_date: number;
    cleared_ha_total: number;
    cleared_pct_of_hexagon_total: number;
    first_detection_date: string | null;
    cleared_ha_by_date: { date: string; ha: number }[];
  };
  clearings: { id: string; first_date: string; polygon_area_ha: number; mean_hv_drop_db: number; optical_alert: boolean | null }[];
  scene_of_first_detection: { date: string; id: string; maturity: string; crid: string } | null;
  radar_signal_center_cell: Signal | null;
  validation: ReturnType<typeof validationOf>;
  method: { threshold_db: number; persistence: string; min_area_ha: number; min_baseline_db: number; forest_mask: string; nisar: unknown };
}

export async function buildHexContext(ds: Dataset, cell: HexCell, polys: PolygonFeature[], now: number): Promise<HexContext> {
  const { index } = ds;
  const scenes = index.scenes;
  const last = scenes.length - 1;
  const town = nearestTown(cell.center);
  const total = cell.cumHa[last] ?? 0;
  const firstScene = cell.firstT !== null ? scenes[cell.firstT] : undefined;
  let signal: Signal | null = null;
  try {
    signal = await signalAt(ds, cell.center[0], cell.center[1], firstScene?.date);
  } catch {
    signal = null;
  }
  return {
    timeline_date: scenes[now]?.date ?? "",
    hexagon: {
      id: cell.id,
      center_lon_lat: [r4(cell.center[0]), r4(cell.center[1])],
      area_ha: Math.round(cell.areaHa),
      nearest_town: { name: town.name, km: Math.round(town.km), direction: town.dir },
      cleared_ha_up_to_timeline_date: r1(cell.cumHa[now] ?? 0) ?? 0,
      cleared_ha_total: r1(total) ?? 0,
      cleared_pct_of_hexagon_total: r1((total / cell.areaHa) * 100) ?? 0,
      first_detection_date: firstScene?.date ?? null,
      cleared_ha_by_date: scenes.map((s, i) => ({ date: s.date, ha: r1(cell.addedHa[i] ?? 0) ?? 0 })).filter((d) => d.ha > 0),
    },
    clearings: polys.map((f) => ({
      id: f.properties.id,
      first_date: f.properties.first_date,
      polygon_area_ha: f.properties.area_ha,
      mean_hv_drop_db: f.properties.mean_drop_db,
      optical_alert: f.properties.dist_confirmed,
    })),
    scene_of_first_detection: firstScene ? { date: firstScene.date, id: firstScene.id, maturity: firstScene.maturity, crid: firstScene.crid } : null,
    radar_signal_center_cell: signal,
    validation: validationOf(ds, await ds.polygons()),
    method: {
      threshold_db: index.detection.threshold_db,
      persistence: "2 of 3 passes",
      min_area_ha: index.detection.min_area_ha,
      min_baseline_db: -4,
      forest_mask: ds.provenance("forest_mask")?.source ?? "forest mask",
      nisar: index.nisar,
    },
  };
}

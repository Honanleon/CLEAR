// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Types and loaders for the pipeline -> web data contract (docs/DATA_CONTRACT.md, schema_version 3).
// Real data lives in web/public/data/. In `npm run dev` only, if that folder is empty, the app
// falls back to the synthetic fixtures in web/fixtures/ and flags itself as synthetic.

/** Days between two ISO dates (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Normal NISAR repeat: a detection is dated ±12 days unless the previous pass is further back. */
export const REPEAT_DAYS = 12;

/**
 * Last date that still belongs to a timeline step: other zones are on other orbits, so their passes
 * fall a few days off the primary zone's. A pass up to half a repeat after the step is shown with it
 * (e.g. Ñeembucú's 2026-10-24 pass with the primary 2026-10-23 step).
 */
export function stepEnd(iso: string): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + (REPEAT_DAYS / 2) * 86_400_000).toISOString().slice(0, 10);
}

export type Maturity = "PROVISIONAL" | "VALIDATED" | "BETA";
export type ProvenanceType = "satellite" | "modeled" | "measured";
export type LngLat = [number, number];
export type BBox = [number, number, number, number];

export interface Scene {
  date: string;
  id: string;
  maturity: Maturity;
  crid: string;
  rgb: string;
  /** Water zones (v3): PNG of the water classes of this date, relative to data/ (blue open water, green flooded vegetation). */
  water?: string;
}

export interface Provenance {
  layer: string;
  type: ProvenanceType;
  source: string;
}

export interface IndexData {
  schema_version: number;
  generated_at: string;
  aoi: { id: string; bbox: BBox };
  nisar: { track: number; direction: string; frame: number; mode: string };
  scenes: Scene[];
  image_coordinates: [LngLat, LngLat, LngLat, LngLat];
  detection: {
    threshold_db: number;
    persistence: number;
    min_area_ha: number;
    n_polygons: number;
    area_ha_total: number;
    /** Dates in the baseline median (per zone: boqueron-sur uses 2). Older files: BASELINE_DATES. */
    baseline_dates?: number;
  };
  validation: {
    agreement_pct: number | null;
    coverage_pct: number | null;
    reference: string;
    /** schema v2: the ±24-day numbers, the median radar lead and the confirmed-polygon count. */
    agreement_pct_24d?: number | null;
    coverage_pct_24d?: number | null;
    median_lead_days?: number | null;
    polygons_confirmed?: number | null;
    polygons_total?: number | null;
  };
  provenance: Provenance[];
  /** Water zones (v3): the per-date water areas (`json`, relative to data/). */
  water?: { json: string; status: string };
  /** schema v3: which kind of zone this index describes. */
  zone?: { kind: ZoneKind; chapter: number; name: { es: string; en: string }; primary: boolean };
}

/** schema v3 (zones.json): clearing detection, water (chapter 2: images, series and rain only) or control. */
export type ZoneKind = "clearing" | "water" | "control";

export interface ZoneInfo {
  id: string;
  name: { es: string; en: string };
  kind: ZoneKind;
  chapter: number;
  primary: boolean;
  /** Folder of the zone's files relative to data/ ("" for the primary zone). */
  path: string;
  bbox: BBox;
  n_scenes: number;
  first_date: string;
  last_date: string;
  n_polygons: number | null;
  area_ha_total: number | null;
}

/** URL parameter of the zone the map opens on (?zona=<id>). */
export const ZONE_PARAM = "zona";

export interface PolygonProps {
  id: string;
  first_date: string;
  area_ha: number;
  mean_drop_db: number;
  dist_confirmed: boolean | null;
  status: string;
  /** schema v3: radar date just before first_date; the change happened between the two. */
  prev_date?: string | null;
  /** Added by the web app: index of the scene of first_date. */
  t?: number;
}

export type PolygonGeometry =
  | { type: "Polygon"; coordinates: LngLat[][] }
  | { type: "MultiPolygon"; coordinates: LngLat[][][] };

export interface PolygonFeature {
  type: "Feature";
  id?: string | number;
  geometry: PolygonGeometry;
  properties: PolygonProps;
}

export interface PolygonCollection {
  type: "FeatureCollection";
  features: PolygonFeature[];
}

export interface Grid {
  dates: string[];
  origin: LngLat;
  cell_deg: [number, number];
  nx: number;
  ny: number;
  hv_db_x10: (number | null)[][];
  hh_db_x10: (number | null)[][];
}

/** Water zones (v3, water.json): estimated hectares of open water and flooded vegetation per date. */
export interface WaterSeries {
  dates: string[];
  open_water_ha: (number | null)[];
  flooded_veg_ha: (number | null)[];
  status: string;
  source: string;
}

export interface Rain {
  dates: string[];
  mm: number[];
  source: string;
  point: LngLat;
}

/** v2 adds optional validation fields; v3 adds zones (the root stays the primary zone) and prev_date. */
export const SUPPORTED_SCHEMA = 3;
/** Baseline = median of the first N dates (CLAUDE.md §9 step 6, config.yaml detection.baseline_dates). */
export const BASELINE_DATES = 3;
/** Baseline length of one zone's data (index.json detection.baseline_dates, default BASELINE_DATES). */
export function baselineDates(index: { detection: { baseline_dates?: number } }): number {
  return index.detection.baseline_dates ?? BASELINE_DATES;
}
/** Instrument gap with no acquisitions (CLAUDE.md §8.1). */
export const INSTRUMENT_GAP: [string, string] = ["2026-07-27", "2026-08-10"];
/** Study area, used only when no data has been exported yet (CLAUDE.md §8.2). */
export const DEFAULT_BBOX: BBox = [-60.78, -21.73, -60.18, -21.33];

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

export class Dataset {
  private cache = new Map<string, Promise<unknown>>();

  constructor(
    readonly index: IndexData,
    readonly base: string,
    readonly synthetic: boolean,
    /** The zone shown (null when there is no zones.json: one zone at the root). */
    readonly zone: ZoneInfo | null = null,
    /** Every zone listed in zones.json, in its order. */
    readonly zones: ZoneInfo[] = [],
  ) {}

  /** URL of a file relative to data/ (scene images: `scenes[].rgb` is always relative to data/). */
  url(path: string): string {
    return new URL(path, this.base).href;
  }

  /** The same data source for another zone of zones.json (its own index.json, in its folder). */
  async withZone(z: ZoneInfo): Promise<Dataset> {
    if (z.id === this.zone?.id) return this;
    const index = await fetchJson<IndexData>(this.url(`${z.path}index.json`));
    return new Dataset(index, this.base, this.synthetic, z, this.zones);
  }

  get kind(): ZoneKind {
    return this.zone?.kind ?? this.index.zone?.kind ?? "clearing";
  }

  /** Fetches a file of the current zone (its folder is `path` in zones.json). */
  private json<T>(path: string): Promise<T> {
    let p = this.cache.get(path);
    if (!p) {
      p = fetchJson<T>(this.url(`${this.zone?.path ?? ""}${path}`));
      p.catch(() => this.cache.delete(path));
      this.cache.set(path, p);
    }
    return p as Promise<T>;
  }

  /** Polygons with `t` (scene index of first_date) added, sorted by date. */
  async polygons(): Promise<PolygonCollection> {
    // the water zone has no detection and no polygons.geojson
    if (this.kind === "water") return { type: "FeatureCollection", features: [] };
    const fc = await this.json<PolygonCollection>("polygons.geojson");
    const dates = this.index.scenes.map((s) => s.date);
    fc.features.forEach((f, i) => {
      f.id = i;
      let t = dates.indexOf(f.properties.first_date);
      if (t < 0) t = dates.filter((d) => d <= f.properties.first_date).length - 1;
      f.properties.t = Math.max(0, t);
    });
    return fc;
  }

  grid(): Promise<Grid> {
    return this.json<Grid>("grid_500m.json");
  }

  rain(): Promise<Rain | null> {
    return this.json<Rain>("rain.json").catch(() => null);
  }

  private water: Promise<WaterSeries | null> | null = null;
  /** Water zones: hectares of open water and flooded vegetation per date (null when the zone has none). */
  waterSeries(): Promise<WaterSeries | null> {
    const path = this.index.water?.json;
    if (!path) return Promise.resolve(null);
    this.water ??= fetchJson<WaterSeries>(this.url(path)).catch(() => null);
    return this.water;
  }

  /** Water zones: the water-classes PNG of scene i (`scenes[].water`, else `<zone>/water/<date>.png` as in the contract). */
  waterUrl(i: number): string {
    const scene = this.index.scenes[i];
    if (!scene || this.kind !== "water") return "";
    return this.url(scene.water ?? `${this.zone?.path ?? ""}water/${scene.date}.png`);
  }

  provenance(layer: string): Provenance | undefined {
    return this.index.provenance.find((p) => p.layer === layer);
  }

  sceneUrl(i: number): string {
    const scene = this.index.scenes[i];
    return scene ? this.url(scene.rgb) : "";
  }
}

export async function loadDataset(): Promise<Dataset | null> {
  const candidates: [string, boolean][] = [];
  const forceFixtures = import.meta.env.DEV && new URLSearchParams(location.search).has("fixtures");
  if (!forceFixtures) candidates.push([new URL("data/", document.baseURI).href, false]);
  if (import.meta.env.DEV) candidates.push([new URL("/fixtures/data/", location.origin).href, true]);

  for (const [base, fromFixtures] of candidates) {
    try {
      // schema v3: zones.json lists the zones; without it there is one zone at the root. The page's
      // chapters use the primary zone; the map loads the others itself (Dataset.withZone).
      const zones = (await fetchJson<{ zones: ZoneInfo[] }>(`${base}zones.json`).catch(() => null))?.zones ?? [];
      const zone = zones.find((z) => z.primary) ?? zones[0] ?? null;
      const index = await fetchJson<IndexData>(`${base}${zone?.path ?? ""}index.json`);
      if (!Array.isArray(index.scenes) || index.scenes.length === 0) continue;
      if (index.schema_version > SUPPORTED_SCHEMA) {
        console.warn(`CLEAR: index.json schema_version ${index.schema_version}, web expects ${SUPPORTED_SCHEMA}`);
      }
      // Defensive: also flag fixtures that were copied into public/data by mistake.
      const synthetic = fromFixtures || index.scenes.some((s) => s.id.includes("SYNTHETIC"));
      return new Dataset(index, base, synthetic, zone, zones);
    } catch {
      /* not there (or the dev server answered with HTML): try the next source */
    }
  }
  return null;
}

/** Bounding box of a polygon or multipolygon. */
export function featureBBox(geom: PolygonGeometry): BBox {
  const rings = geom.type === "Polygon" ? geom.coordinates : geom.coordinates.flat();
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return [x0, y0, x1, y1];
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
}

/** Hexagon colour scale: hectares cleared inside a hexagon (pale gold → orange → red → magenta). */
export const HEX_STOPS: [number, string][] = [
  [1, "#ff3d3d"],
  [10, "#f51c1c"],
  [25, "#e60000"],
  [50, "#c40000"],
  [100, "#8f0000"],
];

export const HEX_GRADIENT = `linear-gradient(90deg, ${HEX_STOPS.map(([, c]) => c).join(", ")})`;

/**
 * Flooding (chapter 2) in strong purples: hectares under water (open water + flooded vegetation) in
 * each hexagon, as clearing is red. One strong colour per kind of change, so the map reads at a glance.
 */
export const WATER_STOPS: [number, string][] = [
  [1, "#c77dff"],
  [50, "#a64dff"],
  [200, "#8800ff"],
  [500, "#6600cc"],
  [1000, "#44008f"],
];

export const WATER_GRADIENT = `linear-gradient(90deg, ${WATER_STOPS.map(([, c]) => c).join(", ")})`;

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// One MapLibre map of Paraguay: a simple grey-and-white base map (water, rivers, roads, borders and names
// from Natural Earth, public domain, served with the site: no tile server), Paraguay divided into hexagons coloured red by hectares cleared up to a date
// (cells that grew in the current pass pulse), optional 1 km clearing hexagons and, on demand,
// the NISAR RGB scene of a date. The map section uses one instance in timeline mode
// and two (synced, one clipped) in before/after mode.

import {
  AttributionControl,
  FullscreenControl,
  type GeoJSONSource,
  Map as MLMap,
  Marker,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "./maplibre-slim.css";
import { type BBox, type Dataset, HEX_STOPS, type PolygonCollection, stepEnd, WATER_STOPS } from "../data";
import { type GeoJSON, type HexGrid, MINI_ZOOM } from "./hexgrid";
import paraguay from "./paraguay.json";
import { type Lang, lang, t } from "../i18n";

setWorkerUrl(workerUrl);

/** Natural Earth 1:10m layers clipped to the map (pipeline/export/basemap.py), served from public/basemap/. */
const BASEMAP_ATTR = "Natural Earth";
const basemapUrl = (file: string) => new URL(`basemap/${file}`, document.baseURI).href;
const FADE_MS = 520;

export const PARAGUAY_BBOX: BBox = [-62.65, -27.61, -54.25, -19.29];
/**
 * How far the map can pan / zoom out. Wider than the base-map clip (-67, -31, -50, -16): the country view
 * needs room for the Layers panel and the timeline; beyond the clip the background is the same grey as the
 * neighbouring countries, so the edge does not show.
 */
const MAX_BOUNDS: BBox = [-74, -35, -43, -12];
/** A base-map name (public/basemap/labels.json). Labels are HTML (the site's own font): no glyph server. */
interface BaseLabel {
  kind: "country" | "department" | "town";
  name_es: string;
  name_en: string;
  lonlat: [number, number];
  rank?: number;
}
/** Zoom range of a label (same ranges as the previous base map): towns by Natural Earth rank (3 = capital). */
function labelZooms(l: BaseLabel): [number, number] {
  if (l.kind === "country") return [0, 9];
  // HTML labels have no collision detection: departments and small towns only once the map is closer
  if (l.kind === "department") return [6.3, 10];
  const r = l.rank ?? 9;
  return [r <= 4 ? 4.5 : r <= 6 ? 6 : r === 7 ? 7 : 7.6, 24];
}

export interface RadarMapOptions {
  container: HTMLElement;
  ds: Dataset;
  polygons: PolygonCollection;
  hex: HexGrid;
  /** Small hexagons over the study area, shown from MINI_ZOOM. */
  mini: HexGrid;
  /** Outline of the small hexagons over the rest of the country inside a box (drawn only where the map looks). */
  miniOutline?: (view: BBox) => GeoJSON;
  /**
   * Paraguay-wide NISAR quick-look mosaics (ASF browse images), "before" and "after", drawn under the
   * zones' own radar images in the radar view.
   */
  mosaic?: { files: Record<string, string>; coordinates: [[number, number], [number, number], [number, number], [number, number]] };
  /** Dashed box of every study zone (zones.json); defaults to `bbox`. */
  zoneBoxes?: GeoJSON;
  /**
   * Radar images, one set per zone. Each shows its own scene of the date on the timeline (the latest
   * one up to that date). `always`: shown even in the simple-map view (the water zone has no hexagons,
   * its images are its content). Defaults to the scenes of `ds`.
   */
  imageSets?: ImageSet[];
  bbox: BBox;
  controls: boolean;
  start: "country" | "study";
  /** Test (lab) build only: satellite tiles shipped with the page, no base-map labels. */
  offline?: { tiles: string; attribution: string; maxzoom: number; bounds: BBox };
}

const preloaded = new Map<string, Promise<void>>();
export function preload(url: string): Promise<void> {
  let p = preloaded.get(url);
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(url));
      img.src = url;
    });
    p.catch(() => preloaded.delete(url));
    preloaded.set(url, p);
  }
  return p;
}


function style(offline?: RadarMapOptions["offline"]): StyleSpecification {
  if (offline) {
    return {
      version: 8,
      sources: {
        satellite: { type: "raster", tiles: [offline.tiles], tileSize: 256, maxzoom: offline.maxzoom, bounds: offline.bounds, attribution: offline.attribution },
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#0b0f14" } },
        { id: "satellite", type: "raster", source: "satellite", paint: { "raster-contrast": 0.06, "raster-fade-duration": 200 } },
      ],
    };
  }
  return {
    version: 8,
    sources: {
      "ne-countries": { type: "geojson", data: basemapUrl("countries.geojson"), attribution: BASEMAP_ATTR },
      "ne-departments": { type: "geojson", data: basemapUrl("departments.geojson") },
      "ne-lakes": { type: "geojson", data: basemapUrl("lakes.geojson") },
      "ne-rivers": { type: "geojson", data: basemapUrl("rivers.geojson") },
      "ne-roads": { type: "geojson", data: basemapUrl("roads.geojson") },
      country: { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [paraguay as [number, number][]] } } },
    },
    // simple grey-and-white map: neighbours light grey, Paraguay white, water grey (red is kept for clearing only)
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#dedfe1" } },
      { id: "country-fill", type: "fill", source: "country", paint: { "fill-color": "#ffffff" } },
      { id: "water", type: "fill", source: "ne-lakes", paint: { "fill-color": "#c4c9cf" } },
      {
        id: "waterway",
        type: "line",
        source: "ne-rivers",
        paint: { "line-color": "#c4c9cf", "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.8, 8, 1.6, 12, 3] },
      },
    ],
  };
}

const EMPTY: GeoJSON = { type: "FeatureCollection", features: [] };

/** Every hexagon layer (fills, outlines, grids, no-data shading, hover, pulse): hidden over the radar images. */
const HEX_LAYERS = [
  "hex-nodata",
  "hex-grid",
  "hex-fill",
  "mini-world",
  "mini-grid",
  "mini-fill",
  "mini-line",
  "water-fill",
  "water-mini-fill",
  "water-mini-line",
  "hex-line",
  "hex-hover",
  "mini-hover",
  "hex-new",
  "mini-new",
];

export interface ImageSet {
  key: string;
  ds: Dataset;
  always: boolean;
}

interface SceneSet extends ImageSet {
  present: Set<number>;
  visible: number;
  request: number;
}

export class RadarMap {
  readonly map: MLMap;
  readonly ready: Promise<void>;
  private sets: SceneSet[];
  /** Date of the scene on the timeline (scenes of `opts.ds`). */
  private date = "";
  private radarOn = false;
  private radarOpacity = 0.9;
  private pulseRaf = 0;
  private pulsing = false;
  private labels: { el: HTMLElement; label: BaseLabel; zooms: [number, number] }[] = [];

  constructor(private opts: RadarMapOptions) {
    this.sets = (opts.imageSets ?? [{ key: "main", ds: opts.ds, always: false }]).map((s) => ({ ...s, present: new Set<number>(), visible: -1, request: 0 }));
    const start = opts.start === "country" && !opts.offline ? PARAGUAY_BBOX : opts.bbox;
    this.map = new MLMap({
      container: opts.container,
      style: style(opts.offline),
      bounds: start,
      fitBoundsOptions: { padding: 30 },
      maxBounds: opts.offline?.bounds ?? MAX_BOUNDS,
      minZoom: opts.offline ? 8 : 3.5,
      maxZoom: 17,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      cooperativeGestures: true,
      fadeDuration: 150,
      locale: {
        "NavigationControl.ZoomIn": t("map.zoom_in"),
        "NavigationControl.ZoomOut": t("map.zoom_out"),
        "NavigationControl.ResetBearing": t("map.reset_north"),
        "FullscreenControl.Enter": t("map.fullscreen_enter"),
        "FullscreenControl.Exit": t("map.fullscreen_exit"),
        "AttributionControl.ToggleAttribution": t("map.attribution"),
        "CooperativeGesturesHandler.WindowsHelpText": t("map.coop_desktop"),
        "CooperativeGesturesHandler.MacHelpText": t("map.coop_mac"),
        "CooperativeGesturesHandler.MobileHelpText": t("map.coop_mobile"),
      },
    });
    this.map.touchZoomRotate.disableRotation();
    if (opts.controls) {
      this.map.addControl(new NavigationControl({ showCompass: false }), "top-right");
      this.map.addControl(new FullscreenControl({ container: opts.container.parentElement ?? undefined }), "top-right");
      this.map.addControl(new AttributionControl({ compact: true }), "bottom-right");
    }

    this.ready = new Promise((resolve) => {
      this.map.once("load", () => {
        this.addLayers();
        this.updateMiniWorld();
        // also while moving (throttled): the mini hexagons outside the study zones must appear together
        // with the ones inside, as soon as the zoom reaches them (e.g. during the intro flight)
        let pending = 0;
        this.map.on("move", () => {
          if (pending) return;
          pending = window.setTimeout(() => {
            pending = 0;
            this.updateMiniWorld();
          }, 120);
        });
        this.map.on("moveend", () => this.updateMiniWorld());
        resolve();
      });
    });
  }

  /** Colour of a hexagon by the hectares cleared up to scene t. */
  private hexColor(t: number): string {
    return ["interpolate", ["linear"], ["coalesce", ["get", `a${t}`], 0], ...HEX_STOPS.flat()] as unknown as string;
  }

  /** Purple of a flooding hexagon by the hectares under water at timeline step t. */
  private waterColor(t: number): string {
    return ["interpolate", ["linear"], ["coalesce", ["get", `w${t}`], 0], ...WATER_STOPS.flat()] as unknown as string;
  }

  /**
   * Hexagons on or off: on in the simple map, off over the radar images (radar view and before/after),
   * which then show alone. The zone boxes, tags and the selected-hexagon outline stay.
   */
  setHexagons(on: boolean): void {
    void this.ready.then(() => {
      for (const id of HEX_LAYERS) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    });
  }

  /** Flooding hexagons (water zone), computed after load from the water-classes images. */
  setWaterHex(big: GeoJSON, mini: GeoJSON): void {
    void this.ready.then(() => {
      (this.map.getSource("waterhex") as GeoJSONSource | undefined)?.setData(big as never);
      (this.map.getSource("waterminihex") as GeoJSONSource | undefined)?.setData(mini as never);
    });
  }

  private addLayers() {
    const m = this.map;
    const [x0, y0, x1, y1] = this.opts.bbox;
    m.addSource("aoi", {
      type: "geojson",
      data: (this.opts.zoneBoxes ?? {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
      }) as never,
    });
    m.addSource("polys", { type: "geojson", data: this.opts.polygons as never });
    m.addSource("hexgrid", { type: "geojson", data: this.opts.hex.outline as never });
    m.addSource("hexdata", { type: "geojson", data: this.opts.hex.data as never });
    m.addSource("minigrid", { type: "geojson", data: this.opts.mini.outline as never });
    m.addSource("minidata", { type: "geojson", data: this.opts.mini.data as never });
    m.addSource("miniworld", { type: "geojson", data: EMPTY as never });
    m.addSource("waterhex", { type: "geojson", data: EMPTY as never });
    m.addSource("waterminihex", { type: "geojson", data: EMPTY as never });

    // roads and borders (under the clearings, over the imagery)
    if (!this.opts.offline) this.addBaseLines();
    this.addOverlays();
    if (!this.opts.offline) this.addLabels();
  }

  private addBaseLines() {
    const m = this.map;
    m.addLayer({
      id: "roads",
      type: "line",
      source: "ne-roads",
      paint: {
        "line-color": "#c3c5c9",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 10, 0.95],
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 1.2, 14, 3],
      },
    });
    m.addLayer({
      id: "admin-state",
      type: "line",
      source: "ne-departments",
      paint: { "line-color": "#9a9ca1", "line-opacity": 0.8, "line-width": 1, "line-dasharray": [3, 2] },
    });
    m.addLayer({
      id: "admin-country",
      type: "line",
      source: "ne-countries",
      // Paraguay's outline only: the neighbours are clipped at the base-map box, and their outline would draw
      // the clip edge as a fake border once the map is zoomed out (Paraguay's borders with them stay)
      filter: ["==", ["get", "iso"], "PRY"],
      paint: { "line-color": "#5f6268", "line-opacity": 0.9, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 10, 2.5] },
    });

  }

  private addOverlays() {
    const m = this.map;
    // Paraguay divided into big hexagons: the ones without radar data are shaded so they never read as "no clearing"
    const studied = ["==", ["get", "s"], 1];
    const [z0, z1] = [MINI_ZOOM - 0.4, MINI_ZOOM + 0.4];
    m.addLayer({
      id: "hex-nodata",
      type: "fill",
      source: "hexgrid",
      filter: ["==", ["get", "s"], 0],
      paint: { "fill-color": "#9ca3af", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.12, 10, 0.14] as never },
    });
    m.addLayer({
      id: "hex-grid",
      type: "line",
      source: "hexgrid",
      paint: {
        "line-color": "#7b8190",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, ["case", studied, 0.55, 0.3], 11, ["case", studied, 0.45, 0.25]] as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 10, 1, 12, 1.6] as never,
      },
    });
    // big hexagons fill: fades out as the mini hexagons fade in
    m.addLayer({
      id: "hex-fill",
      type: "fill",
      source: "hexdata",
      filter: [">", ["get", "a0"], 0],
      paint: { "fill-color": this.hexColor(0), "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.9, z0, 0.9, z1, 0] as never },
    });
    // mini hexagons over the rest of the country (no data), recomputed for the area on screen
    m.addLayer({
      id: "mini-world",
      type: "line",
      source: "miniworld",
      minzoom: z0,
      paint: { "line-color": "#7b8190", "line-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 0.25, 12, 0.3] as never, "line-width": 0.8 },
    });
    // mini hexagons inside the study area, shown when zoomed in
    m.addLayer({
      id: "mini-grid",
      type: "line",
      source: "minigrid",
      minzoom: z0,
      paint: { "line-color": "#7b8190", "line-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 0.4, 12, 0.45] as never, "line-width": 0.8 },
    });
    m.addLayer({
      id: "mini-fill",
      type: "fill",
      source: "minidata",
      minzoom: z0,
      filter: [">", ["get", "a0"], 0],
      paint: { "fill-color": this.hexColor(0), "fill-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 0.9, 13, 0.9, 15, 0.75] as never },
    });
    m.addLayer({
      id: "mini-line",
      type: "line",
      source: "minidata",
      minzoom: z0,
      filter: [">", ["get", "a0"], 0],
      paint: { "line-color": this.hexColor(0), "line-width": 1.4, "line-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 1] as never },
    });
    // flooding hexagons (water zone), purple; big ones fade out as the mini ones fade in, like clearing
    m.addLayer({
      id: "water-fill",
      type: "fill",
      source: "waterhex",
      filter: [">", ["get", "w0"], 0],
      paint: { "fill-color": this.waterColor(0), "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.9, z0, 0.9, z1, 0] as never },
    });
    m.addLayer({
      id: "water-mini-fill",
      type: "fill",
      source: "waterminihex",
      minzoom: z0,
      filter: [">", ["get", "w0"], 0],
      paint: { "fill-color": this.waterColor(0), "fill-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 0.9, 13, 0.9, 15, 0.75] as never },
    });
    m.addLayer({
      id: "water-mini-line",
      type: "line",
      source: "waterminihex",
      minzoom: z0,
      filter: [">", ["get", "w0"], 0],
      paint: { "line-color": this.waterColor(0), "line-width": 1.4, "line-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 1] as never },
    });
    // big hexagon outline stays on top as a frame around its mini hexagons
    m.addLayer({
      id: "hex-line",
      type: "line",
      source: "hexdata",
      filter: [">", ["get", "a0"], 0],
      // red frame only while the big hexagons are shown; zoomed in, the grey grid outline stays
      paint: {
        "line-color": this.hexColor(0),
        "line-width": 1.8,
        "line-opacity": ["interpolate", ["linear"], ["zoom"], z0, 1, z1, 0] as never,
      },
    });
    for (const [prefix, src] of [["hex", "hexgrid"], ["mini", "minigrid"]] as const) {
      m.addLayer({
        id: `${prefix}-hover`,
        type: "line",
        source: src,
        filter: ["==", ["get", "id"], -1],
        paint: { "line-color": "#111827", "line-width": 2, "line-opacity": 0.8 },
      });
    }
    for (const [prefix, src] of [["hex", "hexdata"], ["mini", "minidata"]] as const) {
      m.addLayer({
        id: `${prefix}-new`,
        type: "line",
        source: src,
        ...(prefix === "mini" ? { minzoom: z0 } : { maxzoom: z1 }),
        filter: ["==", ["get", "id"], -1],
        paint: { "line-color": "#111827", "line-width": 2, "line-opacity": 0.9, "line-blur": 1 },
      });
    }
    for (const [prefix, src] of [["hex", "hexgrid"], ["mini", "minigrid"]] as const) {
      m.addLayer({
        id: `${prefix}-selected`,
        type: "line",
        source: src,
        filter: ["==", ["get", "id"], -1],
        paint: { "line-color": "#111827", "line-width": 3.5 },
      });
    }
    // exact outline of each clearing (optional, for detail when zoomed in)
    m.addLayer({
      id: "poly-outline",
      type: "line",
      source: "polys",
      minzoom: 10,
      layout: { visibility: "none" },
      filter: ["<=", ["get", "t"], -1],
      paint: { "line-color": "#111827", "line-width": 1.5, "line-dasharray": [2, 1.5] },
    });
    m.addLayer({
      id: "aoi-glow",
      type: "line",
      source: "aoi",
      paint: { "line-color": "#111827", "line-width": 10, "line-blur": 8, "line-opacity": 0.08 },
    });
    m.addLayer({
      id: "aoi-line",
      type: "line",
      source: "aoi",
      paint: { "line-color": "#1f2937", "line-width": 1.8, "line-opacity": 0.95, "line-dasharray": [3, 2] },
    });

  }

  private addLabels() {
    // names on top of everything, as HTML in the site's font (no glyph server); only towns, never villages (CLAUDE.md §4)
    void fetch(basemapUrl("labels.json"))
      .then((r) => (r.ok ? (r.json() as Promise<BaseLabel[]>) : []))
      .then((list) => {
        const l = lang();
        for (const label of list) {
          const el = document.createElement("div");
          el.className = `map-label map-label-${label.kind}${label.kind === "town" && (label.rank ?? 9) <= 6 ? " is-city" : ""}`;
          el.textContent = l === "en" ? label.name_en : label.name_es;
          el.setAttribute("aria-hidden", "true");
          new Marker({ element: el, anchor: "center" }).setLngLat(label.lonlat).addTo(this.map);
          this.labels.push({ el, label, zooms: labelZooms(label) });
        }
        this.updateLabels();
        this.map.on("zoom", () => this.updateLabels());
      })
      .catch(() => {
        /* the map works without names */
      });
  }

  private updateLabels(): void {
    const z = this.map.getZoom();
    for (const { el, zooms } of this.labels) el.hidden = z < zooms[0] || z >= zooms[1];
  }

  setLabelLang(l: Lang): void {
    for (const { el, label } of this.labels) el.textContent = l === "en" ? label.name_en : label.name_es;
  }

  /** Radar scenes go under roads (official map) or under the hexagons (offline test map). */
  private overlayStart(): string {
    return this.map.getLayer("roads") ? "roads" : "hex-grid";
  }

  /** Where a set's images go: the water zone's above the empty grid (they are its content), the others under the roads. */
  private beforeOf(s: SceneSet): string {
    return s.always && this.map.getLayer("mini-grid") ? "mini-grid" : this.overlayStart();
  }

  private urlOf(s: SceneSet, j: number): Promise<string> {
    return Promise.resolve(s.ds.sceneUrl(j));
  }

  private sceneLayer(s: SceneSet, j: number): string {
    return `scene-${s.key}-${j}`;
  }

  private ensureScene(s: SceneSet, j: number, url: string) {
    if (s.present.has(j)) return;
    const id = this.sceneLayer(s, j);
    this.map.addSource(id, { type: "image", url, coordinates: s.ds.index.image_coordinates });
    this.map.addLayer(
      {
        id,
        type: "raster",
        source: id,
        paint: {
          "raster-opacity": 0,
          "raster-opacity-transition": { duration: FADE_MS, delay: 0 },
          "raster-fade-duration": 0,
          "raster-resampling": "linear",
        },
      },
      this.beforeOf(s),
    );
    s.present.add(j);
  }

  /** Hides a set's scenes except `keep` (the neighbours stay loaded, transparent, for a smooth play). */
  private trimScenes(s: SceneSet, keep: number) {
    for (const j of [...s.present]) {
      if (j === keep) continue;
      if (keep < 0 || Math.abs(j - keep) > 1) {
        this.map.removeLayer(this.sceneLayer(s, j));
        this.map.removeSource(this.sceneLayer(s, j));
        s.present.delete(j);
      } else {
        this.map.setPaintProperty(this.sceneLayer(s, j), "raster-opacity", 0);
      }
    }
  }

  /** The set's latest scene up to the timeline step (-1: the zone has no image yet). */
  private sceneFor(s: SceneSet): number {
    const end = stepEnd(this.date);
    let j = -1;
    s.ds.index.scenes.forEach((sc, k) => {
      if (sc.date <= end) j = k;
    });
    return j;
  }

  /** Draws (cross-fade) the scene of one set, or hides the set when its images are off. */
  private async showSet(s: SceneSet): Promise<void> {
    const req = ++s.request;
    const j = this.sceneFor(s);
    s.visible = j;
    if (!(s.always || this.radarOn) || j < 0) {
      await this.ready;
      if (req === s.request) this.trimScenes(s, -1);
      return;
    }
    let url: string;
    try {
      url = await this.urlOf(s, j);
      await preload(url);
    } catch {
      return;
    }
    await this.ready;
    if (req !== s.request) return;
    this.ensureScene(s, j, url);
    this.map.moveLayer(this.sceneLayer(s, j), this.beforeOf(s));
    this.map.setPaintProperty(this.sceneLayer(s, j), "raster-opacity", this.radarOpacity);
    window.setTimeout(() => {
      if (req === s.request) this.trimScenes(s, j);
    }, FADE_MS);
    const scenes = s.ds.index.scenes;
    for (const k of [j + 1, j - 1]) if (scenes[k]) void this.urlOf(s, k).then(preload).catch(() => undefined);
  }

  /** Remembers the date of scene `i` (timeline); each zone's images follow it when they are on. */
  async showScene(i: number): Promise<void> {
    const scene = this.opts.ds.index.scenes[i];
    if (!scene) return;
    this.date = scene.date;
    await Promise.all(this.sets.map((s) => this.showSet(s)));
  }

  /** Box the mini hexagons outside the zones were last computed for (null: none drawn). */
  private miniWorldBox: BBox | null = null;
  /**
   * Mini hexagons all over Paraguay would be ~39,000 cells: only the ones around the view are drawn,
   * recomputed only when the view leaves the box computed last (zooming in stays inside it).
   */
  private updateMiniWorld() {
    const fn = this.opts.miniOutline;
    const src = this.map.getSource("miniworld") as GeoJSONSource | undefined;
    if (!fn || !src) return;
    if (this.map.getZoom() < MINI_ZOOM - 0.4) {
      if (this.miniWorldBox) src.setData(EMPTY as never);
      this.miniWorldBox = null;
      return;
    }
    const b = this.map.getBounds();
    const cur: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
    const last = this.miniWorldBox;
    if (last && cur[0] >= last[0] && cur[1] >= last[1] && cur[2] <= last[2] && cur[3] <= last[3]) return;
    const [w, h] = [cur[2] - cur[0], cur[3] - cur[1]];
    const view: BBox = [cur[0] - w * 0.15, cur[1] - h * 0.15, cur[2] + w * 0.15, cur[3] + h * 0.15];
    this.miniWorldBox = view;
    src.setData(fn(view) as never);
  }

  /** Hexagons coloured by the hectares cleared up to scene `upTo`; cells that grew after `newAfter` pulse. */
  async setTime(upTo: number, newAfter = upTo - 1): Promise<void> {
    await this.ready;
    const a = (k: number) => ["coalesce", ["get", `a${Math.max(0, k)}`], 0];
    const shown = [">", a(upTo), 0] as never;
    const w = ["coalesce", ["get", `w${Math.max(0, upTo)}`], 0];
    for (const id of ["water-fill", "water-mini-fill", "water-mini-line"]) {
      this.map.setFilter(id, [">", w, 0] as never);
      this.map.setPaintProperty(id, id.endsWith("line") ? "line-color" : "fill-color", this.waterColor(upTo));
    }
    for (const p of ["hex", "mini"]) {
      this.map.setFilter(`${p}-fill`, shown);
      this.map.setFilter(`${p}-line`, shown);
      this.map.setPaintProperty(`${p}-fill`, "fill-color", this.hexColor(upTo));
      this.map.setPaintProperty(`${p}-line`, "line-color", this.hexColor(upTo));
      this.map.setFilter(`${p}-new`, (newAfter < 0 ? shown : [">", a(upTo), a(newAfter)]) as never);
    }
    this.map.setFilter("poly-outline", ["<=", ["get", "t"], upTo] as never);
  }

  /** Radar view on/off (the simple base map underneath stays). */
  private mosaicWhich: string | null = null;
  private mosaicLoaded = new Set<string>();
  /** Which country mosaic shows (only in the radar view); each one is loaded the first time. */
  setMosaic(which: string | null): void {
    this.mosaicWhich = which;
    void this.ready.then(() => this.paintMosaic());
  }

  private paintMosaic() {
    const mo = this.opts.mosaic;
    if (!mo) return;
    const want = this.radarOn ? this.mosaicWhich : null;
    if (want && mo.files[want] && !this.mosaicLoaded.has(want)) {
      // below everything the site draws (the zones' own scenes go above it)
      const below = this.map.getLayer("roads") ? "roads" : this.overlayStart();
      this.map.addSource(`mosaic-${want}`, { type: "image", url: mo.files[want], coordinates: mo.coordinates });
      this.map.addLayer(
        {
          id: `mosaic-${want}`,
          type: "raster",
          source: `mosaic-${want}`,
          paint: { "raster-opacity": this.radarOpacity, "raster-fade-duration": 0, "raster-resampling": "linear" },
        },
        below,
      );
      this.mosaicLoaded.add(want);
    }
    for (const k of this.mosaicLoaded) {
      const id = `mosaic-${k}`;
      this.map.setLayoutProperty(id, "visibility", k === want ? "visible" : "none");
      this.map.setPaintProperty(id, "raster-opacity", this.radarOpacity);
    }
  }

  async setRadar(on: boolean, opacity = this.radarOpacity): Promise<void> {
    this.radarOn = on;
    this.radarOpacity = opacity;
    void this.ready.then(() => this.paintMosaic());
    if (this.date) await Promise.all(this.sets.map((s) => this.showSet(s)));
  }

  async setOutlines(on: boolean): Promise<void> {
    await this.ready;
    this.map.setLayoutProperty("poly-outline", "visibility", on ? "visible" : "none");
  }

  /** Highlights one hexagon of the big grid, or of the mini grid when `mini` is true (the other is cleared). */
  select(cellId: number | null, mini = false): void {
    this.highlight("selected", cellId, mini);
  }

  hover(cellId: number | null, mini = false): void {
    this.highlight("hover", cellId, mini);
  }

  private highlight(kind: "selected" | "hover", cellId: number | null, mini: boolean) {
    if (!this.map.getLayer(`hex-${kind}`)) return;
    this.map.setFilter(`hex-${kind}`, ["==", ["get", "id"], mini ? -1 : (cellId ?? -1)]);
    this.map.setFilter(`mini-${kind}`, ["==", ["get", "id"], mini ? (cellId ?? -1) : -1]);
  }

  /** Animates the outline of the hexagons that grew in the current pass while the map is on screen. */
  setPulse(on: boolean): void {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) on = false;
    if (on === this.pulsing) return;
    this.pulsing = on;
    if (!on) {
      cancelAnimationFrame(this.pulseRaf);
      return;
    }
    let last = 0;
    const tick = (now: number) => {
      if (!this.pulsing) return;
      if (now - last > 50 && this.map.getLayer("hex-new")) {
        last = now;
        const s = (Math.sin(now / 260) + 1) / 2;
        for (const id of ["hex-new", "mini-new"]) {
          this.map.setPaintProperty(id, "line-width", 1.5 + s * 4);
          this.map.setPaintProperty(id, "line-opacity", 0.35 + s * 0.65);
        }
      }
      this.pulseRaf = requestAnimationFrame(tick);
    };
    this.pulseRaf = requestAnimationFrame(tick);
  }

}

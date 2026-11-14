// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// One MapLibre map of Paraguay: real satellite imagery, place names / roads / borders from
// OpenStreetMap, the study area divided into hexagons coloured by hectares cleared up to a date
// (cells that grew in the current pass pulse), optional exact clearing outlines and, on demand,
// the NISAR RGB scene of a date. The map section uses one instance in timeline mode
// and two (synced, one clipped) in before/after mode.

import {
  AttributionControl,
  FullscreenControl,
  Map as MLMap,
  NavigationControl,
  setWorkerUrl,
  type StyleSpecification,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { type BBox, type Dataset, HEX_STOPS, type PolygonCollection } from "../data";
import type { HexGrid } from "./hexgrid";
import { type Lang, lang, t } from "../i18n";

setWorkerUrl(workerUrl);

/** Esri World Imagery: high-resolution satellite basemap (attribution required). */
const SATELLITE_TILES = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTR = "Esri, Maxar, Earthstar Geographics, GIS User Community";
/** OpenFreeMap vector tiles (OpenMapTiles schema, OpenStreetMap data): names, roads, borders. */
const LABELS_TILEJSON = "https://tiles.openfreemap.org/planet";
const LABELS_ATTR = "OpenFreeMap © OpenMapTiles · © OpenStreetMap contributors";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const FADE_MS = 520;

export const PARAGUAY_BBOX: BBox = [-62.65, -27.61, -54.25, -19.29];
const MAX_BOUNDS: BBox = [-67, -31, -50, -16];
const LABEL_LAYERS = ["place-country", "place-state", "place-city", "place-town"];

export interface RadarMapOptions {
  container: HTMLElement;
  ds: Dataset;
  polygons: PolygonCollection;
  hex: HexGrid;
  bbox: BBox;
  controls: boolean;
  start: "country" | "study";
  /** Test (lab) build only: satellite tiles shipped with the page, no OpenStreetMap labels. */
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

const nameExpr = (l: Lang) => ["coalesce", ["get", `name:${l}`], ["get", "name"]];

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
    glyphs: GLYPHS,
    sources: {
      satellite: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 18, attribution: SATELLITE_ATTR },
      osm: { type: "vector", url: LABELS_TILEJSON, attribution: LABELS_ATTR },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b0f14" } },
      { id: "satellite", type: "raster", source: "satellite", paint: { "raster-contrast": 0.06, "raster-fade-duration": 200 } },
    ],
  };
}

export class RadarMap {
  readonly map: MLMap;
  readonly ready: Promise<void>;
  private present = new Set<number>();
  private visibleScene = -1;
  private request = 0;
  private radarOn = false;
  private radarOpacity = 0.9;
  private pulseRaf = 0;
  private pulsing = false;

  constructor(private opts: RadarMapOptions) {
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
        resolve();
      });
    });
  }

  /** Colour of a hexagon by the hectares cleared up to scene t. */
  private hexColor(t: number): string {
    return ["interpolate", ["linear"], ["coalesce", ["get", `a${t}`], 0], ...HEX_STOPS.flat()] as unknown as string;
  }

  private addLayers() {
    const m = this.map;
    const [x0, y0, x1, y1] = this.opts.bbox;
    m.addSource("aoi", {
      type: "geojson",
      data: {
        type: "Feature",
        properties: {},
        geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] },
      },
    });
    m.addSource("polys", { type: "geojson", data: this.opts.polygons as never });
    m.addSource("hexgrid", { type: "geojson", data: this.opts.hex.outline as never });
    m.addSource("hexdata", { type: "geojson", data: this.opts.hex.data as never });

    // roads and borders (under the clearings, over the imagery)
    if (!this.opts.offline) this.addOsmLines();
    this.addOverlays();
    if (!this.opts.offline) this.addLabels();
  }

  private addOsmLines() {
    const m = this.map;
    m.addLayer({
      id: "roads",
      type: "line",
      source: "osm",
      "source-layer": "transportation",
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
      paint: {
        "line-color": "#ffe2a8",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.35, 10, 0.6],
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 9, 1.2, 14, 3],
      },
    });
    m.addLayer({
      id: "admin-state",
      type: "line",
      source: "osm",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 4], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": "#ffffff", "line-opacity": 0.45, "line-width": 1, "line-dasharray": [3, 2] },
    });
    m.addLayer({
      id: "admin-country",
      type: "line",
      source: "osm",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": "#ffffff", "line-opacity": 0.85, "line-width": ["interpolate", ["linear"], ["zoom"], 4, 1, 10, 2.5] },
    });

  }

  private addOverlays() {
    const m = this.map;
    // Paraguay divided into hexagons: the ones without radar data are shaded so they never read as "no clearing"
    const studied = ["==", ["get", "s"], 1];
    m.addLayer({
      id: "hex-nodata",
      type: "fill",
      source: "hexgrid",
      filter: ["==", ["get", "s"], 0],
      paint: { "fill-color": "#0b0f14", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.14, 10, 0.22] as never },
    });
    m.addLayer({
      id: "hex-grid",
      type: "line",
      source: "hexgrid",
      paint: {
        "line-color": "#ffffff",
        "line-opacity": ["interpolate", ["linear"], ["zoom"], 5, ["case", studied, 0.4, 0.16], 11, ["case", studied, 0.3, 0.12]] as never,
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.5, 10, 1] as never,
      },
    });
    m.addLayer({
      id: "hex-fill",
      type: "fill",
      source: "hexdata",
      filter: [">", ["get", "a0"], 0],
      paint: { "fill-color": this.hexColor(0), "fill-opacity": ["interpolate", ["linear"], ["zoom"], 8, 0.88, 11, 0.72, 13, 0.36, 15, 0.2] as never },
    });
    m.addLayer({
      id: "hex-line",
      type: "line",
      source: "hexdata",
      filter: [">", ["get", "a0"], 0],
      paint: { "line-color": this.hexColor(0), "line-width": 1.8 },
    });
    m.addLayer({
      id: "hex-hover",
      type: "line",
      source: "hexgrid",
      filter: ["==", ["get", "id"], -1],
      paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.8 },
    });
    m.addLayer({
      id: "hex-new",
      type: "line",
      source: "hexdata",
      filter: ["==", ["get", "id"], -1],
      paint: { "line-color": "#ffffff", "line-width": 2, "line-opacity": 0.9, "line-blur": 1 },
    });
    m.addLayer({
      id: "hex-selected",
      type: "line",
      source: "hexgrid",
      filter: ["==", ["get", "id"], -1],
      paint: { "line-color": "#ffffff", "line-width": 3.5 },
    });
    // exact outline of each clearing (optional, for detail when zoomed in)
    m.addLayer({
      id: "poly-outline",
      type: "line",
      source: "polys",
      minzoom: 10,
      layout: { visibility: "none" },
      filter: ["<=", ["get", "t"], -1],
      paint: { "line-color": "#ffffff", "line-width": 1.5, "line-dasharray": [2, 1.5] },
    });
    m.addLayer({
      id: "aoi-glow",
      type: "line",
      source: "aoi",
      paint: { "line-color": "#7cc8ff", "line-width": 10, "line-blur": 8, "line-opacity": 0.35 },
    });
    m.addLayer({
      id: "aoi-line",
      type: "line",
      source: "aoi",
      paint: { "line-color": "#ffffff", "line-width": 1.8, "line-opacity": 0.95, "line-dasharray": [3, 2] },
    });

  }

  private addLabels() {
    const m = this.map;
    // labels on top of everything
    const halo = { "text-halo-color": "rgba(5,8,12,0.85)", "text-halo-width": 1.6, "text-halo-blur": 0.5 };
    const name = nameExpr(lang()) as never;
    m.addLayer({
      id: "place-country",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      filter: ["==", ["get", "class"], "country"],
      layout: {
        "text-field": name,
        "text-font": ["Noto Sans Bold"],
        "text-size": ["interpolate", ["linear"], ["zoom"], 3, 12, 7, 18],
        "text-transform": "uppercase",
        "text-letter-spacing": 0.2,
      },
      paint: { "text-color": "#ffffff", ...halo },
    });
    m.addLayer({
      id: "place-state",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 5,
      maxzoom: 10,
      filter: ["==", ["get", "class"], "state"],
      layout: {
        "text-field": name,
        "text-font": ["Noto Sans Regular"],
        "text-size": 12,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.15,
      },
      paint: { "text-color": "rgba(255,255,255,0.75)", ...halo },
    });
    m.addLayer({
      id: "place-city",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 4.5,
      filter: ["==", ["get", "class"], "city"],
      layout: { "text-field": name, "text-font": ["Noto Sans Bold"], "text-size": ["interpolate", ["linear"], ["zoom"], 5, 12, 12, 17] },
      paint: { "text-color": "#ffffff", ...halo },
    });
    // Only towns (never villages or hamlets): no community-level labels (CLAUDE.md §4).
    m.addLayer({
      id: "place-town",
      type: "symbol",
      source: "osm",
      "source-layer": "place",
      minzoom: 6.5,
      filter: ["==", ["get", "class"], "town"],
      layout: { "text-field": name, "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 7, 12, 13, 16] },
      paint: { "text-color": "#ffffff", ...halo },
    });
  }

  setLabelLang(l: Lang): void {
    void this.ready.then(() => {
      for (const id of LABEL_LAYERS) if (this.map.getLayer(id)) this.map.setLayoutProperty(id, "text-field", nameExpr(l) as never);
    });
  }

  /** Radar scenes go under roads (official map) or under the hexagons (offline test map). */
  private overlayStart(): string {
    return this.map.getLayer("roads") ? "roads" : "hex-grid";
  }

  private sceneLayer(i: number): string {
    return `scene-${i}`;
  }

  private ensureScene(i: number) {
    if (this.present.has(i)) return;
    const id = this.sceneLayer(i);
    this.map.addSource(id, { type: "image", url: this.opts.ds.sceneUrl(i), coordinates: this.opts.ds.index.image_coordinates });
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
      this.overlayStart(),
    );
    this.present.add(i);
  }

  /** Remembers the scene of the current date; draws it (cross-fade) only when the radar view is on. */
  async showScene(i: number): Promise<void> {
    const req = ++this.request;
    const scenes = this.opts.ds.index.scenes;
    if (!scenes[i]) return;
    this.visibleScene = i;
    if (!this.radarOn) return;
    try {
      await preload(this.opts.ds.sceneUrl(i));
    } catch {
      return;
    }
    await this.ready;
    if (req !== this.request) return;
    this.ensureScene(i);
    this.map.moveLayer(this.sceneLayer(i), this.overlayStart());
    this.map.setPaintProperty(this.sceneLayer(i), "raster-opacity", this.radarOpacity);
    window.setTimeout(() => {
      if (req !== this.request) return;
      for (const j of [...this.present]) {
        if (j === i) continue;
        if (Math.abs(j - i) > 1) {
          this.map.removeLayer(this.sceneLayer(j));
          this.map.removeSource(this.sceneLayer(j));
          this.present.delete(j);
        } else {
          this.map.setPaintProperty(this.sceneLayer(j), "raster-opacity", 0);
        }
      }
    }, FADE_MS);
    for (const k of [i + 1, i - 1]) if (scenes[k]) void preload(this.opts.ds.sceneUrl(k)).catch(() => undefined);
  }

  /** Hexagons coloured by the hectares cleared up to scene `upTo`; cells that grew after `newAfter` pulse. */
  async setTime(upTo: number, newAfter = upTo - 1): Promise<void> {
    await this.ready;
    const a = (k: number) => ["coalesce", ["get", `a${Math.max(0, k)}`], 0];
    const shown = [">", a(upTo), 0] as never;
    this.map.setFilter("hex-fill", shown);
    this.map.setFilter("hex-line", shown);
    this.map.setPaintProperty("hex-fill", "fill-color", this.hexColor(upTo));
    this.map.setPaintProperty("hex-line", "line-color", this.hexColor(upTo));
    this.map.setFilter("hex-new", (newAfter < 0 ? shown : [">", a(upTo), a(newAfter)]) as never);
    this.map.setFilter("poly-outline", ["<=", ["get", "t"], upTo] as never);
  }

  /** Radar view on/off (satellite photo underneath stays). */
  async setRadar(on: boolean, opacity = this.radarOpacity): Promise<void> {
    const wasOn = this.radarOn;
    this.radarOn = on;
    this.radarOpacity = opacity;
    await this.ready;
    if (on && (!wasOn || !this.present.has(this.visibleScene))) {
      if (this.visibleScene >= 0) await this.showScene(this.visibleScene);
      return;
    }
    for (const j of this.present) {
      this.map.setPaintProperty(this.sceneLayer(j), "raster-opacity", on && j === this.visibleScene ? opacity : 0);
    }
  }

  async setOutlines(on: boolean): Promise<void> {
    await this.ready;
    this.map.setLayoutProperty("poly-outline", "visibility", on ? "visible" : "none");
  }

  select(cellId: number | null): void {
    if (this.map.getLayer("hex-selected")) this.map.setFilter("hex-selected", ["==", ["get", "id"], cellId ?? -1]);
  }

  hover(cellId: number | null): void {
    if (this.map.getLayer("hex-hover")) this.map.setFilter("hex-hover", ["==", ["get", "id"], cellId ?? -1]);
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
        this.map.setPaintProperty("hex-new", "line-width", 1.5 + s * 4);
        this.map.setPaintProperty("hex-new", "line-opacity", 0.35 + s * 0.65);
      }
      this.pulseRaf = requestAnimationFrame(tick);
    };
    this.pulseRaf = requestAnimationFrame(tick);
  }

}

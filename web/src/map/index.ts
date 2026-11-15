// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// The map chapter. Starts on a real satellite map of Paraguay, flies to the study area and plays
// the timeline. The study area is divided into hexagons coloured by hectares cleared up to the
// chosen date. Hovering shows a quick tooltip; tapping a hexagon zooms in and opens a
// plain-language panel. Modes: timeline (one map + play) and before/after (two synced maps).

import { LngLat, Marker } from "maplibre-gl";
import { renderBars } from "../charts/bars";
import { renderSeries } from "../charts/series";
import { renderWater } from "../charts/water";
import { Swipe } from "../compare/swipe";
import {
  baselineDates,
  type BBox,
  type Dataset,
  daysBetween,
  HEX_GRADIENT,
  HEX_STOPS,
  WATER_GRADIENT,
  WATER_STOPS,
  INSTRUMENT_GAP,
  median,
  type PolygonCollection,
  type PolygonFeature,
  REPEAT_DAYS,
  type ZoneInfo,
} from "../data";
import { fmt, lang, onLang, t } from "../i18n";
import { Timeline } from "../timeline/timeline";
import { buildHexGrid, HEX_RADIUS_M, type HexCell, type HexGrid, hexOutlineIn, MINI_HEX_RADIUS_M, MINI_ZOOM } from "./hexgrid";
import paraguay from "./paraguay.json";
import { type ImageSet, PARAGUAY_BBOX, RadarMap } from "./radar-map";
import { aggregateWater, type WaterCells, waterGeoJSON, waterHa, waterSteps } from "./waterhex";
import { center, nearestTown, SOCCER_FIELD_HA } from "./zone";
import { focusedZone, focusZoneById, onZoneFocus, zoneName } from "../story/zones";

/** One study zone on the map, with its own data (index.json, polygons, series, rain, images). */
interface ZoneSet {
  z: ZoneInfo | null;
  ds: Dataset;
}

/** A nearby reference town is named only this close; further away the panel names the zone. */
const TOWN_KM = 80;

type Mode = "timeline" | "compare";
type View = "satellite" | "radar";

export interface FocusDetail {
  featureId: number;
}


function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

function button(cls: string, label: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", cls, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

const ICON_CLOSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
const ICON_CHEVRON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`;

export async function initMapSection(ds: Dataset): Promise<void> {
  const shell = document.getElementById("map-shell")!;
  const ui = document.getElementById("map-ui")!;
  const status = document.getElementById("map-status")!;
  const containerA = document.getElementById("map-a")!;
  const containerB = document.getElementById("map-b")!;
  const swipeEl = document.getElementById("swipe")!;
  const knob = document.getElementById("swipe-knob") as HTMLButtonElement;
  const { index } = ds;
  const scenes = index.scenes;
  const last = scenes.length - 1;
  /** "±12 days", or the real window when the previous pass is further back (data gaps). */
  const whenNote = (k: number): string => {
    const prev = scenes[k - 1];
    const cur = scenes[k];
    return prev && cur && daysBetween(prev.date, cur.date) > REPEAT_DAYS
      ? t("zone.when_between", { prev: fmt.date(prev.date), date: fmt.date(cur.date) })
      : t("zone.when_note");
  };
  // ------------------------------------------------------------------ zones (zones.json, schema v3)
  // Every zone is on the map at once: hexagons for the clearing and control zones, radar images for the
  // water zone. The timeline is the primary zone's; the other zones' clearings sit at their date on it.
  const loaded = ds.zones.length
    ? await Promise.all(ds.zones.map(async (z) => ({ z, ds: await ds.withZone(z).catch(() => null) })))
    : [{ z: ds.zone, ds }];
  const zoneSets: ZoneSet[] = loaded.filter((s): s is ZoneSet => s.ds !== null);
  if (!zoneSets.some((s) => s.ds === ds)) zoneSets.unshift({ z: ds.zone, ds });
  const primarySet = zoneSets.find((s) => s.ds === ds)!;
  const isWater = (s: ZoneSet) => s.ds.kind === "water";
  const boxOf = (s: ZoneSet): BBox => s.ds.index.aoi.bbox;
  const zoneAt = (lon: number, lat: number): ZoneSet | null =>
    zoneSets.find((s) => {
      const [x0, y0, x1, y1] = boxOf(s);
      return lon >= x0 && lon <= x1 && lat >= y0 && lat <= y1;
    }) ?? null;
  const setOf = (z: ZoneInfo | null): ZoneSet => zoneSets.find((s) => s.z !== null && s.z.id === z?.id) ?? primarySet;
  /** The zone the map flies to (zone picker, tags, ?zona=). */
  let focus = setOf(focusedZone());
  // hexagons with data over every zone: clearing (red) and flooding (purple, the water zone)
  const studyBoxes = zoneSets.map(boxOf);

  // all clearings in one collection; the primary zone first, so its ids match the other chapters'
  const dates = scenes.map((s) => s.date);
  const tOf = (d: string) => Math.max(0, dates.filter((x) => x <= d).length - 1);
  const ordered = [primarySet, ...zoneSets.filter((s) => s !== primarySet)];
  const fcs = await Promise.all(ordered.map((s) => (isWater(s) ? Promise.resolve(null) : s.ds.polygons().catch(() => null))));
  const zoneOfPoly = new Map<number, ZoneSet>();
  const features: PolygonFeature[] = [];
  ordered.forEach((s, k) => {
    for (const f of fcs[k]?.features ?? []) {
      const id = features.length;
      features.push({ ...f, id, properties: { ...f.properties, t: tOf(f.properties.first_date) } });
      zoneOfPoly.set(id, s);
    }
  });
  const polygons: PolygonCollection = { type: "FeatureCollection", features };
  const byId = new Map(polygons.features.map((f) => [f.id as number, f]));
  // big hexagons over all of Paraguay; only the ones over a study zone have radar data
  const hex = buildHexGrid(studyBoxes, polygons, scenes.length, HEX_RADIUS_M, paraguay as [number, number][]);
  // mini hexagons over the study zones, shown inside the big ones when zoomed in
  const mini = buildHexGrid(studyBoxes, polygons, scenes.length, MINI_HEX_RADIUS_M);
  const isMini = (cell: HexCell) => mini.cells[cell.id] === cell;
  const gridAt = (m: RadarMap): HexGrid => (m.map.getZoom() >= MINI_ZOOM ? mini : hex);
  // the same mini grid over the rest of Paraguay (no data), drawn only around the area on screen
  const miniOutline = (view: BBox) => hexOutlineIn(view, studyBoxes, MINI_HEX_RADIUS_M, paraguay as [number, number][]);
  const newArea = scenes.map(() => 0);
  for (const f of polygons.features) {
    const k = f.properties.t ?? 0;
    newArea[k] = (newArea[k] ?? 0) + f.properties.area_ha;
  }
  const zoneBoxes = {
    type: "FeatureCollection" as const,
    features: zoneSets.map((s) => {
      const [x0, y0, x1, y1] = boxOf(s);
      return { type: "Feature", properties: { id: s.z?.id ?? "", kind: s.ds.kind }, geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } };
    }),
  };
  // radar images of every zone, shown in the "NISAR radar" view only (the simple map stays grey and white)
  const imageSets: ImageSet[] = zoneSets.map((s): ImageSet => ({ key: s.z?.id ?? "main", ds: s.ds, always: false }));
  // flooding in hexagons: hectares under water per hexagon and date, counted from the water-classes images
  const waterSet = zoneSets.find(isWater) ?? null;
  let water: { big: WaterCells; mini: WaterCells; steps: number[]; geo: { big: ReturnType<typeof waterGeoJSON>; mini: ReturnType<typeof waterGeoJSON> } } | null = null;
  /** Hectares under water in a hexagon at timeline step t (open water and flooded vegetation). */
  const waterAt = (cell: HexCell, t: number) => {
    if (!water) return { open: 0, flooded: 0 };
    return waterHa(isMini(cell) ? water.mini : water.big, cell.id, water.steps[t] ?? -1);
  };
  const waterProv = zoneSets.find(isWater)?.ds.provenance("water");

  // TEST build only (vite --mode lab): AI assistant, expert mode, offline basemap. Never in the official build.
  const lab =
    import.meta.env.MODE === "lab"
      ? (await import("../lab")).createLab({
          ds,
          hex,
          polygonsById: byId,
          closeZone: () => closeZone(),
          timelineMode: () => setMode("timeline"),
          refresh: () => {
            if (selected && !zone.hidden) renderHex(selected, false);
          },
          setOutlines: (on) => {
            layers.outlines = on;
            applyLayers();
            renderPanel();
          },
        })
      : null;

  // Paraguay-wide NISAR quick-look mosaics (ASF browse images), built offline into data/mosaic/
  type MosaicStep = { until: string; file: string; dates: string[]; coverage_of_paraguay: number };
  const mosaicMeta = await fetch(ds.url("mosaic/mosaic.json"))
    .then((r) =>
      r.ok ? (r.json() as Promise<{ coordinates: [[number, number], [number, number], [number, number], [number, number]]; timeline?: MosaicStep[] }>) : null,
    )
    .catch(() => null);
  const mosaicSteps = mosaicMeta?.timeline ?? [];
  const mosaic = mosaicMeta
    ? {
        files: Object.fromEntries([
          ["before", ds.url("mosaic/before.webp")],
          ["after", ds.url("mosaic/after.webp")],
          ...mosaicSteps.map((m) => [m.until, ds.url(`mosaic/${m.file}`)]),
        ]) as Record<string, string>,
        coordinates: mosaicMeta.coordinates,
      }
    : undefined;
  /**
   * Timeline: the country as NISAR last saw it up to that date: the mosaic of the latest month-end at or before
   * it (each pixel = the latest pass up to then). Before the first month-end, none.
   */
  const mosaicAt = (iso: string | undefined): string | null => {
    if (!iso) return null;
    let k: string | null = null;
    for (const m of mosaicSteps) if (m.until.slice(0, 7) <= iso.slice(0, 7)) k = m.until;
    return k;
  };
  // Before / after: the "before" mosaic mixes dates (Nov 2025 - Jan 2026 in the west and centre, Jun - Jul 2026 in
  // the east, where NISAR first passed in June); the timeline uses the month-by-month mosaics instead.
  const mapOpts = { ds, polygons, hex, mini, miniOutline, zoneBoxes, imageSets, mosaic, offline: lab?.offline };
  const mapA = new RadarMap({ container: containerA, ...mapOpts, bbox: boxOf(focus), controls: true, start: "country" });
  let mapB: RadarMap | null = null;
  let swipe: Swipe | null = null;
  let mode: Mode = "timeline";
  let view: View = "satellite";
  let cur = 0;
  let before = Math.min(baselineDates(index) - 1, last);
  let after = last;
  let selected: HexCell | null = null;
  let marker: Marker | null = null;
  const layers = { outlines: lab?.outlinesAtStart ?? false, opacity: 0.9 };

  mapA.map.on("error", (e) => console.warn("CLEAR map:", e.error?.message));
  if (import.meta.env.DEV || import.meta.env.MODE === "lab") (window as unknown as { __clear: unknown }).__clear = { mapA, hex };
  await mapA.ready.catch(() => undefined);

  // ------------------------------------------------------------------ fires (VIIRS), red hatched
  // NASA FIRMS VIIRS detections (GIBS daily images, Nov 2025 - Oct 2026) aggregated offline into the site's own
  // hexagons (data/hazards/fires.json): days with fire per hexagon over the country (map layer) and, inside the
  // zones, the fire dates (hexagon panel: clearing with or without fire around its date). Red like the clearing,
  // but hatched, and drawn under it.
  type FireData = {
    meta: { start: string };
    big: [number, number, number][];
    mini: [number, number, number][];
    big_dates: Record<string, number[]>;
    mini_dates: Record<string, number[]>;
  };
  let fires: FireData | null = null;
  let firesOn = true;
  // only the quarter of hexagons with the most fire days: there are burns almost everywhere, all of them would
  // paint the country red and hide the radar clearing
  const FIRE_MIN = { big: 80, mini: 6 };
  const [g0, g1, g2, g3] = studyBoxes[0]!;
  const gLon0 = (g0 + g2) / 2;
  const gLat0 = (g1 + g3) / 2;
  const gkx = 111_320 * Math.cos((gLat0 * Math.PI) / 180);
  const gky = 110_574;
  const S3 = Math.sqrt(3);
  /** Axial key "q,r" of the hexagon of radius R holding lon/lat (same grid as hexgrid.ts). */
  const fireKey = (lon: number, lat: number, R: number): string => {
    const x = (lon - gLon0) * gkx;
    const y = (lat - gLat0) * gky;
    const fq = ((S3 / 3) * x - y / 3) / R;
    const fr = ((2 / 3) * y) / R;
    const fs = -fq - fr;
    let q = Math.round(fq);
    let r = Math.round(fr);
    const s = Math.round(fs);
    const dq = Math.abs(q - fq);
    const dr = Math.abs(r - fr);
    const ds2 = Math.abs(s - fs);
    if (dq > dr && dq > ds2) q = -r - s;
    else if (dr > ds2) r = -q - s;
    return `${q},${r}`;
  };
  const fireGeo = (cells: [number, number, number][], R: number, min: number) => ({
    type: "FeatureCollection",
    features: cells
      .filter((c) => c[2] >= min)
      .map(([q, r, v]) => {
        const cx = R * S3 * (q + r / 2);
        const cy = R * 1.5 * r;
        const ring: [number, number][] = [];
        for (let i = 0; i <= 6; i++) {
          const a = ((60 * (i % 6) - 30) * Math.PI) / 180;
          ring.push([gLon0 + (cx + R * Math.cos(a)) / gkx, gLat0 + (cy + R * Math.sin(a)) / gky]);
        }
        return { type: "Feature", properties: { v }, geometry: { type: "Polygon", coordinates: [ring] } };
      }),
  });
  /** Red diagonal stripes on transparent: the fire pattern (and the panel swatch). */
  const hatch = () => {
    const n = 12;
    const c = document.createElement("canvas");
    c.width = c.height = n;
    const x = c.getContext("2d")!;
    x.strokeStyle = "rgba(214, 0, 0, 0.85)";
    x.lineWidth = 3;
    for (const o of [-n, 0, n]) {
      x.beginPath();
      x.moveTo(o, n);
      x.lineTo(o + n, 0);
      x.stroke();
    }
    return x.getImageData(0, 0, n, n);
  };
  async function paintFires() {
    const mm = mapA.map;
    if (!fires) {
      fires = await fetch(ds.url("hazards/fires.json"))
        .then((r) => (r.ok ? (r.json() as Promise<FireData>) : null))
        .catch(() => null);
      if (!fires) return;
    }
    // (checked after the fetch: two calls may have waited for it)
    if (!mm.getSource("fire-big")) {
      if (!mm.hasImage("fire-hatch")) mm.addImage("fire-hatch", hatch());
      const below = mm.getLayer("hex-fill") ? "hex-fill" : undefined;
      const [z0, z1] = [MINI_ZOOM - 0.4, MINI_ZOOM + 0.4];
      mm.addSource("fire-big", { type: "geojson", data: fireGeo(fires.big, HEX_RADIUS_M, FIRE_MIN.big) as never });
      mm.addSource("fire-mini", { type: "geojson", data: fireGeo(fires.mini, MINI_HEX_RADIUS_M, FIRE_MIN.mini) as never });
      mm.addLayer({ id: "fire-big", type: "fill", source: "fire-big", paint: { "fill-pattern": "fire-hatch", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.9, z0, 0.9, z1, 0] as never } }, below);
      mm.addLayer({ id: "fire-mini", type: "fill", source: "fire-mini", minzoom: z0, paint: { "fill-pattern": "fire-hatch", "fill-opacity": ["interpolate", ["linear"], ["zoom"], z0, 0, z1, 0.9] as never } }, below);
    }
    const on = firesOn && view !== "radar";
    for (const id of ["fire-big", "fire-mini"]) {
      if (mm.getLayer(id)) mm.setLayoutProperty(id, "visibility", on ? "visible" : "none");
    }
  }
  let fireDays: { big: Map<string, number>; mini: Map<string, number> } | null = null;
  const fireMaps = (f: FireData) => (fireDays ??= { big: new Map(f.big.map(([q, r, v]) => [`${q},${r}`, v])), mini: new Map(f.mini.map(([q, r, v]) => [`${q},${r}`, v])) });
  /** Fire days of a hexagon cell when it is drawn hatched (enough days for its level), else 0. */
  const cellFireDays = (cell: HexCell): number => {
    if (!fires || !firesOn) return 0;
    const fd = fireMaps(fires);
    const m = isMini(cell);
    const days = (m ? fd.mini : fd.big).get(fireKey(cell.center[0], cell.center[1], m ? MINI_HEX_RADIUS_M : HEX_RADIUS_M)) ?? 0;
    return days >= (m ? FIRE_MIN.mini : FIRE_MIN.big) ? days : 0;
  };
  /** Fire days of the drawn (hatched) hexagon under lon/lat at the zoom on screen, or null. */
  const fireDaysAt = (lon: number, lat: number): { days: number; mini: boolean } | null => {
    if (!fires || !firesOn) return null;
    const fd = fireMaps(fires);
    const isMiniLevel = mapA.map.getZoom() >= MINI_ZOOM;
    const days = (isMiniLevel ? fd.mini : fd.big).get(fireKey(lon, lat, isMiniLevel ? MINI_HEX_RADIUS_M : HEX_RADIUS_M)) ?? 0;
    return days >= (isMiniLevel ? FIRE_MIN.mini : FIRE_MIN.big) ? { days, mini: isMiniLevel } : null;
  };
  /** Fire facts of a hexagon around a clearing date: days with fire, and the ones from 36 days before to 60 after. */
  const fireNear = (cell: HexCell, isoDate: string) => {
    if (!fires) return null;
    const miniCell = isMini(cell);
    const key = fireKey(cell.center[0], cell.center[1], miniCell ? MINI_HEX_RADIUS_M : HEX_RADIUS_M);
    const offs = (miniCell ? fires.mini_dates : fires.big_dates)[key] ?? [];
    const t0 = Date.parse(fires.meta.start);
    const at = isoDate ? Math.round((Date.parse(isoDate) - t0) / 86_400_000) : NaN;
    const near = Number.isFinite(at) ? offs.filter((o) => o >= at - 36 && o <= at + 60) : [];
    const iso = (o: number) => new Date(t0 + o * 86_400_000).toISOString().slice(0, 10);
    return { days: offs.length, near: near.length, from: near.length ? iso(near[0]!) : "", to: near.length ? iso(near[near.length - 1]!) : "" };
  };
  status.hidden = true;
  ui.hidden = false;

  if (waterSet) {
    void aggregateWater(waterSet.ds, [hex, mini]).then(([big, mn]) => {
      if (!big || !mn) return;
      const steps = waterSteps(big, dates);
      water = { big, mini: mn, steps, geo: { big: waterGeoJSON(big, hex, steps), mini: waterGeoJSON(mn, mini, steps) } };
      mapA.setWaterHex(water.geo.big, water.geo.mini);
      mapB?.setWaterHex(water.geo.big, water.geo.mini);
      waterRedraw?.();
    });
  }

  // a tag on the top-left corner of each zone's box; tapping it flies there (no page reload)
  const zoneTags = zoneSets.map((s) => {
    const tag = button(`zone-tag zone-kind-${s.ds.kind}`, "", () => {
      if (s.z) focusZoneById(s.z.id);
      else flyToStudy();
    });
    // the tag sits on the map: keep its clicks from also reaching the map (that read as a tap just
    // outside the zone's box and opened the "outside the study area" panel)
    for (const ev of ["mousedown", "mouseup", "click", "dblclick", "pointerdown", "pointerup", "touchstart", "touchend"]) {
      tag.addEventListener(ev, (e) => e.stopPropagation());
    }
    const [x0, , , y1] = boxOf(s);
    new Marker({ element: tag, anchor: "bottom-left", offset: [-2, -6] }).setLngLat([x0, y1]).addTo(mapA.map);
    return { tag, s };
  });
  const paintZoneTags = () => {
    for (const { tag, s } of zoneTags) {
      tag.textContent = s.z ? `${zoneName(s.z)} · ${t(`zones.kind_${s.z.kind}`)}` : t("map.study_area");
      tag.classList.toggle("is-focus", s === focus);
      tag.setAttribute("aria-pressed", String(s === focus));
    }
  };
  paintZoneTags();

  // ------------------------------------------------------------------ UI skeleton
  const modeBar = h("div", "map-modes seg");
  const panel = h("aside", "map-card map-panel");
  const timeline = new Timeline({ scenes, newArea, newCount: mini.newCells, onChange: (i) => showTimeline(i) });
  const compareBar = h("div", "compare-bar");
  const zone = h("aside", "zone");
  zone.hidden = true;
  const toast = h("div", "map-toast");
  toast.hidden = true;
  const tip = h("div", "hex-tip");
  tip.hidden = true;
  const dock = h("div", "map-dock");
  dock.append(timeline.el, compareBar);
  ui.append(modeBar, panel, toast, dock, zone, tip);
  if (lab) ui.append(...lab.overlay);

  const isNarrow = () => shell.clientWidth < 760;
  const padding = () =>
    isNarrow()
      ? { top: 120, bottom: Math.round(shell.clientHeight * 0.58), left: 24, right: 24 }
      : { top: 110, bottom: 210, left: 380, right: zone.hidden ? 80 : 500 };
  const upTo = () => (mode === "timeline" ? cur : after);

  function flyToStudy(duration = 2200) {
    const p = padding();
    mapA.map.fitBounds(boxOf(focus), { padding: { ...p, right: isNarrow() ? 24 : 80, bottom: isNarrow() ? 190 : p.bottom }, duration, essential: true });
  }
  /** Room for the Layers panel (left) and the timeline (bottom), so the whole country, Ñeembucú included, shows. */
  const countryPadding = () => {
    const dockH = (dock.offsetHeight || 90) + 48;
    return isNarrow() ? { top: 70, bottom: dockH, left: 16, right: 16 } : { top: 80, bottom: dockH, left: 340, right: 70 };
  };
  function flyToCountry() {
    closeZone();
    mapA.map.fitBounds(PARAGUAY_BBOX, { padding: countryPadding(), duration: 2000, essential: true });
  }

  // before/after opens each clearing zone on the dates and the spot where the change is easiest to see
  // with the eye (found offline in the site's own radar images: forest, yellow-green, turned into new blue
  // paddocks). Water and control zones keep the usual view: their radar change is too faint to see.
  const CHANGE_SPOTS: Record<string, { before: string; after: string; center: [number, number]; hint: string }> = {
    "boqueron-norte": {
      before: "2025-11-21",
      after: "2026-09-17",
      center: [-61.1739, -20.7598],
      hint: "spot.hint_blue",
    },
    "boqueron-sur": {
      before: "2026-01-08",
      after: "2026-09-29",
      center: [-61.2487, -22.4904],
      hint: "spot.hint_lilac",
    },
  };
  /** Before/after on the change spot of the focused zone; false when the zone has none. */
  function goChangeSpot(): boolean {
    const spot = CHANGE_SPOTS[focus.z?.id ?? ""];
    const b = spot ? scenes.findIndex((s) => s.date === spot.before) : -1;
    const a = spot ? scenes.findIndex((s) => s.date === spot.after) : -1;
    if (!spot || b < 0 || a <= b) return false;
    before = b;
    after = a;
    showCompare();
    // the whole spot just right of the swipe line (middle of the map): it shows "after", and dragging the bar
    // to the right turns it back into "before"
    const p = { top: 90, bottom: isNarrow() ? 200 : 160, left: 0, right: 0 };
    const off: [number, number] = [isNarrow() ? 90 : 190, 0];
    mapA.map.flyTo({ center: spot.center, zoom: 12, padding: p, offset: off, duration: 1800, essential: true });
    showToast(t(spot.hint), 9000);
    return true;
  }

  let toastTimer = 0;
  function showToast(text: string, ms = 5200) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), ms);
  }

  // ------------------------------------------------------------------ rendering
  function renderModes() {
    modeBar.innerHTML = "";
    for (const m of ["timeline", "compare"] as const) {
      const b = button("", t(m === "timeline" ? "map.mode_timeline" : "map.mode_compare"), () => setMode(m));
      b.setAttribute("aria-pressed", String(mode === m));
      modeBar.append(b);
    }
  }

  function provRow(label: string, type: string, source: string, extra?: string) {
    const li = h("li");
    li.append(h("b", "", label), h("span", `ptype ptype-${type}`, t(`prov.type_${type}`)), h("span", "psrc", source));
    if (extra) li.append(h("span", "pmat", extra));
    return li;
  }

  /** Swatches of the water-classes layer (colours of the published PNGs). */
  function waterLegend(): HTMLElement {
    const wrap = h("div", "water-legend");
    wrap.append(h("span", "wl wl-open", t("water.open")), h("span", "wl wl-veg", t("water.flooded")), h("span", "wl-est", t("water.estimated")));
    return wrap;
  }

  function rampLegend(gradient: string, stops: [number, string][]): HTMLElement {
    const wrap = h("div", "hex-legend");
    const ramp = h("div", "ramp");
    ramp.style.background = gradient;
    const labels = h("div", "ramp-labels");
    stops.forEach(([v], i) => labels.append(h("span", "", i === stops.length - 1 ? `${fmt.num(v)}+` : fmt.num(v))));
    wrap.append(ramp, labels);
    return wrap;
  }

  function hexLegend(): HTMLElement {
    return rampLegend(HEX_GRADIENT, HEX_STOPS);
  }

  // Layers panel open / folded: open on a computer, folded on a phone (the map needs the room); the
  // chevron works on both (it used to fold only on phones).
  let panelOpen = !isNarrow();
  const paintPanelState = (toggle?: HTMLElement) => {
    panel.classList.toggle("is-open", panelOpen);
    panel.classList.toggle("is-closed", !panelOpen);
    toggle?.setAttribute("aria-expanded", String(panelOpen));
  };

  function renderPanel() {
    const scene = scenes[upTo()];
    const moreOpen = panel.querySelector("details.more")?.hasAttribute("open") ?? false;
    panel.innerHTML = "";
    const head = h("div", "panel-head");
    head.append(h("h3", "", t("map.panel")));
    const toggle = h("button", "icon-btn panel-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-label", t("map.panel"));
    toggle.innerHTML = ICON_CHEVRON;
    toggle.addEventListener("click", () => {
      panelOpen = !panelOpen;
      paintPanelState(toggle);
    });
    // the whole header row folds / unfolds too (a bigger target than the chevron)
    head.addEventListener("click", (e) => {
      if (e.target === head || (e.target as HTMLElement).tagName === "H3") toggle.click();
    });
    head.append(toggle);
    paintPanelState(toggle);

    const body = h("div", "panel-body");
    if (zoneSets.length > 1) {
      body.append(h("p", "panel-label", t("zones.label")));
      const list = h("div", "panel-zones");
      for (const s of zoneSets) {
        if (!s.z) continue;
        const z = s.z;
        const b = button(`panel-zone zone-kind-${z.kind}`, zoneName(z), () => focusZoneById(z.id));
        // the kind in words: the dot colour alone could be read as a water class (blue / green)
        b.append(h("span", "panel-zone-kind", t(`zones.kind_${z.kind}`)));
        b.setAttribute("aria-pressed", String(s === focus));
        list.append(b);
      }
      body.append(list);
      if (focus.z && focus.z.kind !== "clearing") body.append(h("p", "panel-note", t(`zones.note_${focus.z.kind}`)));
    }
    body.append(h("p", "panel-label", t("map.view")));
    const seg = h("div", "seg seg-block");
    for (const v of ["satellite", "radar"] as const) {
      const b = button("", t(v === "satellite" ? "map.view_satellite" : "map.view_radar"), () => setView(v));
      b.setAttribute("aria-pressed", String(view === v));
      seg.append(b);
    }
    body.append(seg);

    if (view === "radar") {
      // over the radar images there are no hexagons: say where they are
      body.append(h("p", "panel-note panel-note-strong", t("map.radar_nohex")));
      // what the country mosaic is (and is not)
      if (mosaicMeta) body.append(h("p", "panel-note", t("mosaic.note")));
    } else {
      body.append(h("p", "panel-label", t("map.legend_polys")), hexLegend());
      body.append(h("p", "panel-note", t("map.hex_size", { ha: fmt.num(hex.cells[0]?.areaHa ?? 0), mini: fmt.num(mini.cells[0]?.areaHa ?? 0) })));
      body.append(h("p", "panel-note", t("map.hex_nodata")));
      // fire layer toggle
      {
        const row = h("label", "fire-row");
        const cb = h("input");
        cb.type = "checkbox";
        cb.checked = firesOn;
        cb.addEventListener("change", () => {
          firesOn = cb.checked;
          void paintFires();
        });
        row.append(cb, h("i", "fire-swatch"), h("span", "", t("fire.toggle")));
        body.append(row, h("p", "panel-note", t("fire.toggle_note", { big: FIRE_MIN.big, mini: FIRE_MIN.mini })));
      }
      // flooding legend, always on the simple map: the purple hexagons show whatever the zone in focus
      if (waterSet) body.append(h("p", "panel-label", t("water.legend_hex", { zone: waterSet.z ? zoneName(waterSet.z) : "" })), rampLegend(WATER_GRADIENT, WATER_STOPS));
    }

    const zoomedOut = mapA.map.getZoom() < 8.5;
    // the offline test map only has imagery around the study area: no "all of Paraguay" view there
    if (!lab || zoomedOut) {
      body.append(
        button("btn btn-ghost btn-sm btn-block", zoomedOut ? t("map.go_study") : t("map.go_country"), () => (zoomedOut ? flyToStudy() : flyToCountry())),
      );
    }
    body.append(
      button("btn btn-link btn-block", t("map.help"), () => document.getElementById("guide")?.scrollIntoView({ behavior: "smooth" })),
    );

    const more = h("details", "more");
    if (moreOpen) more.setAttribute("open", "");
    more.append(h("summary", "", t("map.more")));
    const sw = h("label", "switch");
    const input = h("input");
    input.type = "checkbox";
    input.checked = layers.outlines;
    input.addEventListener("change", () => {
      layers.outlines = input.checked;
      applyLayers();
    });
    sw.append(input, h("i"), h("span", "", t("map.layer_polygons")));
    more.append(sw);
    if (view === "radar") {
      const range = h("label", "range");
      const r = h("input");
      r.type = "range";
      r.min = "0.2";
      r.max = "1";
      r.step = "0.01";
      r.value = String(layers.opacity);
      r.addEventListener("input", () => {
        layers.opacity = Number(r.value);
        applyLayers();
      });
      range.append(h("span", "", t("map.opacity")), r);
      more.append(range);
    }
    more.append(h("p", "panel-label", t("map.sources")));
    const prov = h("ul", "prov");
    const rgb = ds.provenance("rgb");
    if (rgb && scene) {
      prov.append(provRow(t("prov.layer_rgb"), rgb.type, rgb.source, `${t("prov.scene")} ${fmt.date(scene.date)}: ${t(`prov.${scene.maturity}`)} · ${scene.crid}`));
    }
    const pp = ds.provenance("polygons");
    if (pp) prov.append(provRow(t("prov.layer_polygons"), pp.type, pp.source));
    const fm = ds.provenance("forest_mask");
    if (fm) prov.append(provRow(t("prov.layer_mask"), fm.type, fm.source));
    if (waterProv) prov.append(provRow(t("water.layer"), waterProv.type, waterProv.source, t("water.estimated")));
    prov.append(provRow(t("prov.layer_basemap"), "modeled", "Natural Earth 1:10m (public domain)"));
    more.append(prov, h("p", "fineprint", t("map.ethics")));
    body.append(more);
    panel.append(head, body);
  }

  function renderCompareBar() {
    compareBar.innerHTML = "";
    const mkSelect = (label: string, value: number, onPick: (i: number) => void, cls: string) => {
      const wrap = h("label", `cmp ${cls}`);
      wrap.append(h("span", "", label));
      const sel = h("select");
      scenes.forEach((s, i) => {
        const o = h("option", "", fmt.date(s.date, true));
        o.value = String(i);
        o.selected = i === value;
        sel.append(o);
      });
      sel.addEventListener("change", () => onPick(Number(sel.value)));
      wrap.append(sel);
      return wrap;
    };
    compareBar.append(
      mkSelect(t("map.before"), before, (i) => {
        before = i;
        if (after <= before) after = Math.min(last, before + 1);
        showCompare();
      }, "cmp-a"),
      h("span", "cmp-arrow", "→"),
      mkSelect(t("map.after"), after, (i) => {
        after = i;
        if (before >= after) before = Math.max(0, after - 1);
        showCompare();
      }, "cmp-b"),
    );
    const area = polygons.features
      .filter((f) => (f.properties.t ?? 0) > before && (f.properties.t ?? 0) <= after)
      .reduce((s, f) => s + f.properties.area_ha, 0);
    const stat = h("p", "cmp-stat");
    stat.append(h("b", "", fmt.num(area)), document.createTextNode(` ${t("map.stat_area")}`));
    compareBar.append(stat);
  }

  function applyLayers() {
    for (const m of [mapA, mapB]) {
      if (!m) continue;
      void m.setRadar(view === "radar", layers.opacity);
      void m.setOutlines(layers.outlines);
      // red / purple hexagons only on the simple map; over the radar images (radar view, before/after) the image alone
      m.setHexagons(view !== "radar");
    }
    void paintFires();
  }

  function setView(v: View) {
    view = v;
    applyLayers();
    renderPanel();
  }

  // ------------------------------------------------------------------ modes
  function showTimeline(i: number) {
    cur = i;
    mapA.setMosaic(mosaicAt(scenes[i]?.date));
    void mapA.showScene(i);
    void mapA.setTime(i);
    renderPanel();
    if (selected && !zone.hidden) renderHex(selected, false);
    waterRedraw?.();
  }

  function showCompare() {
    mapA.setMosaic(mosaicMeta ? "before" : null);
    mapB?.setMosaic(mosaicMeta ? "after" : null);
    void mapA.showScene(before);
    void mapA.setTime(before);
    if (mapB) {
      void mapB.showScene(after);
      void mapB.setTime(after, before);
    }
    document.getElementById("swipe-tag-a")!.textContent = `${t("map.before")} · ${fmt.date(scenes[before]?.date ?? "")}`;
    document.getElementById("swipe-tag-b")!.textContent = `${t("map.after")} · ${fmt.date(scenes[after]?.date ?? "")}`;
    renderCompareBar();
    renderPanel();
    if (selected && !zone.hidden) renderHex(selected, false);
    waterRedraw?.();
  }

  function setMode(next: Mode) {
    if (next === mode) return;
    mode = next;
    shell.dataset.mode = mode;
    renderModes();
    if (mode === "compare") {
      timeline.pause();
      containerB.hidden = false;
      swipeEl.hidden = false;
      if (!mapB) {
        mapB = new RadarMap({ container: containerB, ...mapOpts, bbox: boxOf(focus), controls: false, start: "study" });
        mapB.map.on("click", (e) => focusZone(e.lngLat));
        if (water) mapB.setWaterHex(water.geo.big, water.geo.mini);
        mapB.setPulse(true);
      }
      mapB.map.resize();
      swipe = new Swipe(shell, containerB, knob, mapA.map, mapB.map);
      if (view !== "radar") {
        view = "radar";
        showToast(t("map.compare_hint"));
      }
      applyLayers();
      if (!goChangeSpot()) showCompare();
    } else {
      swipe?.destroy();
      swipe = null;
      containerB.hidden = true;
      swipeEl.hidden = true;
      showTimeline(timeline.index);
    }
  }

  // ------------------------------------------------------------------ hover tooltip (mouse only)
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  let hovered: string | null = null;
  function onMove(e: { lngLat: LngLat; point: { x: number; y: number } }, from: RadarMap) {
    // no hexagons over the radar images: no hexagon outline or tooltip either
    const cell = view === "radar" ? null : gridAt(from).locate(e.lngLat.lng, e.lngLat.lat);
    const key = cell ? `${isMini(cell) ? "m" : "h"}${cell.id}` : null;
    if (key !== hovered) {
      hovered = key;
      const small = cell ? isMini(cell) : false;
      mapA.hover(cell?.id ?? null, small);
      mapB?.hover(cell?.id ?? null, small);
    }
    const ha = cell ? (cell.cumHa[from === mapB ? after : upTo()] ?? 0) : 0;
    const wz = cell ? null : zoneAt(e.lngLat.lng, e.lngLat.lat);
    from.map.getCanvas().style.cursor = cell || (wz && isWater(wz)) ? "pointer" : "";
    const wet = cell && ha <= 0 ? waterAt(cell, from === mapB ? after : upTo()) : null;
    const wha = wet ? wet.open + wet.flooded : 0;
    if (!cell || (ha <= 0 && wha <= 0)) {
      tip.hidden = true;
      return;
    }
    tip.textContent =
      ha > 0
        ? t("hex.tooltip", { ha: fmt.num(ha, ha < 10 ? 1 : 0), pct: fmt.num((ha / cell.areaHa) * 100) })
        : t("water.tooltip", { ha: fmt.num(wha), pct: fmt.num((wha / cell.areaHa) * 100) });
    tip.hidden = false;
    const r = shell.getBoundingClientRect();
    const c = from.map.getContainer().getBoundingClientRect();
    tip.style.transform = `translate(${c.left - r.left + e.point.x + 14}px, ${c.top - r.top + e.point.y + 14}px)`;
  }
  if (finePointer) {
    mapA.map.on("mousemove", (e) => onMove(e, mapA));
    mapA.map.on("mouseout", () => {
      tip.hidden = true;
      mapA.hover(null);
      hovered = null;
    });
  }

  // ------------------------------------------------------------------ hexagon panel
  function fact(label: string, value: string, note?: string, cls = "") {
    const d = h("div", `fact ${cls}`);
    d.append(h("span", "fact-label", label), h("b", "fact-value", value));
    if (note) d.append(h("span", "fact-note", note));
    return d;
  }

  function closeButton() {
    const close = button("icon-btn", "", closeZone);
    close.innerHTML = ICON_CLOSE;
    close.setAttribute("aria-label", t("map.close"));
    return close;
  }

  let coachShown = false;
  function focusZone(lngLat: LngLat) {
    timeline.pause();
    toast.hidden = true;
    coachShown = true;
    const zs = zoneAt(lngLat.lng, lngLat.lat);
    if (zs && isWater(zs)) {
      renderWaterZone(zs, lngLat);
      return;
    }
    const cell = gridAt(mapA).locate(lngLat.lng, lngLat.lat);
    // a red hatched (fire) hexagon outside the study zones, with no radar clearing
    if (!zs && (!cell || (cell.cumHa[last] ?? 0) <= 0)) {
      const fd = fireDaysAt(lngLat.lng, lngLat.lat);
      if (fd) {
        renderFireOutside(lngLat, fd);
        return;
      }
    }
    if (!cell) {
      renderOutside();
      return;
    }
    // an edge hexagon of the water zone (tapped just outside its box) is a flooding hexagon too
    const wc = water ? (isMini(cell) ? water.mini : water.big) : null;
    if (waterSet && wc && (wc.open.has(cell.id) || wc.flooded.has(cell.id)) && (cell.cumHa[last] ?? 0) <= 0) {
      renderWaterZone(waterSet, lngLat);
      return;
    }
    zone.hidden = false;
    // tapping a hexagon that only clears later: jump to the last date so the panel shows it all
    if (mode === "timeline" && cell.firstT !== null && cur < cell.firstT) timeline.set(last);
    renderHex(cell, true);
    const lons = cell.ring.map((p) => p[0]);
    const lats = cell.ring.map((p) => p[1]);
    mapA.map.fitBounds([Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], {
      padding: padding(),
      maxZoom: 13.2,
      duration: 1400,
      essential: true,
    });
  }

  /**
   * Water zone panel: estimated water areas per date (water.json, synced with the timeline) and, when a
   * point was tapped, the radar signal and the rain there.
   */
  let waterRedraw: (() => void) | null = null;
  function renderWaterZone(zs: ZoneSet, lngLat?: LngLat) {
    closeZone();
    zone.hidden = false;
    if (lngLat) {
      if (!marker) marker = new Marker({ element: h("div", "probe-marker") });
      marker.setLngLat(lngLat).addTo(mapA.map);
    }
    const name = zs.z ? zoneName(zs.z) : "";
    const head = h("div", "zone-head");
    const titles = h("div");
    titles.append(h("h3", "", t("water.title", { zone: name })), h("p", "zone-where", t("water.subtitle")));
    head.append(titles, closeButton());
    zone.append(head);
    // the tapped hexagon: hectares under water at the timeline's date
    const cell = lngLat ? gridAt(mapA).locate(lngLat.lng, lngLat.lat) : null;
    const facts = h("div", "facts");
    const paintFacts = () => {
      facts.innerHTML = "";
      if (!cell) return;
      mapA.select(cell.id, isMini(cell));
      mapB?.select(cell.id, isMini(cell));
      const { open, flooded } = waterAt(cell, upTo());
      const tot = open + flooded;
      facts.append(
        fact(t("water.in_hex"), `${fmt.num(tot)} ha`, t("water.in_hex_note", { pct: fmt.num((tot / cell.areaHa) * 100) }), tot > 0 ? "fact-water" : ""),
        fact(t("water.open"), `${fmt.num(open)} ha`, t("water.estimated")),
        fact(t("water.flooded"), `${fmt.num(flooded)} ha`, t("water.estimated")),
      );
    };
    paintFacts();
    zone.append(facts);

    const sec = h("section", "zone-chart");
    const reading = h("p", "probe-reading", t("chart.loading"));
    const host = h("div", "probe-chart");
    sec.append(h("h4", "", t("water.chart_title")), waterLegend(), h("p", "zone-help", t("water.chart_help")), reading, host, h("p", "water-note", t("water.rice")));
    zone.append(sec);
    void zs.ds.waterSeries().then((w) => {
      if (!w || !host.isConnected) {
        reading.textContent = t("water.none");
        return;
      }
      const draw = () => renderWater(host, reading, w, scenes[upTo()]?.date ?? "");
      waterRedraw = () => {
        if (!host.isConnected) return;
        draw();
        paintFacts();
      };
      draw();
      new ResizeObserver(() => waterRedraw?.()).observe(host);
    });

    if (lngLat) {
      const signal = h("details", "zone-signal");
      signal.open = true;
      signal.append(h("summary", "", t("point.title")));
      const r2 = h("p", "probe-reading", t("chart.loading"));
      const chart = h("div", "probe-chart");
      const legend = h("div", "probe-legend");
      signal.append(
        h("p", "zone-help", `${t("point.where", { lat: fmt.num(lngLat.lat, 4), lon: fmt.num(lngLat.lng, 4) })} · ${t("point.help")}`),
        r2,
        chart,
        legend,
      );
      zone.append(signal);
      void drawSignal([lngLat.lng, lngLat.lat], undefined, r2, chart, legend, true, zs);
    } else {
      zone.append(h("p", "zone-help", t("water.tap")));
    }
    zone.append(h("p", "fineprint", t("point.note")));
  }

  /** Panel of a fire (hatched) hexagon outside the study zones. */
  function renderFireOutside(lngLat: LngLat, fd: { days: number; mini: boolean }) {
    closeZone();
    zone.hidden = false;
    if (!marker) marker = new Marker({ element: h("div", "probe-marker") });
    marker.setLngLat(lngLat).addTo(mapA.map);
    const town = nearestTown([lngLat.lng, lngLat.lat]);
    const head = h("div", "zone-head");
    const titles = h("div");
    titles.append(
      h("h3", "", t("fire.outside_title")),
      h("p", "zone-where", t("zone.where_value", { km: fmt.num(town.km), dir: t(`dir.${town.dir}`), town: town.name })),
    );
    head.append(titles, closeButton());
    const facts = h("div", "facts");
    facts.append(
      fact(
        t("fire.observed"),
        t("fire.days", { n: fmt.num(fd.days) }),
        t("fire.outside_hex", { km: fd.mini ? 2 : 24 }),
        "fact-fire",
      ),
    );
    zone.append(
      head,
      facts,
      h(
        "p",
        "zone-text",
        t("fire.outside_body"),
      ),
      button("btn btn-primary btn-sm", t("map.go_study"), () => {
        closeZone();
        flyToStudy();
      }),
    );
  }

  function renderOutside() {
    closeZone();
    zone.hidden = false;
    const head = h("div", "zone-head");
    head.append(h("h3", "", t("zone.title_outside")), closeButton());
    zone.append(
      head,
      h("p", "zone-text", t("zone.outside_body")),
      button("btn btn-primary btn-sm", t("map.go_study"), () => {
        closeZone();
        flyToStudy();
      }),
    );
  }

  function renderHex(cell: HexCell, animate: boolean) {
    selected = cell;
    mapA.select(cell.id, isMini(cell));
    mapB?.select(cell.id, isMini(cell));
    if (!marker) marker = new Marker({ element: h("div", "probe-marker") });
    marker.setLngLat(cell.center).addTo(mapA.map);

    const now = upTo();
    const ha = cell.cumHa[now] ?? 0;
    const total = cell.cumHa[last] ?? 0;
    const polys = cell.polyIds.map((id) => byId.get(id)).filter((f) => f !== undefined);
    const shownPolys = polys.filter((f) => (f.properties.t ?? 0) <= now);
    const town = nearestTown(cell.center);
    const zs = (polys[0] ? zoneOfPoly.get(polys[0].id as number) : undefined) ?? zoneAt(cell.center[0], cell.center[1]) ?? primarySet;
    // the zone's own first-detection date (the timeline is the primary zone's) and its window
    const firstPoly = [...polys].sort((a, b) => a.properties.first_date.localeCompare(b.properties.first_date))[0];
    const firstDate = firstPoly?.properties.first_date ?? scenes[cell.firstT ?? 0]?.date ?? "";
    const prevDate = firstPoly?.properties.prev_date;
    const firstNote =
      prevDate && daysBetween(prevDate, firstDate) > REPEAT_DAYS
        ? t("zone.when_between", { prev: fmt.date(prevDate), date: fmt.date(firstDate) })
        : firstPoly
          ? t("zone.when_note")
          : whenNote(cell.firstT ?? 0);
    const where =
      town.km <= TOWN_KM || !zs.z
        ? t("zone.where_value", { km: fmt.num(town.km), dir: t(`dir.${town.dir}`), town: town.name })
        : zoneName(zs.z);

    zone.hidden = false;
    zone.innerHTML = "";
    zone.classList.toggle("is-cleared", ha > 0);
    const head = h("div", "zone-head");
    const titles = h("div");
    titles.append(
      h(
        "h3",
        "",
        ha > 0
          ? t("hex.title_cleared")
          : total > 0
            ? t("hex.title_later")
            : cellFireDays(cell)
              ? t("fire.title_nocut")
              : t("hex.title_none"),
      ),
      h("p", "zone-where", where),
    );
    head.append(titles, closeButton());
    zone.append(head);

    const facts = h("div", "facts");
    if (ha > 0) {
      facts.append(
        fact(
          t("hex.cleared"),
          t("hex.cleared_value", { ha: fmt.num(ha, ha < 10 ? 1 : 0) }),
          t("hex.cleared_note", { pct: fmt.num((ha / cell.areaHa) * 100), n: fmt.num(ha / SOCCER_FIELD_HA) }),
          "fact-hot",
        ),
        fact(t("hex.first"), fmt.date(firstDate, true), firstNote),
      );
      const checked = shownPolys.filter((f) => f.properties.dist_confirmed !== null);
      const yes = checked.filter((f) => f.properties.dist_confirmed === true).length;
      facts.append(
        fact(
          t("zone.confirm"),
          checked.length ? t("hex.confirm_value", { x: fmt.num(yes), n: fmt.num(checked.length) }) : t("zone.confirm_null"),
          t("hex.confirm_note"),
          checked.length ? `fact-dist fact-dist-${yes > 0 ? "true" : "false"}` : "",
        ),
        fact(t("hex.clearings"), fmt.num(shownPolys.length)),
      );
      // clearing with or without fire (VIIRS) around its date
      const fn = fireNear(cell, firstDate);
      if (fn) {
        const withFire = fn.near > 0;
        facts.append(
          fact(
            t("fire.cause"),
            t(withFire ? "fire.cause_fire" : "fire.cause_nofire"),
            withFire
              ? fn.near === 1
                ? t("fire.cause_fire_one", { date: fmt.date(fn.from) })
                : t("fire.cause_fire_many", { from: fmt.date(fn.from), to: fmt.date(fn.to), n: fn.near })
              : fn.days
                ? t("fire.cause_nofire_other", { n: fn.days })
                : t("fire.cause_nofire_note"),
            withFire ? "fact-fire" : "",
          ),
        );
      }
    } else if (total > 0) {
      facts.append(
        fact(t("zone.status"), t("zone.status_forest"), t("hex.later_note", { ha: fmt.num(total, total < 10 ? 1 : 0), date: fmt.date(firstDate, true) })),
      );
    } else {
      facts.append(fact(t("zone.status"), t("zone.status_forest")));
    }
    // a hatched (fire) hexagon with no radar clearing up to this date
    const fdays = ha > 0 ? 0 : cellFireDays(cell);
    if (fdays) facts.append(fact(t("fire.observed"), t("fire.days", { n: fmt.num(fdays) }), t("fire.nocut_note"), "fact-fire"));
    zone.append(facts);

    if (total > 0) {
      const bars = h("section", "zone-chart");
      bars.append(h("h4", "", t("hex.bars_title")), h("p", "zone-help", t("hex.bars_help")));
      const host = h("div", "bars-host");
      bars.append(host);
      zone.append(bars);
      const draw = () => renderBars(host, scenes.map((s) => s.date), cell.addedHa, now);
      requestAnimationFrame(draw);
      new ResizeObserver(draw).observe(host);
    }

    // radar signal at the centre of the hexagon, on demand
    const signal = h("details", "zone-signal");
    signal.append(h("summary", "", t("hex.signal")));
    const help = h("p", "zone-help", t("zone.chart_help"));
    const reading = h("p", "probe-reading", t("chart.loading"));
    const chart = h("div", "probe-chart");
    const legend = h("div", "probe-legend");
    signal.append(help, reading, chart, legend);
    zone.append(signal);
    let drawn = false;
    signal.addEventListener("toggle", () => {
      if (signal.open && !drawn) {
        drawn = true;
        void drawSignal(cell.center, firstPoly?.properties.first_date, reading, chart, legend, animate, zs);
      }
    });

    const tech = h("details", "zone-tech");
    tech.append(h("summary", "", t("zone.tech")));
    const techList = h("ul", "prov prov-sm");
    techList.append(
      h("li", "", t("hex.id", { id: cell.id, ha: fmt.num(cell.areaHa) })),
      h("li", "", t("hex.center", { lat: fmt.num(cell.center[1], 4), lon: fmt.num(cell.center[0], 4) })),
    );
    if (polys.length) techList.append(h("li", "", t("hex.polys", { ids: polys.map((f) => f.properties.id).join(", ") })));
    tech.append(techList, h("p", "fineprint", t("zone.estimated")));
    zone.append(tech);
    lab?.decorateHex(zone, cell, now);
  }

  /** HH / HV series of the 500 m cell under `center`, with rain, from that zone's own files. */
  async function drawSignal(
    center: [number, number],
    firstDate: string | undefined,
    reading: HTMLElement,
    chart: HTMLElement,
    legend: HTMLElement,
    animate: boolean,
    zs: ZoneSet,
  ) {
    const water = isWater(zs);
    const thresholdDb = zs.ds.index.detection.threshold_db;
    try {
      const [grid, rain] = await Promise.all([zs.ds.grid(), zs.ds.rain()]);
      const [lon, lat] = center;
      const col = Math.floor((lon - grid.origin[0]) / grid.cell_deg[0]);
      const row = Math.floor((lat - grid.origin[1]) / grid.cell_deg[1]);
      const k = row * grid.nx + col;
      const ok = col >= 0 && row >= 0 && col < grid.nx && row < grid.ny;
      const hv = ok ? grid.hv_db_x10.map((r) => (r[k] == null ? null : (r[k] as number) / 10)) : [];
      const hh = ok ? grid.hh_db_x10.map((r) => (r[k] == null ? null : (r[k] as number) / 10)) : [];
      if (!ok || hv.every((v) => v === null)) {
        reading.textContent = t("chart.no_cell");
        chart.remove();
        legend.remove();
        return;
      }
      // the clearing threshold means nothing in the water zone
      const items: [string, string][] = water
        ? [
            ["lg-hv", "chart.hv_plain"],
            ["lg-hh", "chart.hh_plain"],
          ]
        : [
            ["lg-hv", "chart.hv"],
            ["lg-thr", "chart.threshold"],
            ["lg-hh", "chart.hh"],
          ];
      if (rain) items.push(["lg-rain", "chart.rain"]);
      for (const [cls, key] of items) legend.append(h("span", `lg ${cls}`, t(key, { db: fmt.signed(thresholdDb, 0) })));
      const baseline = water
        ? null
        : median(hv.slice(0, baselineDates(zs.ds.index)).filter((v): v is number => v !== null));
      const detectedIndex = firstDate ? grid.dates.indexOf(firstDate) : -1;
      if (!animate) chart.classList.add("no-anim");
      const draw = () =>
        renderSeries(chart, reading, {
          dates: grid.dates,
          hv,
          hh,
          rain,
          baseline,
          readingKey: water ? "chart.reading_plain" : undefined,
          thresholdDb,
          detectedIndex: detectedIndex >= 0 ? detectedIndex : null,
          gap: INSTRUMENT_GAP,
        });
      draw();
      new ResizeObserver(() => draw()).observe(chart);
    } catch {
      reading.textContent = t("chart.load_error");
    }
  }

  function closeZone() {
    waterRedraw = null;
    zone.hidden = true;
    zone.innerHTML = "";
    selected = null;
    mapA.select(null);
    mapB?.select(null);
    marker?.remove();
  }

  mapA.map.on("click", (e) => focusZone(e.lngLat));
  let lastZoomedOut = mapA.map.getZoom() < 8.5;
  mapA.map.on("zoomend", () => {
    const z = mapA.map.getZoom() < 8.5;
    if (z !== lastZoomedOut) {
      lastZoomedOut = z;
      renderPanel();
    }
  });

  // ------------------------------------------------------------------ focus from other chapters
  let introduced = false;
  window.addEventListener("clear:focus", (e) => {
    const { featureId } = (e as CustomEvent<FocusDetail>).detail;
    const f = byId.get(featureId);
    if (!f) return;
    introduced = true;
    setMode("timeline");
    timeline.pause();
    timeline.set(Math.min(last, (f.properties.t ?? 0) + 1));
    const [lon, lat] = center(f.geometry);
    window.setTimeout(() => focusZone(new LngLat(lon, lat)), 700);
  });

  // ------------------------------------------------------------------ zone picker / tags: fly, never reload
  onZoneFocus((z) => {
    focus = setOf(z);
    paintZoneTags();
    renderPanel();
    closeZone();
    // the water zone opens its panel (water areas per date) right away
    if (isWater(focus)) renderWaterZone(focus);
    // the map moves only on a choice like this one (no automatic flight on the first visit)
    if (mode !== "compare" || !goChangeSpot()) flyToStudy(1600);
  });

  // ------------------------------------------------------------------ first visit: stay on Paraguay, hint and play
  // No automatic zoom: the map stays on the whole country (all zones in view) until the visitor picks a
  // zone or taps a hexagon; the timeline still plays and a hint says what to do.
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  new IntersectionObserver(
    ([entry]) => {
      const on = entry?.isIntersecting ?? false;
      mapA.setPulse(on);
      mapB?.setPulse(on && mode === "compare");
      if (!on) {
        timeline.pause();
        return;
      }
      if (introduced) return;
      introduced = true;
      window.setTimeout(() => {
        if (!selected && !coachShown) {
          coachShown = true;
          showToast(t("map.coach"), 9000);
        }
        if (!reduced && !selected) timeline.play();
      }, 1200);
    },
    { threshold: 0.45 },
  ).observe(shell);

  onLang(() => {
    paintZoneTags();
    mapA.setLabelLang(lang());
    mapB?.setLabelLang(lang());
    renderModes();
    renderPanel();
    if (mode === "compare") showCompare();
    if (selected && !zone.hidden) renderHex(selected, false);
  });

  shell.dataset.mode = mode;
  renderModes();
  timeline.set(0, false);
  showTimeline(0);
  // frame the whole country once, at once (no animation), clear of the Layers panel and the timeline
  if (!lab?.offline) mapA.map.fitBounds(PARAGUAY_BBOX, { padding: countryPadding(), duration: 0 });
  void paintFires();
  if (layers.outlines) applyLayers();
}

export function showMapUnavailable(key: "map.no_data" | "map.error"): void {
  const status = document.getElementById("map-status");
  if (!status) return;
  status.classList.add("is-empty");
  status.innerHTML = "";
  const p = document.createElement("p");
  p.dataset.i18n = key;
  p.textContent = t(key);
  status.append(p);
}

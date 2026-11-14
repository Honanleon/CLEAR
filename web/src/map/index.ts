// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// The map chapter. Starts on a real satellite map of Paraguay, flies to the study area and plays
// the timeline. The study area is divided into hexagons coloured by hectares cleared up to the
// chosen date. Hovering shows a quick tooltip; tapping a hexagon zooms in and opens a
// plain-language panel. Modes: timeline (one map + play) and before/after (two synced maps).

import { LngLat, Marker } from "maplibre-gl";
import { renderBars } from "../charts/bars";
import { renderSeries } from "../charts/series";
import { Swipe } from "../compare/swipe";
import { BASELINE_DATES, type Dataset, HEX_GRADIENT, HEX_STOPS, INSTRUMENT_GAP, median, type PolygonCollection } from "../data";
import { fmt, lang, onLang, t } from "../i18n";
import { Timeline } from "../timeline/timeline";
import { buildHexGrid, HEX_RADIUS_M, type HexCell, type HexGrid, MINI_HEX_RADIUS_M, MINI_ZOOM } from "./hexgrid";
import paraguay from "./paraguay.json";
import { PARAGUAY_BBOX, RadarMap } from "./radar-map";
import { center, nearestTown, SOCCER_FIELD_HA } from "./zone";

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
  const aoi = index.aoi.bbox;

  let polygons: PolygonCollection;
  try {
    polygons = await ds.polygons();
  } catch {
    polygons = { type: "FeatureCollection", features: [] };
  }
  const byId = new Map(polygons.features.map((f) => [f.id as number, f]));
  // hexagons over all of Paraguay; only the ones over the study area have radar data
  const hex = buildHexGrid(aoi, polygons, scenes.length, HEX_RADIUS_M, paraguay as [number, number][]);
  // mini hexagons over the study area, shown inside the big ones when zoomed in
  const mini = buildHexGrid(aoi, polygons, scenes.length, MINI_HEX_RADIUS_M);
  const isMini = (cell: HexCell) => mini.cells[cell.id] === cell;
  const gridAt = (m: RadarMap): HexGrid => (m.map.getZoom() >= MINI_ZOOM ? mini : hex);
  const newArea = scenes.map(() => 0);
  for (const f of polygons.features) {
    const k = f.properties.t ?? 0;
    newArea[k] = (newArea[k] ?? 0) + f.properties.area_ha;
  }

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

  const mapA = new RadarMap({ container: containerA, ds, polygons, hex, mini, bbox: aoi, controls: true, start: "country", offline: lab?.offline });
  let mapB: RadarMap | null = null;
  let swipe: Swipe | null = null;
  let mode: Mode = "timeline";
  let view: View = "satellite";
  let cur = 0;
  let before = Math.min(BASELINE_DATES - 1, last);
  let after = last;
  let selected: HexCell | null = null;
  let marker: Marker | null = null;
  const layers = { outlines: lab?.outlinesAtStart ?? false, opacity: 0.9 };

  mapA.map.on("error", (e) => console.warn("CLEAR map:", e.error?.message));
  if (import.meta.env.DEV || import.meta.env.MODE === "lab") (window as unknown as { __clear: unknown }).__clear = { mapA, hex };
  await mapA.ready.catch(() => undefined);
  status.hidden = true;
  ui.hidden = false;

  // "Study area" tag pinned to the top-left corner of the box.
  const aoiTag = h("div", "aoi-tag", t("map.study_area"));
  new Marker({ element: aoiTag, anchor: "bottom-left", offset: [-2, -6] }).setLngLat([aoi[0], aoi[3]]).addTo(mapA.map);

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
    mapA.map.fitBounds(aoi, { padding: { ...p, right: isNarrow() ? 24 : 80, bottom: isNarrow() ? 190 : p.bottom }, duration, essential: true });
  }
  function flyToCountry() {
    closeZone();
    mapA.map.fitBounds(PARAGUAY_BBOX, { padding: 40, duration: 2000, essential: true });
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

  function hexLegend(): HTMLElement {
    const wrap = h("div", "hex-legend");
    const ramp = h("div", "ramp");
    ramp.style.background = HEX_GRADIENT;
    const labels = h("div", "ramp-labels");
    HEX_STOPS.forEach(([v], i) => labels.append(h("span", "", i === HEX_STOPS.length - 1 ? `${fmt.num(v)}+` : fmt.num(v))));
    wrap.append(ramp, labels);
    return wrap;
  }

  function renderPanel() {
    const scene = scenes[upTo()];
    const wasOpen = panel.classList.contains("is-open");
    const moreOpen = panel.querySelector("details.more")?.hasAttribute("open") ?? false;
    panel.innerHTML = "";
    const head = h("div", "panel-head");
    head.append(h("h3", "", t("map.panel")));
    const toggle = h("button", "icon-btn panel-toggle");
    toggle.type = "button";
    toggle.setAttribute("aria-label", t("map.panel"));
    toggle.innerHTML = ICON_CHEVRON;
    toggle.addEventListener("click", () => panel.classList.toggle("is-open"));
    head.append(toggle);
    panel.classList.toggle("is-open", wasOpen);

    const body = h("div", "panel-body");
    body.append(h("p", "panel-label", t("map.view")));
    const seg = h("div", "seg seg-block");
    for (const v of ["satellite", "radar"] as const) {
      const b = button("", t(v === "satellite" ? "map.view_satellite" : "map.view_radar"), () => setView(v));
      b.setAttribute("aria-pressed", String(view === v));
      seg.append(b);
    }
    body.append(seg);

    body.append(h("p", "panel-label", t("map.legend_polys")), hexLegend());
    body.append(h("p", "panel-note", t("map.hex_size", { ha: fmt.num(hex.cells[0]?.areaHa ?? 0), mini: fmt.num(mini.cells[0]?.areaHa ?? 0) })));
    body.append(h("p", "panel-note", t("map.hex_nodata")));

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
    prov.append(provRow(t("prov.layer_basemap"), "satellite", "Esri World Imagery"));
    prov.append(provRow(t("prov.layer_labels"), "measured", "OpenStreetMap / OpenFreeMap"));
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
    }
  }

  function setView(v: View) {
    view = v;
    applyLayers();
    renderPanel();
  }

  // ------------------------------------------------------------------ modes
  function showTimeline(i: number) {
    cur = i;
    void mapA.showScene(i);
    void mapA.setTime(i);
    renderPanel();
    if (selected && !zone.hidden) renderHex(selected, false);
  }

  function showCompare() {
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
        mapB = new RadarMap({ container: containerB, ds, polygons, hex, mini, bbox: aoi, controls: false, start: "study", offline: lab?.offline });
        mapB.map.on("click", (e) => focusZone(e.lngLat));
        mapB.setPulse(true);
      }
      mapB.map.resize();
      swipe = new Swipe(shell, containerB, knob, mapA.map, mapB.map);
      if (view !== "radar") {
        view = "radar";
        showToast(t("map.compare_hint"));
      }
      applyLayers();
      showCompare();
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
    const cell = gridAt(from).locate(e.lngLat.lng, e.lngLat.lat);
    const key = cell ? `${isMini(cell) ? "m" : "h"}${cell.id}` : null;
    if (key !== hovered) {
      hovered = key;
      const small = cell ? isMini(cell) : false;
      mapA.hover(cell?.id ?? null, small);
      mapB?.hover(cell?.id ?? null, small);
    }
    const ha = cell ? (cell.cumHa[from === mapB ? after : upTo()] ?? 0) : 0;
    from.map.getCanvas().style.cursor = cell ? "pointer" : "";
    if (!cell || ha <= 0) {
      tip.hidden = true;
      return;
    }
    tip.textContent = t("hex.tooltip", { ha: fmt.num(ha, ha < 10 ? 1 : 0), pct: fmt.num((ha / cell.areaHa) * 100) });
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
    const cell = gridAt(mapA).locate(lngLat.lng, lngLat.lat);
    if (!cell) {
      renderOutside();
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

    zone.hidden = false;
    zone.innerHTML = "";
    zone.classList.toggle("is-cleared", ha > 0);
    const head = h("div", "zone-head");
    const titles = h("div");
    titles.append(
      h("h3", "", ha > 0 ? t("hex.title_cleared") : total > 0 ? t("hex.title_later") : t("hex.title_none")),
      h("p", "zone-where", t("zone.where_value", { km: fmt.num(town.km), dir: t(`dir.${town.dir}`), town: town.name })),
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
        fact(t("hex.first"), fmt.date(scenes[cell.firstT ?? 0]?.date ?? "", true), t("zone.when_note")),
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
    } else if (total > 0) {
      facts.append(
        fact(t("zone.status"), t("zone.status_forest"), t("hex.later_note", { ha: fmt.num(total, total < 10 ? 1 : 0), date: fmt.date(scenes[cell.firstT ?? 0]?.date ?? "", true) })),
      );
    } else {
      facts.append(fact(t("zone.status"), t("zone.status_forest")));
    }
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
        void drawSignal(cell, reading, chart, legend, animate);
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

  async function drawSignal(cell: HexCell, reading: HTMLElement, chart: HTMLElement, legend: HTMLElement, animate: boolean) {
    try {
      const [grid, rain] = await Promise.all([ds.grid(), ds.rain()]);
      const [lon, lat] = cell.center;
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
      const items: [string, string][] = [
        ["lg-hv", "chart.hv"],
        ["lg-thr", "chart.threshold"],
        ["lg-hh", "chart.hh"],
      ];
      if (rain) items.push(["lg-rain", "chart.rain"]);
      for (const [cls, key] of items) legend.append(h("span", `lg ${cls}`, t(key, { db: fmt.signed(index.detection.threshold_db, 0) })));
      const baseline = median(hv.slice(0, BASELINE_DATES).filter((v): v is number => v !== null));
      const firstDate = cell.firstT !== null ? scenes[cell.firstT]?.date : undefined;
      const detectedIndex = firstDate ? grid.dates.indexOf(firstDate) : -1;
      if (!animate) chart.classList.add("no-anim");
      const draw = () =>
        renderSeries(chart, reading, {
          dates: grid.dates,
          hv,
          hh,
          rain,
          baseline,
          thresholdDb: index.detection.threshold_db,
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

  // ------------------------------------------------------------------ first visit: Paraguay → study area → play
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
        flyToStudy(reduced ? 0 : 3200);
        mapA.map.once("moveend", () => {
          if (!selected && !coachShown) {
            coachShown = true;
            showToast(t("map.coach"), 9000);
          }
          if (!reduced && !selected) timeline.play();
        });
      }, 1800);
    },
    { threshold: 0.45 },
  ).observe(shell);

  onLang(() => {
    aoiTag.textContent = t("map.study_area");
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

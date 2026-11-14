// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// The map chapter. Starts on a real satellite map of Paraguay, flies to the study area and plays
// the timeline. Tapping a spot zooms in and opens a plain-language panel with the data of that
// area. Modes: timeline (one map + play) and before/after (two synced maps with a swipe).

import { LngLat, Marker } from "maplibre-gl";
import { renderSeries } from "../charts/series";
import { Swipe } from "../compare/swipe";
import {
  BASELINE_DATES,
  DATE_PALETTE,
  type Dataset,
  featureBBox,
  INSTRUMENT_GAP,
  median,
  type PolygonCollection,
  type PolygonProps,
} from "../data";
import { fmt, lang, onLang, t } from "../i18n";
import { Timeline } from "../timeline/timeline";
import { PARAGUAY_BBOX, type PolygonHit, RadarMap } from "./radar-map";
import { center, dropPercent, nearby, nearestTown, SOCCER_FIELD_HA } from "./zone";

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
  const newArea = scenes.map(() => 0);
  const newCount = scenes.map(() => 0);
  for (const f of polygons.features) {
    const k = f.properties.t ?? 0;
    newArea[k] = (newArea[k] ?? 0) + f.properties.area_ha;
    newCount[k] = (newCount[k] ?? 0) + 1;
  }
  const ts = polygons.features.map((f) => f.properties.t ?? 0);
  const tMin = ts.length ? Math.min(...ts) : 0;
  const tMax = ts.length ? Math.max(...ts) : last;

  const mapA = new RadarMap({ container: containerA, ds, polygons, bbox: aoi, controls: true, start: "country" });
  let mapB: RadarMap | null = null;
  let swipe: Swipe | null = null;
  let mode: Mode = "timeline";
  let view: View = "satellite";
  let cur = 0;
  let before = Math.min(BASELINE_DATES - 1, last);
  let after = last;
  let selected: number | null = null;
  let zoneAt: { lngLat: LngLat; hit: PolygonHit | null } | null = null;
  let marker: Marker | null = null;
  const layers = { polygons: true, opacity: 0.9 };

  mapA.map.on("error", (e) => console.warn("CLEAR map:", e.error?.message));
  if (import.meta.env.DEV) (window as unknown as { __clear: unknown }).__clear = { mapA };
  await mapA.ready.catch(() => undefined);
  status.hidden = true;
  ui.hidden = false;

  // "Study area" tag pinned to the top-left corner of the box.
  const aoiTag = h("div", "aoi-tag", t("map.study_area"));
  new Marker({ element: aoiTag, anchor: "bottom-left", offset: [-2, -6] }).setLngLat([aoi[0], aoi[3]]).addTo(mapA.map);

  // ------------------------------------------------------------------ UI skeleton
  const modeBar = h("div", "map-modes seg");
  const panel = h("aside", "map-card map-panel");
  const timeline = new Timeline({ scenes, newArea, newCount, onChange: (i) => showTimeline(i) });
  const compareBar = h("div", "compare-bar");
  const zone = h("aside", "zone");
  zone.hidden = true;
  const toast = h("div", "map-toast");
  toast.hidden = true;
  const dock = h("div", "map-dock");
  dock.append(timeline.el, compareBar);
  ui.append(modeBar, panel, toast, dock, zone);

  const isNarrow = () => shell.clientWidth < 760;
  const padding = () =>
    isNarrow()
      ? { top: 120, bottom: Math.round(shell.clientHeight * 0.58), left: 24, right: 24 }
      : { top: 110, bottom: 210, left: 380, right: zone.hidden ? 80 : 500 };
  const inAoi = (ll: LngLat) => ll.lng >= aoi[0] && ll.lng <= aoi[2] && ll.lat >= aoi[1] && ll.lat <= aoi[3];

  function flyToStudy(duration = 2200) {
    const p = padding();
    mapA.map.fitBounds(aoi, { padding: { ...p, right: isNarrow() ? 24 : 80, bottom: isNarrow() ? 190 : p.bottom }, duration, essential: true });
  }
  function flyToCountry() {
    closeZone();
    mapA.map.fitBounds(PARAGUAY_BBOX, { padding: 40, duration: 2000, essential: true });
  }

  let toastTimer = 0;
  function showToast(text: string) {
    toast.textContent = text;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => (toast.hidden = true), 5200);
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

  function renderPanel() {
    const scene = scenes[mode === "timeline" ? cur : after];
    const wasOpen = panel.classList.contains("is-open");
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
      body.append(range);
    }

    const sw = h("label", "switch");
    const input = h("input");
    input.type = "checkbox";
    input.checked = layers.polygons;
    input.addEventListener("change", () => {
      layers.polygons = input.checked;
      applyLayers();
    });
    sw.append(input, h("i"), h("span", "", t("map.layer_polygons")));
    body.append(sw);

    if (polygons.features.length) {
      body.append(h("p", "panel-label", t("map.legend_polys")));
      const ramp = h("div", "ramp");
      ramp.style.background = `linear-gradient(90deg, ${DATE_PALETTE.join(",")})`;
      const labels = h("div", "ramp-labels");
      labels.append(h("span", "", fmt.date(scenes[tMin]?.date ?? "")), h("span", "", fmt.date(scenes[tMax]?.date ?? "")));
      body.append(ramp, labels);
    }

    const zoomedOut = mapA.map.getZoom() < 8.5;
    body.append(
      button("btn btn-ghost btn-sm btn-block", zoomedOut ? t("map.go_study") : t("map.go_country"), () =>
        zoomedOut ? flyToStudy() : flyToCountry(),
      ),
    );

    const details = h("details", "sources");
    details.append(h("summary", "", t("map.sources")));
    const prov = h("ul", "prov");
    const rgb = ds.provenance("rgb");
    if (rgb && scene) {
      prov.append(provRow(t("prov.layer_rgb"), rgb.type, rgb.source, `${t("prov.scene")} ${fmt.date(scene.date)}: ${t(`prov.${scene.maturity}`)} · ${scene.crid}`));
    }
    const pp = ds.provenance("polygons");
    if (pp) prov.append(provRow(t("prov.layer_polygons"), pp.type, pp.source));
    prov.append(provRow(t("prov.layer_basemap"), "satellite", "Esri World Imagery"));
    prov.append(provRow(t("prov.layer_labels"), "measured", "OpenStreetMap / OpenFreeMap"));
    details.append(prov, h("p", "fineprint", t("map.ethics")));
    body.append(details);
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
      void m.setPolygonsVisible(layers.polygons);
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
    void mapA.setPolygons(i);
    renderPanel();
  }

  function showCompare() {
    void mapA.showScene(before);
    void mapA.setPolygons(before);
    if (mapB) {
      void mapB.showScene(after);
      void mapB.setPolygons(after, before);
    }
    document.getElementById("swipe-tag-a")!.textContent = `${t("map.before")} · ${fmt.date(scenes[before]?.date ?? "")}`;
    document.getElementById("swipe-tag-b")!.textContent = `${t("map.after")} · ${fmt.date(scenes[after]?.date ?? "")}`;
    renderCompareBar();
    renderPanel();
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
        mapB = new RadarMap({ container: containerB, ds, polygons, bbox: aoi, controls: false, start: "study" });
        mapB.map.on("click", (e) => focusZone(e.lngLat, mapB!.polygonAt(e.lngLat)));
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

  // ------------------------------------------------------------------ zone panel
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

  function focusZone(lngLat: LngLat, hit: PolygonHit | null) {
    timeline.pause();
    if (!inAoi(lngLat)) {
      renderOutside();
      return;
    }
    zone.hidden = false;
    renderZone(lngLat, hit, true);
    const f = hit ? byId.get(hit.id) : undefined;
    if (f) {
      const [x0, y0, x1, y1] = featureBBox(f.geometry);
      mapA.map.fitBounds([x0, y0, x1, y1], { padding: padding(), maxZoom: 13.2, duration: 1400, essential: true });
    } else {
      mapA.map.easeTo({ center: lngLat, zoom: Math.max(mapA.map.getZoom(), 12.5), padding: padding(), duration: 1400, essential: true });
    }
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

  function renderZone(lngLat: LngLat, hit: PolygonHit | null, animateChart: boolean) {
    zoneAt = { lngLat, hit };
    const upTo = mode === "timeline" ? cur : after;
    const prev = selected;
    selected = hit?.id ?? null;
    mapA.select(selected, prev);
    mapB?.select(selected, prev);
    if (!marker) marker = new Marker({ element: h("div", "probe-marker") });
    marker.setLngLat(lngLat).addTo(mapA.map);

    const f = hit ? byId.get(hit.id) : undefined;
    const props = f?.properties as PolygonProps | undefined;
    const pt: [number, number] = props && f ? center(f.geometry) : [lngLat.lng, lngLat.lat];
    const town = nearestTown(pt);

    zone.hidden = false;
    zone.innerHTML = "";
    zone.classList.toggle("is-cleared", Boolean(props));
    const head = h("div", "zone-head");
    const titles = h("div");
    titles.append(
      h("h3", "", props ? t("zone.title_cleared") : t("zone.title_forest")),
      h("p", "zone-where", t("zone.where_value", { km: fmt.num(town.km), dir: t(`dir.${town.dir}`), town: town.name })),
    );
    head.append(titles, closeButton());
    zone.append(head);

    const facts = h("div", "facts");
    let statusFact: HTMLElement | null = null;
    if (props) {
      const dist = props.dist_confirmed;
      const key = dist === null ? "null" : String(dist);
      facts.append(
        fact(t("zone.area"), t("zone.area_value", { ha: fmt.num(props.area_ha) }), t("zone.fields", { n: fmt.num(props.area_ha / SOCCER_FIELD_HA) })),
        fact(t("zone.when"), fmt.date(props.first_date, true), t("zone.when_note")),
        fact(t("zone.confirm"), t(`zone.confirm_${key}`), t("zone.confirm_note"), `fact-dist fact-dist-${key}`),
        fact(t("zone.drop"), `${fmt.signed(props.mean_drop_db)} dB`, t("zone.drop_note", { pct: fmt.num(dropPercent(props.mean_drop_db)) })),
      );
    } else {
      statusFact = fact(t("zone.status"), "…");
      facts.append(statusFact);
    }
    const near = nearby(polygons, pt, 3, upTo, hit?.id);
    facts.append(fact(t("zone.nearby"), near.n ? t("zone.nearby_value", { n: fmt.num(near.n), ha: fmt.num(near.ha) }) : t("zone.nearby_none")));
    zone.append(facts);

    const chartBox = h("section", "zone-chart");
    chartBox.append(h("h4", "", t("zone.chart_title")), h("p", "zone-help", t("zone.chart_help")));
    const reading = h("p", "probe-reading", t("chart.loading"));
    const chart = h("div", "probe-chart");
    const legend = h("div", "probe-legend");
    for (const [cls, key] of [
      ["lg-hv", "chart.hv"],
      ["lg-thr", "chart.threshold"],
      ["lg-rain", "chart.rain"],
      ["lg-hh", "chart.hh"],
    ] as const) {
      legend.append(h("span", `lg ${cls}`, t(key, { db: fmt.signed(index.detection.threshold_db, 0) })));
    }
    chartBox.append(reading, chart, legend);
    zone.append(chartBox);

    const tech = h("details", "zone-tech");
    tech.append(h("summary", "", t("zone.tech")));
    const techList = h("ul", "prov prov-sm");
    if (props) techList.append(h("li", "", t("zone.polygon_id", { id: props.id })));
    techList.append(h("li", "", t("zone.cell", { lat: fmt.num(lngLat.lat, 4), lon: fmt.num(lngLat.lng, 4) })));
    tech.append(techList, h("p", "fineprint", t("zone.estimated")));
    zone.append(tech);

    void (async () => {
      try {
        const [grid, rain] = await Promise.all([ds.grid(), ds.rain()]);
        if (zoneAt?.lngLat !== lngLat) return;
        const col = Math.floor((lngLat.lng - grid.origin[0]) / grid.cell_deg[0]);
        const row = Math.floor((lngLat.lat - grid.origin[1]) / grid.cell_deg[1]);
        const k = row * grid.nx + col;
        const ok = col >= 0 && row >= 0 && col < grid.nx && row < grid.ny;
        const hv = ok ? grid.hv_db_x10.map((r) => (r[k] == null ? null : (r[k] as number) / 10)) : [];
        const hh = ok ? grid.hh_db_x10.map((r) => (r[k] == null ? null : (r[k] as number) / 10)) : [];
        if (!ok || hv.every((v) => v === null)) {
          reading.textContent = t("chart.no_cell");
          chart.remove();
          legend.remove();
          statusFact?.remove();
          return;
        }
        const baseline = median(hv.slice(0, BASELINE_DATES).filter((v): v is number => v !== null));
        if (statusFact && baseline !== null) {
          statusFact.querySelector(".fact-value")!.textContent = baseline < -16 ? t("zone.status_low") : t("zone.status_forest");
        }
        const detectedIndex = props ? grid.dates.indexOf(props.first_date) : -1;
        if (!animateChart) chart.classList.add("no-anim");
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

        const rgb = ds.provenance("rgb");
        if (rgb) techList.append(provRow(t("prov.layer_rgb"), rgb.type, rgb.source));
        const rp = ds.provenance("rain");
        if (rain) techList.append(provRow(t("prov.layer_rain"), rp?.type ?? "modeled", rp?.source ?? rain.source));
      } catch {
        reading.textContent = t("chart.load_error");
      }
    })();
  }

  function closeZone() {
    zone.hidden = true;
    zone.innerHTML = "";
    zoneAt = null;
    mapA.select(null, selected);
    mapB?.select(null, selected);
    selected = null;
    marker?.remove();
  }

  mapA.map.on("click", (e) => focusZone(e.lngLat, mapA.polygonAt(e.lngLat)));
  mapA.map.on("mouseenter", "poly-fill", () => (mapA.map.getCanvas().style.cursor = "pointer"));
  mapA.map.on("mouseleave", "poly-fill", () => (mapA.map.getCanvas().style.cursor = ""));
  let lastZoomedOut = mapA.map.getZoom() < 8.5;
  mapA.map.on("zoomend", () => {
    const z = mapA.map.getZoom() < 8.5;
    if (z !== lastZoomedOut) {
      lastZoomedOut = z;
      renderPanel();
    }
  });

  // ------------------------------------------------------------------ focus from other chapters
  window.addEventListener("clear:focus", (e) => {
    const { featureId } = (e as CustomEvent<FocusDetail>).detail;
    const f = byId.get(featureId);
    if (!f) return;
    introduced = true;
    setMode("timeline");
    timeline.pause();
    timeline.set(Math.min(last, (f.properties.t ?? 0) + 1));
    const [lon, lat] = center(f.geometry);
    window.setTimeout(() => focusZone(new LngLat(lon, lat), { id: featureId, props: f.properties as unknown as Record<string, unknown> }), 700);
  });

  // ------------------------------------------------------------------ first visit: Paraguay → study area → play
  let introduced = false;
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
          if (!reduced && !zoneAt) timeline.play();
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
    if (zoneAt) renderZone(zoneAt.lngLat, zoneAt.hit, false);
  });

  shell.dataset.mode = mode;
  renderModes();
  timeline.set(0, false);
  showTimeline(0);
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

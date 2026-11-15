// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Water zone chart (chapter 2, water.json): estimated hectares of open water and of flooded vegetation
// at each radar date, two lines in the colours of the water-classes layer, and a marker on the date
// shown on the timeline. Plain SVG.

import { stepEnd, type WaterSeries } from "../data";
import { fmt, locale, t } from "../i18n";

const NS = "http://www.w3.org/2000/svg";
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent?.append(n);
  return n;
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Index of the last date of the timeline step `iso` (same rule as the map layer; -1 if every date is later). */
export function waterIndexAt(w: WaterSeries, iso: string): number {
  const end = stepEnd(iso);
  let k = -1;
  w.dates.forEach((d, i) => {
    if (d <= end) k = i;
  });
  return k;
}

export function renderWater(host: HTMLElement, reading: HTMLElement, w: WaterSeries, currentIso: string): void {
  host.innerHTML = "";
  const W = Math.max(280, host.clientWidth);
  const H = 210;
  const m = { l: 44, r: 12, t: 24, b: 24 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const d0 = day(w.dates[0] ?? "2026-06-01") - 6;
  const d1 = day(w.dates[w.dates.length - 1] ?? "2026-10-31") + 6;
  const x = (iso: string) => m.l + ((day(iso) - d0) / (d1 - d0)) * pw;
  const all = [...w.open_water_ha, ...w.flooded_veg_ha].filter((v): v is number => v !== null);
  const step = 5000;
  const hi = Math.max(step, Math.ceil(Math.max(...all, 0) / step) * step);
  const y = (v: number) => m.t + ((hi - v) / hi) * ph;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "series water-chart", role: "img" });
  el("title", {}, svg).textContent = t("water.chart_title");

  for (let v = 0; v <= hi; v += step) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grid" }, svg);
    el("text", { x: m.l - 6, y: y(v) + 3.5, class: "tick", "text-anchor": "end" }, svg).textContent = fmt.num(v / 1000);
  }
  el("text", { x: 2, y: 10, class: "tick" }, svg).textContent = t("water.axis");

  // month ticks
  const monthFmt = new Intl.DateTimeFormat(locale(), { month: "short", timeZone: "UTC" });
  const first = new Date(`${w.dates[0] ?? "2026-06-01"}T00:00:00Z`);
  for (let k = 1; k <= 12; k++) {
    const dm = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + k, 1));
    const iso = dm.toISOString().slice(0, 10);
    if (day(iso) > d1) break;
    el("line", { x1: x(iso), x2: x(iso), y1: m.t, y2: H - m.b, class: "grid grid-v" }, svg);
    el("text", { x: x(iso) + 3, y: H - 6, class: "tick" }, svg).textContent = monthFmt.format(dm);
  }

  // marker on the timeline's date
  const k = waterIndexAt(w, currentIso);
  if (k >= 0) el("line", { x1: x(w.dates[k]!), x2: x(w.dates[k]!), y1: m.t, y2: H - m.b, class: "water-now" }, svg);

  const series: [string, (number | null)[]][] = [
    ["water-open", w.open_water_ha],
    ["water-veg", w.flooded_veg_ha],
  ];
  for (const [cls, vals] of series) {
    let d = "";
    let pen = false;
    vals.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${x(w.dates[i]!).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    });
    el("path", { d, class: `water-line ${cls}` }, svg);
    vals.forEach((v, i) => {
      if (v !== null) el("circle", { cx: x(w.dates[i]!), cy: y(v), r: i === k ? 5 : 3, class: `water-dot ${cls}` }, svg);
    });
  }
  host.append(svg);

  const show = (i: number) => {
    const date = w.dates[i];
    if (!date) return;
    const o = w.open_water_ha[i];
    const f = w.flooded_veg_ha[i];
    reading.textContent = t("water.reading", {
      date: fmt.date(date, true),
      open: o === null || o === undefined ? "—" : fmt.num(o),
      veg: f === null || f === undefined ? "—" : fmt.num(f),
    });
  };
  show(k >= 0 ? k : 0);
  // hover / touch: read the nearest date
  svg.addEventListener("pointermove", (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    w.dates.forEach((d, i) => {
      if (Math.abs(x(d) - px) < Math.abs(x(w.dates[best]!) - px)) best = i;
    });
    show(best);
  });
  svg.addEventListener("pointerleave", () => show(k >= 0 ? k : 0));
}

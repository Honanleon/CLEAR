// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// HH / HV time series of one 500 m cell, with daily rain bars, the HV baseline, the detection
// threshold, the instrument gap and the detection date. Plain SVG, no chart library.

import { fmt, locale, t } from "../i18n";

export interface SeriesInput {
  dates: string[];
  hv: (number | null)[];
  hh: (number | null)[];
  rain: { dates: string[]; mm: number[] } | null;
  baseline: number | null;
  thresholdDb: number;
  detectedIndex: number | null;
  gap: [string, string];
}

const NS = "http://www.w3.org/2000/svg";
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

function path(points: ([number, number] | null)[]): string {
  let d = "";
  let pen = false;
  for (const p of points) {
    if (!p) {
      pen = false;
      continue;
    }
    d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
    pen = true;
  }
  return d;
}

export function renderSeries(host: HTMLElement, reading: HTMLElement, input: SeriesInput): void {
  host.innerHTML = "";
  const W = Math.max(280, host.clientWidth);
  const H = 236;
  const m = { l: 38, r: 10, t: 12, b: 24 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;

  const d0 = day(input.dates[0] ?? "2026-06-01") - 8;
  const d1 = day(input.dates[input.dates.length - 1] ?? "2026-10-31") + 6;
  const x = (iso: string) => m.l + ((day(iso) - d0) / (d1 - d0)) * pw;

  const values = [...input.hv, ...input.hh].filter((v): v is number => v !== null);
  if (input.baseline !== null) values.push(input.baseline + input.thresholdDb, input.baseline);
  const lo = Math.floor((Math.min(...values) - 1.5) / 5) * 5;
  const hi = Math.ceil((Math.max(...values) + 1.5) / 5) * 5;
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * ph;

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "series", role: "img" });
  el("title", {}, svg).textContent = t("chart.title");

  // hatch for the instrument gap
  const defs = el("defs", {}, svg);
  const pat = el("pattern", { id: "hatch", width: 6, height: 6, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("rect", { width: 2, height: 6, fill: "rgba(255,255,255,.10)" }, pat);

  // y grid
  for (let v = lo; v <= hi; v += 5) {
    el("line", { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: "grid" }, svg);
    el("text", { x: m.l - 6, y: y(v) + 3.5, class: "tick", "text-anchor": "end" }, svg).textContent = fmt.signed(v, 0);
  }
  el("text", { x: 2, y: m.t - 2, class: "tick" }, svg).textContent = "dB";

  // x ticks: first day of each month
  const monthFmt = new Intl.DateTimeFormat(locale(), { month: "short", timeZone: "UTC" });
  for (let mo = 5; mo <= 10; mo++) {
    const iso = `2026-${String(mo + 1).padStart(2, "0")}-01`;
    const xx = x(iso);
    if (xx < m.l || xx > W - m.r) continue;
    el("line", { x1: xx, x2: xx, y1: m.t, y2: H - m.b, class: "grid grid-v" }, svg);
    el("text", { x: xx + 3, y: H - 8, class: "tick" }, svg).textContent = monthFmt.format(new Date(`${iso}T00:00:00Z`));
  }

  // gap
  const gx0 = Math.max(m.l, x(input.gap[0]));
  const gx1 = Math.min(W - m.r, x(input.gap[1]));
  if (gx1 > gx0) {
    el("rect", { x: gx0, y: m.t, width: gx1 - gx0, height: ph, fill: "url(#hatch)" }, svg);
    el("text", { x: (gx0 + gx1) / 2, y: m.t + 10, class: "tick", "text-anchor": "middle" }, svg).textContent = t("chart.gap");
  }

  // rain bars (own scale, bottom 30 % of the plot)
  if (input.rain) {
    const maxMm = Math.max(10, ...input.rain.mm);
    const pxDay = pw / (d1 - d0);
    const g = el("g", { class: "rain" }, svg);
    input.rain.dates.forEach((iso, k) => {
      const mm = input.rain!.mm[k] ?? 0;
      const xx = x(iso);
      if (mm <= 0 || xx < m.l || xx > W - m.r) return;
      const h = (mm / maxMm) * ph * 0.3;
      el("rect", { x: xx - Math.max(1, pxDay * 0.4), y: H - m.b - h, width: Math.max(1.5, pxDay * 0.8), height: h, rx: 1 }, g);
    });
  }

  // baseline and threshold
  const xs0 = x(input.dates[0] ?? "");
  const xs1 = x(input.dates[input.dates.length - 1] ?? "");
  if (input.baseline !== null) {
    el("line", { x1: xs0, x2: xs1, y1: y(input.baseline), y2: y(input.baseline), class: "base" }, svg);
    el("text", { x: xs1, y: y(input.baseline) - 4, class: "tick tick-base", "text-anchor": "end" }, svg).textContent =
      t("chart.baseline");
    const th = input.baseline + input.thresholdDb;
    el("line", { x1: xs0, x2: xs1, y1: y(th), y2: y(th), class: "thr" }, svg);
    el("text", { x: xs1, y: y(th) + 11, class: "tick tick-thr", "text-anchor": "end" }, svg).textContent = t(
      "chart.threshold",
      { db: fmt.signed(input.thresholdDb, 0) },
    );
  }

  // detection date
  if (input.detectedIndex !== null && input.dates[input.detectedIndex]) {
    const xx = x(input.dates[input.detectedIndex] as string);
    el("line", { x1: xx, x2: xx, y1: m.t, y2: H - m.b, class: "det" }, svg);
  }

  // series
  const pts = (arr: (number | null)[]) => input.dates.map((iso, k) => (arr[k] == null ? null : ([x(iso), y(arr[k] as number)] as [number, number])));
  for (const [arr, cls] of [
    [input.hh, "hh"],
    [input.hv, "hv"],
  ] as const) {
    const p = pts(arr);
    el("path", { d: path(p), class: `line line-${cls}`, pathLength: 1 }, svg);
    for (const q of p) if (q) el("circle", { cx: q[0], cy: q[1], r: 3, class: `pt pt-${cls}` }, svg);
  }

  // hover / touch readout
  const guide = el("line", { x1: 0, x2: 0, y1: m.t, y2: H - m.b, class: "guide", visibility: "hidden" }, svg);
  const hit = el("rect", { x: m.l, y: m.t, width: pw, height: ph, fill: "transparent" }, svg);
  const show = (k: number) => {
    const iso = input.dates[k];
    if (!iso) return;
    const xx = x(iso);
    guide.setAttribute("x1", String(xx));
    guide.setAttribute("x2", String(xx));
    guide.setAttribute("visibility", "visible");
    const v = (a: (number | null)[]) => (a[k] == null ? "—" : `${fmt.num(a[k] as number, 1)} dB`);
    reading.textContent = t("chart.reading", { date: fmt.date(iso, true), hv: v(input.hv), hh: v(input.hh) });
  };
  const nearest = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = 0;
    let bd = Infinity;
    input.dates.forEach((iso, k) => {
      const dd = Math.abs(x(iso) - px);
      if (dd < bd) {
        bd = dd;
        best = k;
      }
    });
    return best;
  };
  hit.addEventListener("pointermove", (e) => show(nearest(e.clientX)));
  hit.addEventListener("pointerdown", (e) => show(nearest(e.clientX)));
  show(input.detectedIndex ?? input.dates.length - 1);

  host.append(svg);
}

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// "When was it cleared": hectares first detected at each radar pass inside one hexagon.
// Bars sit at their real date (so gaps between passes show); bars up to the current timeline
// date are coloured, later ones grey. Plain SVG.

import { fmt, locale } from "../i18n";

const NS = "http://www.w3.org/2000/svg";
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent.append(node);
  return node;
}

export function renderBars(host: HTMLElement, dates: string[], values: number[], current: number): void {
  host.innerHTML = "";
  const W = Math.max(260, host.clientWidth);
  const H = 120;
  const m = { l: 8, r: 8, t: 18, b: 22 };
  const pw = W - m.l - m.r;
  const ph = H - m.t - m.b;
  const d0 = day(dates[0] ?? "2026-01-01") - 6;
  const d1 = day(dates[dates.length - 1] ?? "2026-12-31") + 6;
  const x = (iso: string) => m.l + ((day(iso) - d0) / (d1 - d0)) * pw;
  const max = Math.max(1, ...values);
  const bw = Math.max(4, Math.min(14, (pw / dates.length) * 0.6));

  const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "bars", role: "img" }, host);
  el("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "bars-axis" }, svg);

  // month ticks
  const monthFmt = new Intl.DateTimeFormat(locale(), { month: "short", timeZone: "UTC" });
  let lastMonth = "";
  for (const iso of dates) {
    const mo = iso.slice(0, 7);
    if (mo === lastMonth) continue;
    lastMonth = mo;
    const first = `${mo}-01`;
    const xx = x(first);
    if (xx < m.l || xx > W - m.r) continue;
    el("text", { x: xx, y: H - 6, class: "bars-tick" }, svg).textContent = monthFmt.format(new Date(`${first}T00:00:00Z`));
  }

  dates.forEach((iso, k) => {
    const v = values[k] ?? 0;
    const cx = x(iso);
    if (v <= 0) {
      el("circle", { cx, cy: H - m.b, r: 1.6, class: "bars-dot" }, svg);
      return;
    }
    const h = Math.max(3, (v / max) * ph);
    const r = el("rect", { x: cx - bw / 2, y: H - m.b - h, width: bw, height: h, rx: 2, class: k <= current ? "bar is-past" : "bar" }, svg);
    el("title", {}, r).textContent = `${fmt.date(iso, true)}: ${fmt.num(v, 1)} ha`;
    el("text", { x: cx, y: H - m.b - h - 4, class: "bars-val", "text-anchor": "middle" }, svg).textContent = fmt.num(v, v < 10 ? 1 : 0);
  });
}

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// "Before the radar": context of each study zone from US sources (data/context.json, built by
// pipeline/context_stats.py; numbers explained in docs/CONTEXT.md). One colour per kind of change, as on
// the map: clearing red, fire orange, flooding purple; soybean yellow and beef brown for the national series.
// Hand-made SVG (no chart library) to stay inside the bundle budget.

import { fmt, onLang, t } from "../i18n";

interface ZoneContext {
  loss_ha?: Record<string, number>;
  forest_2000_ha?: number;
  fires?: Record<string, number>;
}
interface ContextData {
  zones: Record<string, ZoneContext>;
  national: { soy_area_kha?: Record<string, number>; beef_exports_kt?: Record<string, number> };
}

const ZONES = ["boqueron-norte", "boqueron-sur", "mbaracayu", "neembucu"];
const YEARS = Array.from({ length: 25 }, (_, i) => String(2001 + i)); // 2001-2025
const SVG = "http://www.w3.org/2000/svg";

function svgEl(tag: string, attrs: Record<string, string | number>): SVGElement {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}

/** Yearly chart: red bars = forest loss (ha), orange line and dots = fire detections. */
function yearlyChart(z: ZoneContext, width: number): SVGSVGElement {
  // drawn at the real width so text keeps its size on phones
  const w = Math.round(Math.min(900, Math.max(300, width)));
  const narrow = w < 520;
  const [h, pl, pr, pt, pb] = [narrow ? 200 : 240, 8, 8, 22, 26];
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, class: "ctx-chart", role: "img" }) as SVGSVGElement;
  const loss = YEARS.map((y) => z.loss_ha?.[y] ?? 0);
  const fires = YEARS.map((y) => z.fires?.[y] ?? 0);
  const maxL = Math.max(1, ...loss);
  const maxF = Math.max(1, ...fires);
  const step = (w - pl - pr) / YEARS.length;
  const y0 = h - pb;
  const ph = y0 - pt;
  svg.append(svgEl("line", { x1: pl, x2: w - pr, y1: y0, y2: y0, class: "ctx-axis" }));
  if (z.loss_ha) {
    loss.forEach((v, i) => {
      if (!v) return;
      const bh = Math.max(1, (v / maxL) * ph);
      const r = svgEl("rect", { x: pl + i * step + step * 0.15, y: y0 - bh, width: step * 0.7, height: bh, rx: 2, class: "ctx-bar" });
      const tip = svgEl("title", {});
      tip.textContent = `${YEARS[i]}: ${fmt.num(v)} ha`;
      r.append(tip);
      svg.append(r);
    });
  }
  const pts = fires.map((v, i) => [pl + (i + 0.5) * step, y0 - (v / maxF) * ph * 0.92] as const);
  svg.append(svgEl("polyline", { points: pts.map(([x, y]) => `${x},${y}`).join(" "), class: "ctx-fire-line" }));
  pts.forEach(([x, y], i) => {
    const c = svgEl("circle", { cx: x, cy: y, r: 3.2, class: "ctx-fire-dot" });
    const tip = svgEl("title", {});
    tip.textContent = `${YEARS[i]}: ${fmt.num(fires[i] ?? 0)} ${t("context.fires_unit")}`;
    c.append(tip);
    svg.append(c);
  });
  // scale: the highest value of each series, in its colour
  const max = (x: number, anchor: string, cls: string, text: string) => {
    const n = svgEl("text", { x, y: 11, class: `ctx-max ${cls}`, "text-anchor": anchor });
    n.textContent = text;
    svg.append(n);
  };
  if (z.loss_ha) max(pl, "start", "is-clear", `${t("context.max")} ${fmt.num(maxL)} ha`);
  max(w - pr, "end", "is-fire", `${t("context.max")} ${fmt.num(maxF)} ${t("context.fires_unit")}`);
  for (const i of narrow ? [0, 9, 19, 24] : [0, 4, 9, 14, 19, 24]) {
    const tx = svgEl("text", { x: pl + (i + 0.5) * step, y: h - 8, class: "ctx-year" });
    tx.textContent = YEARS[i] ?? "";
    svg.append(tx);
  }
  return svg;
}

/** Small national trend: first and last value with a sparkline in the series' colour. */
function trendCard(series: Record<string, number> | undefined, cls: string, title: string, unit: string): HTMLElement {
  const card = document.createElement("article");
  card.className = `ctx-card ${cls}`;
  if (!series) return card;
  const ys = Object.keys(series).sort();
  const vals = ys.map((y) => series[y] ?? 0);
  const max = Math.max(...vals);
  const [w, h] = [220, 56];
  const svg = svgEl("svg", { viewBox: `0 0 ${w} ${h}`, class: "ctx-spark", "aria-hidden": "true", preserveAspectRatio: "none" });
  const pts = vals.map((v, i) => `${(i / Math.max(1, vals.length - 1)) * w},${h - 4 - (v / max) * (h - 8)}`).join(" ");
  svg.append(svgEl("polyline", { points: pts }));
  const first = vals[0] ?? 0;
  const last = vals[vals.length - 1] ?? 0;
  const head = document.createElement("h4");
  head.textContent = title;
  const big = document.createElement("p");
  big.className = "ctx-card-value";
  big.textContent = `${fmt.num(first)} → ${fmt.num(last)} ${unit}`;
  const yrs = document.createElement("p");
  yrs.className = "ctx-card-years";
  yrs.textContent = `${ys[0]} → ${ys[ys.length - 1]} · ×${fmt.num(last / Math.max(1, first), 1)}`;
  card.append(head, big, svg, yrs);
  return card;
}

export function initContext(): void {
  const root = document.getElementById("context-root");
  if (!root) return;
  let data: ContextData | null = null;
  let current = ZONES[0] as string;

  function render() {
    if (!data || !root) return;
    root.innerHTML = "";
    const tabs = document.createElement("div");
    tabs.className = "ctx-tabs";
    tabs.setAttribute("role", "tablist");
    for (const id of ZONES) {
      if (!data.zones[id]) continue;
      const b = document.createElement("button");
      b.type = "button";
      b.className = `ctx-tab${id === current ? " is-on" : ""}`;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(id === current));
      b.textContent = t(`context.zone_${id.replace("-", "_")}`);
      b.addEventListener("click", () => {
        current = id;
        render();
      });
      tabs.append(b);
    }
    const z = data.zones[current] ?? {};
    const lossTotal = Object.values(z.loss_ha ?? {}).reduce((a, b) => a + b, 0);
    const fireTotal = Object.values(z.fires ?? {}).reduce((a, b) => a + b, 0);
    const key = current.replace("-", "_");

    const stats = document.createElement("div");
    stats.className = "ctx-stats";
    const stat = (cls: string, value: string, label: string) => {
      const d = document.createElement("div");
      d.className = `ctx-stat ${cls}`;
      const b = document.createElement("b");
      b.textContent = value;
      const s = document.createElement("span");
      s.textContent = label;
      d.append(b, s);
      return d;
    };
    if (z.loss_ha) {
      const pct = z.forest_2000_ha ? (lossTotal / z.forest_2000_ha) * 100 : 0;
      stats.append(stat("is-clear", `${fmt.num(lossTotal)} ha`, t("context.stat_loss", { pct: fmt.num(pct) })));
    }
    stats.append(stat("is-fire", fmt.num(fireTotal), t("context.stat_fires")));
    if (current === "neembucu") stats.append(stat("is-flood", t("context.flood_value"), t("context.flood_label")));

    const chart = yearlyChart(z, root.clientWidth);
    chart.setAttribute("aria-label", t("context.chart_label", { zone: t(`context.zone_${key}`) }));
    const read = document.createElement("p");
    read.className = "ctx-read";
    read.textContent = t(`context.read_${key}`);

    const legend = document.createElement("div");
    legend.className = "ctx-legend";
    const chip = (cls: string, label: string) => {
      const s = document.createElement("span");
      s.className = `ctx-chip ${cls}`;
      s.textContent = label;
      return s;
    };
    if (z.loss_ha) legend.append(chip("is-clear", t("context.legend_loss")));
    legend.append(chip("is-fire", t("context.legend_fires")));
    if (current === "neembucu") legend.append(chip("is-flood", t("context.legend_flood")));

    const national = document.createElement("div");
    national.className = "ctx-national";
    const nh = document.createElement("h3");
    nh.className = "section-sub";
    nh.textContent = t("context.national_title");
    const cards = document.createElement("div");
    cards.className = "ctx-cards";
    cards.append(
      trendCard(data.national.soy_area_kha, "is-soy", t("context.soy_title"), t("context.soy_unit")),
      trendCard(data.national.beef_exports_kt, "is-beef", t("context.beef_title"), t("context.beef_unit")),
    );
    const note = document.createElement("p");
    note.className = "fineprint";
    note.textContent = t("context.national_note");
    national.append(nh, cards, note);

    const src = document.createElement("p");
    src.className = "fineprint";
    src.textContent = t("context.sources");
    root.append(tabs, stats, legend, chart, read, national, src);
  }

  // load only when the section comes near the screen
  new IntersectionObserver(
    (entries, obs) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      fetch(new URL("data/context.json", document.baseURI).href)
        .then((r) => (r.ok ? (r.json() as Promise<ContextData>) : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          data = d;
          render();
          onLang(render);
          let lastW = root.clientWidth;
          window.addEventListener("resize", () => {
            if (Math.abs(root.clientWidth - lastW) < 40) return;
            lastW = root.clientWidth;
            render();
          });
        })
        .catch(() => root.closest("section")?.setAttribute("hidden", ""));
    },
    { rootMargin: "600px 0px" },
  ).observe(root);
}

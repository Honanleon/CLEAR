// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST build only. "Clearing and rain, month by month": a mirrored bar chart under the map —
// hectares first detected each month (up) and NASA POWER rainfall (down). Plain SVG.

import type { Dataset } from "../data";
import { fmt, locale, onLang } from "../i18n";
import { lt } from "./strings";

const NS = "http://www.w3.org/2000/svg";
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent: Element) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  parent.append(n);
  return n;
}

export function installMonthly(ds: Dataset): void {
  const anchor = document.getElementById("guide-stats");
  if (!anchor || document.querySelector(".lab-monthly")) return;
  const box = document.createElement("section");
  box.className = "lab-monthly";
  anchor.after(box);

  async function render() {
    const [fc, rain] = await Promise.all([ds.polygons(), ds.rain()]);
    const scenes = ds.index.scenes;
    const first = scenes[0]?.date.slice(0, 7);
    const last = scenes[scenes.length - 1]?.date.slice(0, 7);
    if (!first || !last) return;
    const months: string[] = [];
    for (let [y, m] = first.split("-").map(Number) as [number, number]; `${y}-${String(m).padStart(2, "0")}` <= last; ) {
      months.push(`${y}-${String(m).padStart(2, "0")}`);
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    const ha = months.map((mo) => fc.features.filter((f) => f.properties.first_date.startsWith(mo)).reduce((s, f) => s + f.properties.area_ha, 0));
    const mm = months.map((mo) => (rain ? rain.dates.reduce((s, d, i) => (d.startsWith(mo) ? s + (rain.mm[i] ?? 0) : s), 0) : 0));

    box.innerHTML = "";
    const head = document.createElement("div");
    head.className = "lab-monthly-head";
    const h = document.createElement("h4");
    h.textContent = lt("monthly_title");
    const legend = document.createElement("div");
    legend.className = "lab-monthly-legend";
    legend.innerHTML = `<span class="lm-ha"></span><span class="lm-rain"></span>`;
    legend.querySelector(".lm-ha")!.textContent = lt("monthly_cleared");
    legend.querySelector(".lm-rain")!.textContent = lt("monthly_rain");
    if (!rain) legend.querySelector(".lm-rain")!.remove();
    head.append(h, legend);
    box.append(head);

    const W = Math.max(320, box.clientWidth || 900);
    const H = rain ? 260 : 170;
    const top = 26;
    const upH = 120;
    const mid = top + upH + 26;
    const downH = 70;
    const pad = 8;
    const step = (W - pad * 2) / months.length;
    const bw = Math.min(42, step * 0.56);
    const maxHa = Math.max(1, ...ha);
    const maxMm = Math.max(1, ...mm);
    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", class: "lab-monthly-svg", role: "img" }, box);
    el("title", {}, svg).textContent = lt("monthly_title");
    const fm = new Intl.DateTimeFormat(locale(), { month: "short", timeZone: "UTC" });
    months.forEach((mo, i) => {
      const cx = pad + step * i + step / 2;
      const hh = (ha[i]! / maxHa) * upH;
      if (ha[i]! > 0) {
        el("rect", { x: cx - bw / 2, y: top + upH - hh, width: bw, height: Math.max(2, hh), rx: 6, class: "lm-bar-ha" }, svg);
        el("text", { x: cx, y: top + upH - hh - 7, class: "lm-val", "text-anchor": "middle" }, svg).textContent = fmt.num(ha[i]!);
      } else {
        el("rect", { x: cx - bw / 2, y: top + upH - 2, width: bw, height: 2, rx: 1, class: "lm-bar-zero" }, svg);
      }
      el("text", { x: cx, y: top + upH + 17, class: "lm-month", "text-anchor": "middle" }, svg).textContent = fm.format(new Date(`${mo}-01T00:00:00Z`));
      if (rain) {
        const rh = (mm[i]! / maxMm) * downH;
        el("rect", { x: cx - bw / 2, y: mid, width: bw, height: Math.max(2, rh), rx: 6, class: "lm-bar-rain" }, svg);
        el("text", { x: cx, y: mid + Math.max(2, rh) + 14, class: "lm-val lm-val-rain", "text-anchor": "middle" }, svg).textContent = fmt.num(mm[i]!);
      }
    });
    const note = document.createElement("p");
    note.className = "lab-monthly-note";
    note.textContent = rain ? lt("monthly_note") : lt("monthly_note_norain");
    box.append(note);
  }

  void render();
  onLang(() => void render());
  new ResizeObserver(() => void render()).observe(box);
}

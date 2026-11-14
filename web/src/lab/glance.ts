// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST build only. General audience: the hexagon at a glance — one big number, a comparison
// anyone understands, when it happened and whether another satellite saw it.

import type { PolygonFeature, Scene } from "../data";
import { fmt, locale } from "../i18n";
import type { HexCell } from "../map/hexgrid";
import { SOCCER_FIELD_HA } from "../map/zone";
import { lt } from "./strings";

const ICON_CAL = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`;
const ICON_OK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.6L16.5 9"/></svg>`;
const ICON_Q = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/></svg>`;

export function renderGlance(host: HTMLElement, cell: HexCell, now: number, scenes: Scene[], polys: PolygonFeature[]): void {
  const box = document.createElement("section");
  box.className = "glance";
  const ha = cell.cumHa[now] ?? 0;
  const total = cell.cumHa[scenes.length - 1] ?? 0;

  if (ha <= 0) {
    box.classList.add("glance-quiet");
    const p = document.createElement("p");
    p.className = "glance-quiet-text";
    p.textContent = total > 0 ? lt("glance_later", { ha: fmt.num(total, total < 10 ? 1 : 0) }) : lt("glance_none");
    box.append(p);
    host.append(box);
    return;
  }

  // "Se desmontaron" on its own line, then the number with its unit: "51 ha"
  const big = document.createElement("p");
  big.className = "glance-big";
  const [before, after] = lt("glance_cleared", { ha: "§" }).split("§");
  if (before?.trim()) {
    const label = document.createElement("span");
    label.className = "glance-label";
    label.textContent = before.trim();
    big.append(label);
  }
  const value = document.createElement("span");
  value.className = "glance-value";
  const num = document.createElement("b");
  num.textContent = `${fmt.num(ha, ha < 10 ? 1 : 0)}`;
  value.append(num, document.createTextNode(after ?? ""));
  big.append(value);

  const sub = document.createElement("p");
  sub.className = "glance-sub";
  sub.textContent = `${lt("glance_fields", { n: fmt.num(ha / SOCCER_FIELD_HA) })} · ${lt("glance_share", { pct: fmt.num((ha / cell.areaHa) * 100) })}`;

  const rows = document.createElement("div");
  rows.className = "glance-rows";
  const row = (icon: string, text: string, note: string, cls: string) => {
    const r = document.createElement("div");
    r.className = `glance-row ${cls}`;
    r.innerHTML = icon;
    const t = document.createElement("div");
    const b = document.createElement("b");
    b.textContent = text;
    t.append(b);
    if (note) {
      const s = document.createElement("span");
      s.textContent = note;
      t.append(s);
    }
    r.append(t);
    rows.append(r);
  };
  const first = scenes[cell.firstT ?? 0]?.date ?? "";
  const month = first ? new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`)) : "";
  row(ICON_CAL, lt("glance_when", { month }), lt("glance_when_note"), "glance-when");

  const shown = polys.filter((f) => (f.properties.t ?? 0) <= now);
  const checked = shown.filter((f) => f.properties.dist_confirmed !== null);
  const yes = checked.some((f) => f.properties.dist_confirmed === true);
  if (!checked.length) row(ICON_Q, lt("glance_unknown"), "", "glance-unknown");
  else if (yes) row(ICON_OK, lt("glance_yes"), "OPERA DIST-ALERT", "glance-yes");
  else row(ICON_Q, lt("glance_no"), "", "glance-no");

  box.append(big, sub, rows);
  host.append(box);
}

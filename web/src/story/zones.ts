// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Study-zone picker (schema v3, zones.json). One button per zone in the map chapter; choosing one
// reloads the page with ?zona=<id>, so every chapter (map, guide, validation) reads that zone's files
// and the link can be shared. Also swaps the map chapter's texts for the water and control zones.

import { type Dataset, ZONE_PARAM } from "../data";
import { applyStatic, lang, onLang, t } from "../i18n";

function el(tag: string, cls: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function initZones(ds: Dataset | null): void {
  if (!ds) return;
  const kind = ds.kind;
  document.body.dataset.zoneKind = kind;

  // texts of the map chapter that depend on the kind of zone
  const section = document.getElementById("map");
  const title = section?.querySelector<HTMLElement>("h2[data-i18n]");
  const body = section?.querySelector<HTMLElement>("p.lede[data-i18n]");
  if (kind === "water") {
    title?.setAttribute("data-i18n", "map.title_water");
    body?.setAttribute("data-i18n", "map.body_water");
  } else if (kind === "control") {
    body?.setAttribute("data-i18n", "map.body_control");
  }
  if (section) applyStatic(section);

  if (ds.zones.length < 2) return;
  const wrap = el("div", "zone-picker");
  const paint = () => {
    wrap.innerHTML = "";
    const row = el("div", "zone-pills");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", t("zones.label"));
    for (const z of ds.zones) {
      const b = el("button", "zone-pill") as HTMLButtonElement;
      b.type = "button";
      const current = z.id === ds.zone?.id;
      b.setAttribute("aria-pressed", String(current));
      b.append(el("b", "zone-name", z.name[lang()] ?? z.name.es), el("span", `zone-kind zone-kind-${z.kind}`, t(`zones.kind_${z.kind}`)));
      b.addEventListener("click", () => {
        if (current) return;
        const u = new URL(location.href);
        if (z.primary) u.searchParams.delete(ZONE_PARAM);
        else u.searchParams.set(ZONE_PARAM, z.id);
        u.hash = "map";
        location.assign(u.href);
      });
      row.append(b);
    }
    wrap.append(el("p", "zone-picker-label", t("zones.label")), row);
    if (kind !== "clearing") wrap.append(el("p", "zone-note", t(`zones.note_${kind}`)));
  };
  paint();
  onLang(paint);
  section?.querySelector(".map-intro .lede")?.after(wrap);
}

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Study zones (schema v3, zones.json). The map shows every zone at once; this module keeps which zone
// is "in focus" (the one the map flies to), draws the zone picker of the map chapter and tells the map
// when the focus changes. Choosing a zone never reloads the page: it only moves the map, and the URL
// gets ?zona=<id> (replaceState) so the view can be shared.

import { type Dataset, ZONE_PARAM, type ZoneInfo } from "../data";
import { lang, onLang, t } from "../i18n";

function el(tag: string, cls: string, text?: string): HTMLElement {
  const n = document.createElement(tag);
  n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
}

export function zoneName(z: ZoneInfo): string {
  return z.name[lang()] ?? z.name.es;
}

let zones: ZoneInfo[] = [];
let focusId: string | null = null;
const listeners = new Set<(z: ZoneInfo) => void>();

/** The zone the map is focused on (from ?zona=, else the primary zone). */
export function focusedZone(): ZoneInfo | null {
  return zones.find((z) => z.id === focusId) ?? zones.find((z) => z.primary) ?? zones[0] ?? null;
}

export function onZoneFocus(fn: (z: ZoneInfo) => void): void {
  listeners.add(fn);
}

/** Focuses a zone: updates the pickers and the URL (no reload) and tells the map to fly there. */
export function focusZoneById(id: string): void {
  const z = zones.find((x) => x.id === id);
  if (!z) return;
  focusId = z.id;
  try {
    const u = new URL(location.href);
    if (z.primary) u.searchParams.delete(ZONE_PARAM);
    else u.searchParams.set(ZONE_PARAM, z.id);
    history.replaceState(history.state, "", u.href);
  } catch {
    /* sandboxed or file: URL: the focus still works */
  }
  listeners.forEach((fn) => fn(z));
}

export function initZones(ds: Dataset | null): void {
  if (!ds) return;
  zones = ds.zones;
  const wanted = new URLSearchParams(location.search).get(ZONE_PARAM);
  focusId = zones.some((z) => z.id === wanted) ? wanted : (focusedZone()?.id ?? null);
  if (zones.length < 2) return;

  const section = document.getElementById("map");
  const wrap = el("div", "zone-picker");
  const paint = () => {
    const current = focusedZone();
    wrap.innerHTML = "";
    const row = el("div", "zone-pills");
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", t("zones.label"));
    for (const z of zones) {
      const b = el("button", "zone-pill") as HTMLButtonElement;
      b.type = "button";
      b.setAttribute("aria-pressed", String(z.id === current?.id));
      b.append(el("b", "zone-name", zoneName(z)), el("span", `zone-kind zone-kind-${z.kind}`, t(`zones.kind_${z.kind}`)));
      b.addEventListener("click", () => {
        focusZoneById(z.id);
        // bring the map into view (smoothly, from the text above it); the map flies to the zone
        document.getElementById("map-shell")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      row.append(b);
    }
    // no note here: text appearing above the map would push the map down while it is on screen
    wrap.append(el("p", "zone-picker-label", t("zones.label")), row);
  };
  paint();
  onLang(paint);
  onZoneFocus(paint);
  section?.querySelector(".map-intro .lede")?.after(wrap);
}

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST SITE only: the CLEAR assistant of the lab build (lab/chat.ts: claude.ai `sample`, the viewer's own
// Claude account, no key, no server) next to the map: an "Ask CLEAR" button + drawer for the whole study
// area, and a question box in each hexagon panel. It answers only when the page runs as a claude.ai
// artifact; elsewhere the box says so. The lab knowledge is completed with what only the test site shows
// (fire layer, probable cause) through the data it already sends.

import "./test-chat.css";
import type { Dataset, PolygonFeature } from "../data";
import { onLang } from "../i18n";
import { type ChatDeps, mountChat } from "../lab/chat";
import { buildHexContext, buildStudyContext, type HexContext, signalAt, type StudyContext } from "../lab/context";
import { lt } from "../lab/strings";
import type { HexCell, HexGrid } from "./hexgrid";

const ICON_CHAT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;
/** Mini hexagon ids are offset so they never share a conversation (or a tool lookup) with a big one. */
const MINI_ID = 10_000_000;

export interface TestChatHost {
  ds: Dataset;
  hex: HexGrid;
  mini: HexGrid;
  polygonsById: Map<number, PolygonFeature>;
  /** The zones and the fire layer's thresholds (days) that the test site shows. */
  zones: { id: string; kind: string; bbox: number[] }[];
  fireMin: { big: number; mini: number };
  closeZone(): void;
}

/** What the test site adds to the study data the assistant reads (fire layer, rule of the probable cause). */
function testSiteData(host: TestChatHost) {
  return {
    note: "TEST version of the site. Besides the radar clearing it shows fire detections; answer about them only with these rules.",
    zones: host.zones,
    fire_layer: {
      source:
        "NASA FIRMS VIIRS S-NPP 375 m thermal anomalies (daily, Nov 2025 - Oct 2026) via NASA GIBS images; satellite-detected, not checked on the ground; the drawn extent of each fire is inflated",
      shown_as: `red hatched hexagons, only the quarter with the most fire days (>= ${host.fireMin.big} days in a 24 km hexagon, >= ${host.fireMin.mini} in a 2 km one)`,
      outside_study_zones:
        "fire hexagons outside the study zones: fire was observed, but the radar was not analysed there, so CLEAR does not know if there was clearing; the fire may be clearing with burning, or agricultural / grassland burning",
      inside_without_clearing: "fire hexagons with no radar clearing: fire was observed but the radar saw the forest standing; it may be grassland or crop burning, or a fire that did not take the forest down",
    },
    probable_cause_rule:
      "in a hexagon with radar-estimated clearing: 'with fire' if VIIRS detected fire from 36 days before to 60 days after the first detection date (it may be the fire that opened the forest or the burning of the debris piles after mechanical clearing); otherwise 'no fire: mechanical clearing' (an inference: no fire was detected)",
  };
}

export function createTestChat(host: TestChatHost) {
  const polysOf = (cell: HexCell) => cell.polyIds.map((id) => host.polygonsById.get(id)).filter((f): f is PolygonFeature => f !== undefined);
  const last = host.ds.index.scenes.length - 1;
  let studyCtx: Promise<StudyContext> | null = null;
  const deps: ChatDeps = {
    study: () => (studyCtx ??= buildStudyContext(host.ds, host.hex).then((s) => ({ ...s, test_site: testSiteData(host) }) as StudyContext)),
    signalAt: (lon, lat) => signalAt(host.ds, lon, lat),
    hexagon: async (id) => {
      const cell = id >= MINI_ID ? host.mini.cells[id - MINI_ID] : host.hex.cells[id];
      return cell ? buildHexContext(host.ds, cell, polysOf(cell), last) : null;
    },
  };

  const button = document.createElement("button");
  button.type = "button";
  button.className = "lab-ask-btn";
  const drawer = document.createElement("aside");
  drawer.className = "lab-drawer";
  drawer.hidden = true;
  const close = () => {
    drawer.hidden = true;
    button.hidden = false;
  };
  const render = () => {
    if (drawer.hidden) return;
    drawer.innerHTML = "";
    const x = document.createElement("button");
    x.type = "button";
    x.className = "icon-btn lab-drawer-close";
    x.innerHTML = ICON_CLOSE;
    x.setAttribute("aria-label", lt("ask_close"));
    x.addEventListener("click", close);
    drawer.append(x);
    mountChat(drawer, { kind: "study" }, deps);
  };
  button.addEventListener("click", () => {
    host.closeZone();
    drawer.hidden = false;
    button.hidden = true;
    render();
    drawer.querySelector<HTMLInputElement>("input")?.focus();
  });
  const paint = () => {
    button.innerHTML = `${ICON_CHAT}<span></span>`;
    button.querySelector("span")!.textContent = lt("ask_open");
    render();
  };
  paint();
  onLang(paint);

  return {
    overlay: [button, drawer],
    /** Question box under the hexagon panel's facts; `fire` = that hexagon's fire facts (test site). */
    decorateHex(zone: HTMLElement, cell: HexCell, isMini: boolean, ds: Dataset, now: number, fire: Record<string, unknown> | null) {
      if (!drawer.hidden) close();
      const slot = document.createElement("div");
      slot.className = "test-chat-hex";
      const facts = zone.querySelector(".facts");
      if (facts) facts.after(slot);
      else zone.append(slot);
      const polys = polysOf(cell);
      mountChat(
        slot,
        {
          kind: "hex",
          cellId: (isMini ? MINI_ID : 0) + cell.id,
          context: () => buildHexContext(ds, cell, polys, now).then((c) => ({ ...c, ...(fire ? { fire_viirs: fire } : {}) }) as HexContext),
        },
        deps,
      );
    },
  };
}

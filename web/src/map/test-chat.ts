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
  /** What the test site adds to the study data (fire layer, rules of the probable cause). */
  extra: () => Record<string, unknown>;
  closeZone(): void;
}

export function createTestChat(host: TestChatHost) {
  const polysOf = (cell: HexCell) => cell.polyIds.map((id) => host.polygonsById.get(id)).filter((f): f is PolygonFeature => f !== undefined);
  const last = host.ds.index.scenes.length - 1;
  let studyCtx: Promise<StudyContext> | null = null;
  const deps: ChatDeps = {
    study: () => (studyCtx ??= buildStudyContext(host.ds, host.hex).then((s) => ({ ...s, test_site: host.extra() }) as StudyContext)),
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

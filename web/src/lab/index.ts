// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST (lab) build only: loaded by map/index.ts when the app is built with `--mode lab`.
// The official build never includes this folder. Adds:
//  - a General / Expert switch in the top bar (and inside the assistant), like ES / EN;
//  - the CLEAR assistant (claude.ai `sample`): in each hexagon panel and in an "Ask CLEAR" drawer;
//  - general audience: the hexagon at a glance; expert audience: technical tables, signal chart, outlines;
//  - a calmer layout (lab.css) and an offline satellite basemap (claude.ai artifacts cannot load map tiles).

import type { BBox, Dataset, PolygonFeature } from "../data";
import { onLang } from "../i18n";
import type { HexCell, HexGrid } from "../map/hexgrid";
import type { RadarMapOptions } from "../map/radar-map";
import { audience, onAudience } from "./audience";
import { type ChatDeps, mountChat } from "./chat";
import { buildHexContext, buildStudyContext, type StudyContext, signalAt } from "./context";
import { renderExpert } from "./expert";
import { renderGlance } from "./glance";
import { installMonthly } from "./monthly";
import { lt } from "./strings";

/** Must match scripts/lab-package.mjs (tile coverage of the offline basemap). */
export const LAB_TILE_MARGIN_DEG = 0.08;
export const LAB_TILE_MAXZOOM = 13;

export interface LabHost {
  ds: Dataset;
  hex: HexGrid;
  polygonsById: Map<number, PolygonFeature>;
  /** Re-render the open hexagon panel. */
  refresh(): void;
  /** Show or hide the exact clearing outlines on the map. */
  setOutlines(on: boolean): void;
  /** Close the hexagon panel. */
  closeZone(): void;
  /** Leave before/after mode (general audience only uses the timeline). */
  timelineMode(): void;
}

export interface Lab {
  offline: NonNullable<RadarMapOptions["offline"]>;
  /** Experts see the exact clearing outlines from the start. */
  outlinesAtStart: boolean;
  /** Elements for the map overlay: the "Ask CLEAR" button and its drawer. */
  overlay: HTMLElement[];
  /** Called after the hexagon panel is rendered. */
  decorateHex(zone: HTMLElement, cell: HexCell, now: number): void;
}

const ICON_CHAT = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5h16v10H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/></svg>`;
const ICON_CLOSE = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

export function createLab(host: LabHost): Lab {
  const { ds, hex } = host;
  const aoi = ds.index.aoi.bbox;
  const m = LAB_TILE_MARGIN_DEG;
  const bounds: BBox = [aoi[0] - m, aoi[1] - m, aoi[2] + m, aoi[3] + m];
  const last = ds.index.scenes.length - 1;
  installMonthly(ds);

  const polysOf = (cell: HexCell) => cell.polyIds.map((id) => host.polygonsById.get(id)).filter((f): f is PolygonFeature => f !== undefined);
  let studyCtx: Promise<StudyContext> | null = null;
  const deps: ChatDeps = {
    study: () => (studyCtx ??= buildStudyContext(ds, hex)),
    signalAt: (lon, lat) => signalAt(ds, lon, lat),
    hexagon: async (id) => {
      const cell = hex.cells[id];
      return cell ? buildHexContext(ds, cell, polysOf(cell), last) : null;
    },
  };

  // "Ask CLEAR" button + drawer for questions about the whole study area
  const askBtn = document.createElement("button");
  askBtn.type = "button";
  askBtn.className = "lab-ask-btn";
  const drawer = document.createElement("aside");
  drawer.className = "lab-drawer";
  drawer.hidden = true;
  const openDrawer = () => {
    host.closeZone();
    drawer.hidden = false;
    askBtn.hidden = true;
    renderDrawer();
    drawer.querySelector<HTMLInputElement>("input")?.focus();
  };
  const closeDrawer = () => {
    drawer.hidden = true;
    askBtn.hidden = false;
  };
  askBtn.addEventListener("click", openDrawer);
  function renderDrawer() {
    if (drawer.hidden) return;
    drawer.innerHTML = "";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "icon-btn lab-drawer-close";
    close.innerHTML = ICON_CLOSE;
    close.setAttribute("aria-label", lt("ask_close"));
    close.addEventListener("click", closeDrawer);
    drawer.append(close);
    mountChat(drawer, { kind: "study" }, deps);
  }

  function paint() {
    askBtn.innerHTML = `${ICON_CHAT}<span></span>`;
    askBtn.querySelector("span")!.textContent = lt("ask_open");
    renderDrawer();
  }
  paint();
  onLang(paint);
  onAudience((a) => {
    host.setOutlines(a === "expert");
    if (a === "general") host.timelineMode();
    host.refresh();
    renderDrawer();
  });
  return {
    outlinesAtStart: audience() === "expert",
    offline: {
      tiles: `${new URL("tiles/", document.baseURI).href}{z}/{x}/{y}.jpg`,
      attribution: lt("tiles_attr"),
      maxzoom: LAB_TILE_MAXZOOM,
      bounds,
    },
    overlay: [askBtn, drawer],
    decorateHex(zone, cell, now) {
      if (!drawer.hidden) closeDrawer();
      const polys = polysOf(cell);
      const expert = audience() === "expert";
      const head = zone.querySelector(".zone-head");
      const facts = zone.querySelector(".facts");
      const anchor = (expert ? facts : head) ?? head;

      const top = document.createElement("div");
      top.className = "lab-top";
      if (!expert) renderGlance(top, cell, now, ds.index.scenes, polys);
      const chatSlot = document.createElement("div");
      top.append(chatSlot);
      if (anchor) anchor.after(top);
      else zone.prepend(top);
      mountChat(chatSlot, { kind: "hex", cellId: cell.id, context: () => buildHexContext(ds, cell, polys, now) }, deps);

      if (expert) {
        const xslot = document.createElement("div");
        const tech = zone.querySelector(".zone-tech");
        if (tech) tech.before(xslot);
        else zone.append(xslot);
        void buildHexContext(ds, cell, polys, now).then((ctx) => {
          if (xslot.isConnected) renderExpert(xslot, ctx);
        });
        const signal = zone.querySelector<HTMLDetailsElement>("details.zone-signal");
        if (signal && !signal.open) {
          signal.open = true;
          signal.dispatchEvent(new Event("toggle"));
        }
      }
    },
  };
}

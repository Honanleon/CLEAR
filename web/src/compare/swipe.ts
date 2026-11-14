// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Before/after swipe: map B sits on top of map A and is clipped to the right of a draggable
// divider. Cameras are kept in sync both ways. Written for CLEAR (no compare plugin used).

import type { Map as MLMap } from "maplibre-gl";

export class Swipe {
  private x = 0.5;
  private syncing = false;
  private offA: () => void;
  private offB: () => void;

  constructor(
    private shell: HTMLElement,
    private layerB: HTMLElement,
    private knob: HTMLButtonElement,
    a: MLMap,
    b: MLMap,
  ) {
    const follow = (from: MLMap, to: MLMap) => () => {
      if (this.syncing) return;
      this.syncing = true;
      to.jumpTo({ center: from.getCenter(), zoom: from.getZoom(), bearing: from.getBearing(), pitch: from.getPitch() });
      this.syncing = false;
    };
    const fa = follow(a, b);
    const fb = follow(b, a);
    a.on("move", fa);
    b.on("move", fb);
    this.offA = () => a.off("move", fa);
    this.offB = () => b.off("move", fb);
    fa();

    knob.addEventListener("pointerdown", this.onDown);
    knob.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.apply);
    this.apply();
  }

  private onDown = (e: PointerEvent) => {
    e.preventDefault();
    this.knob.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const r = this.shell.getBoundingClientRect();
      this.x = Math.min(0.98, Math.max(0.02, (ev.clientX - r.left) / r.width));
      this.apply();
    };
    const up = () => {
      this.knob.removeEventListener("pointermove", move);
      this.knob.removeEventListener("pointerup", up);
      this.knob.removeEventListener("pointercancel", up);
    };
    this.knob.addEventListener("pointermove", move);
    this.knob.addEventListener("pointerup", up);
    this.knob.addEventListener("pointercancel", up);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    this.x = Math.min(0.98, Math.max(0.02, this.x + (e.key === "ArrowRight" ? 0.04 : -0.04)));
    this.apply();
  };

  private apply = () => {
    const w = this.shell.clientWidth;
    const px = Math.round(this.x * w);
    this.layerB.style.clipPath = `inset(0 0 0 ${px}px)`;
    this.shell.style.setProperty("--swipe-x", `${px}px`);
    this.knob.setAttribute("aria-valuenow", String(Math.round(this.x * 100)));
  };

  destroy(): void {
    this.offA();
    this.offB();
    this.knob.removeEventListener("pointerdown", this.onDown);
    this.knob.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.apply);
    this.layerB.style.clipPath = "";
    this.shell.style.removeProperty("--swipe-x");
  }
}

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Cover animation: an illustrative, procedurally generated landscape of hexagons (like the map).
// A red sweep line (one NISAR pass) runs south to north every cycle; patches of forest flash
// red as they are cleared and stay dark red, and a river floods in purple: the alarm colours
// of the map (red clearing, purple flooding). It is not data: the HUD says so.

import { fmt, onLang } from "../i18n";

const DEFAULT_DATES = [
  "2026-06-01", "2026-06-13", "2026-06-25", "2026-07-07", "2026-07-19", "2026-08-24",
  "2026-09-05", "2026-09-17", "2026-09-29", "2026-10-11", "2026-10-23",
];
const PASS_MS = 2300;
const SQRT3 = Math.sqrt(3);
const HOLD_MS = 2600;

type RGB = [number, number, number];
// alarm palette: dark forest, cleared land that stays blood red, a white-hot red flash on detection,
// flood water in purple (same meanings as the map's hexagons)
const FOREST_DARK: RGB = [9, 30, 22];
const FOREST_LIGHT: RGB = [30, 66, 46];
const PASTURE_DARK: RGB = [104, 10, 18];
const PASTURE_LIGHT: RGB = [168, 20, 30];
const FLASH: RGB = [255, 150, 130];
const FRESH: RGB = [255, 26, 26];
const FLOOD_DARK: RGB = [84, 0, 170];
const FLOOD_LIGHT: RGB = [150, 50, 255];

function rng(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

interface Landscape {
  cols: number;
  rows: number;
  clearAt: Int8Array; // -1 forest, 0 pasture already, k >= 1 cleared at pass k
  floodAt: Int8Array; // -1 dry, k >= 1 flooded from pass k (a river overflowing, lower part)
  tone: Float32Array; // 0..1 texture
  dropByPass: number[]; // illustrative ΔHV shown in the HUD
}

function buildLandscape(cols: number, rows: number, passes: number): Landscape {
  const r = rng(1311);
  const clearAt = new Int8Array(cols * rows).fill(-1);
  const tone = new Float32Array(cols * rows);

  // Smooth texture from a coarse random grid.
  const g = 7;
  const gw = Math.ceil(cols / g) + 2;
  const gh = Math.ceil(rows / g) + 2;
  const coarse = Array.from({ length: gw * gh }, () => r());
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const fx = x / g;
      const fy = y / g;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const a = coarse[y0 * gw + x0] ?? 0;
      const b = coarse[y0 * gw + x0 + 1] ?? 0;
      const c = coarse[(y0 + 1) * gw + x0] ?? 0;
      const d = coarse[(y0 + 1) * gw + x0 + 1] ?? 0;
      const v = a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
      tone[y * cols + x] = Math.min(1, Math.max(0, v * 0.8 + r() * 0.35));
    }
  }

  const paint = (x0: number, y0: number, w: number, h: number, value: number, step: number) => {
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
        if ((x - x0) % step === 0 || (y - y0) % step === 0) continue; // forest windbreak
        const i = y * cols + x;
        if (clearAt[i] === -1) clearAt[i] = value;
      }
    }
  };

  // Older ranches on the east and south: a frontier advancing into forest.
  const ranches: [number, number, number, number][] = [];
  for (let k = 0; k < Math.round((cols * rows) / 900); k++) {
    const w = 8 + Math.floor(r() * 16);
    const h = 6 + Math.floor(r() * 12);
    const x0 = Math.floor(cols * 0.3 + r() * cols * 0.7) - 4;
    const y0 = Math.floor(rows * 0.15 + r() * rows * 0.85) - 4;
    ranches.push([x0, y0, w, h]);
    paint(x0, y0, w, h, 0, 4 + Math.floor(r() * 3));
  }

  // New clearings attached to ranch edges, spread over the passes.
  const dropByPass = Array.from({ length: passes }, () => 0);
  const count = Math.round((cols * rows) / 420);
  for (let k = 0; k < count; k++) {
    const [rx, ry, rw, rh] = ranches[Math.floor(r() * ranches.length)] ?? [0, 0, 1, 1];
    const w = 3 + Math.floor(r() * 7);
    const h = 3 + Math.floor(r() * 6);
    const side = Math.floor(r() * 4);
    const x0 = side === 0 ? rx - w - 1 : side === 1 ? rx + rw + 1 : rx + Math.floor(r() * rw);
    const y0 = side === 2 ? ry - h - 1 : side === 3 ? ry + rh + 1 : ry + Math.floor(r() * rh);
    const pass = 2 + Math.floor(r() * (passes - 2));
    paint(x0, y0, w, h, pass, w > 5 ? 4 : 99);
    dropByPass[pass] = -(5 + r() * 3);
  }
  // a river across the lower part that overflows a little more at each pass (illustrative flooding)
  const floodAt = new Int8Array(cols * rows).fill(-1);
  const base = rows * 0.38; // the near rows are enlarged by the perspective: keep the river mid-way and narrow
  for (let x = 0; x < cols; x++) {
    const yr = base + Math.sin(x / 5.5) * rows * 0.025 + Math.sin(x / 2.3 + 1) * rows * 0.008;
    for (let y = 0; y < rows; y++) {
      const d = Math.abs(y - yr) - r() * 1.2;
      if (d < 0.6) floodAt[y * cols + x] = 1;
      else if (d < 1.4) floodAt[y * cols + x] = Math.min(passes - 1, 3 + Math.floor((d - 0.6) * 6));
    }
  }
  return { cols, rows, clearAt, floodAt, tone, dropByPass };
}

export interface Hero {
  setDates(dates: string[]): void;
}

export function initHero(canvas: HTMLCanvasElement): Hero {
  const ctx = canvas.getContext("2d");
  const hudPass = document.getElementById("hud-pass");
  const hudDate = document.getElementById("hud-date");
  const hudSignal = document.getElementById("hud-signal");
  const hudAlert = document.getElementById("hud-alert");
  if (!ctx) return { setDates() {} };

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let dates = DEFAULT_DATES;
  let land: Landscape | null = null;
  let start = performance.now();
  let running = false;
  let visible = true;
  let raf = 0;
  let lastPass = -1;
  let hexR = 10;

  /** One filled hexagon per landscape cell, a hairline gap between them. */
  function drawHex(pass: number, sweep: number) {
    if (!land) return;
    const { cols, rows } = land;
    const W = canvas.width;
    const H = canvas.height;
    const r = hexR;
    const inner = r * 0.9;
    const lineY = sweep * H;
    ctx!.clearRect(0, 0, W, H);
    const hot: [number, number, string][] = [];
    for (let y = 0; y < rows; y++) {
      const cy = r + y * 1.5 * r;
      const acquired = cy >= lineY;
      const statePass = acquired ? pass : pass - 1;
      const fresh = acquired ? Math.max(0, 1 - (cy - lineY) / (H * 0.35)) : 0;
      for (let x = 0; x < cols; x++) {
        const cx = (x + (y % 2 ? 0.5 : 0)) * SQRT3 * r;
        const i = y * cols + x;
        const [cr, cg, cb] = color(i, statePass, fresh);
        ctx!.fillStyle = `rgb(${cr | 0},${cg | 0},${cb | 0})`;
        // just-detected clearings glow (drawn again on top, below)
        if ((land.clearAt[i] ?? -1) === statePass && statePass > 0) hot.push([cx, cy, ctx!.fillStyle as string]);
        ctx!.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = ((60 * k - 30) * Math.PI) / 180;
          const px = cx + inner * Math.cos(a);
          const py = cy + inner * Math.sin(a);
          if (k) ctx!.lineTo(px, py);
          else ctx!.moveTo(px, py);
        }
        ctx!.closePath();
        ctx!.fill();
      }
    }
    if (hot.length) {
      ctx!.save();
      ctx!.shadowColor = "rgba(255, 30, 30, 0.95)";
      ctx!.shadowBlur = r * 1.4;
      for (const [cx, cy, fill] of hot) {
        ctx!.fillStyle = fill;
        ctx!.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = ((60 * k - 30) * Math.PI) / 180;
          const px = cx + inner * Math.cos(a);
          const py = cy + inner * Math.sin(a);
          if (k) ctx!.lineTo(px, py);
          else ctx!.moveTo(px, py);
        }
        ctx!.closePath();
        ctx!.fill();
      }
      ctx!.restore();
    }
    if (sweep > 0 && sweep < 1) {
      const band = H * 0.22;
      const grad = ctx!.createLinearGradient(0, lineY, 0, lineY + band);
      grad.addColorStop(0, "rgba(255,40,40,0.38)");
      grad.addColorStop(1, "rgba(255,40,40,0)");
      ctx!.fillStyle = grad;
      ctx!.fillRect(0, lineY, W, band);
      ctx!.fillStyle = "rgba(255,110,110,0.95)";
      ctx!.fillRect(0, lineY - 1.5, W, 3);
    }
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const cols = w < 700 ? 26 : 46;
    hexR = canvas.width / ((cols - 0.5) * SQRT3);
    const rows = Math.ceil(canvas.height / (1.5 * hexR)) + 1;
    land = buildLandscape(cols, rows, dates.length);
    lastPass = -1;
    if (reduced) draw(dates.length - 1, 0);
  }

  function color(i: number, statePass: number, fresh: number): RGB {
    const l = land!;
    const c = l.clearAt[i] ?? -1;
    const tone = l.tone[i] ?? 0.5;
    const f = l.floodAt[i] ?? -1;
    if (f > 0 && statePass >= f) return statePass === f ? mix(FLOOD_LIGHT, [200, 140, 255], fresh * 0.6) : mix(FLOOD_DARK, FLOOD_LIGHT, tone);
    if (c === -1 || (c > 0 && statePass < c)) return mix(FOREST_DARK, FOREST_LIGHT, tone);
    if (c > 0 && statePass === c) return mix(FRESH, FLASH, fresh);
    if (c > 0 && statePass === c + 1) return mix(PASTURE_LIGHT, FRESH, 0.45 * tone);
    return mix(PASTURE_DARK, PASTURE_LIGHT, tone);
  }

  /** pass: current pass index; sweep: 1 = line at the bottom (start), 0 = at the top (done). */
  function draw(pass: number, sweep: number) {
    drawHex(pass, sweep);
  }

  function hud(pass: number) {
    if (pass === lastPass || !land) return;
    lastPass = pass;
    if (hudPass) hudPass.textContent = `${String(pass + 1).padStart(2, "0")}/${String(dates.length).padStart(2, "0")}`;
    if (hudDate) hudDate.textContent = dates[pass] ? fmt.date(dates[pass] as string, true) : "—";
    if (hudSignal) {
      const drop = land.dropByPass[pass] ?? 0;
      hudSignal.textContent = drop < 0 ? `${fmt.signed(drop)} dB` : `${fmt.signed(0.2)} dB`;
      hudSignal.classList.toggle("is-alert", drop < 0);
    }
    if (hudAlert) hudAlert.hidden = !((land.dropByPass[pass] ?? 0) < 0);
  }

  function frame(now: number) {
    raf = 0;
    if (!running) return;
    const n = dates.length;
    const cycle = n * PASS_MS + HOLD_MS;
    const e = (now - start) % cycle;
    const pass = Math.min(n - 1, Math.floor(e / PASS_MS));
    const sweep = e >= n * PASS_MS ? 0 : 1 - (e - pass * PASS_MS) / PASS_MS;
    draw(pass, sweep);
    hud(pass);
    raf = requestAnimationFrame(frame);
  }

  function update() {
    const should = visible && !document.hidden && !reduced;
    if (should && !running) {
      running = true;
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (!should && running) {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
    update();
  }).observe(canvas);
  document.addEventListener("visibilitychange", update);
  onLang(() => {
    const p = lastPass;
    lastPass = -1;
    hud(Math.max(0, p));
  });

  resize();
  start = performance.now();
  if (reduced) {
    draw(dates.length - 1, 0);
    hud(dates.length - 1);
  }
  update();

  return {
    setDates(next: string[]) {
      if (next.length < 3) return;
      // keep the cover loop short: at most 11 evenly spaced passes
      dates = next.length > 11 ? Array.from({ length: 11 }, (_, i) => next[Math.round((i * (next.length - 1)) / 10)] as string) : next;
      resize();
      start = performance.now();
      if (reduced) hud(dates.length - 1);
    },
  };
}

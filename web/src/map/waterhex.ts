// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Flooding in hexagons (chapter 2). The pipeline publishes, per date, a PNG of water classes (blue open
// water, green flooded vegetation, transparent elsewhere). Every coloured pixel is counted into the
// hexagon that contains its centre, with its true area (it shrinks with cos(latitude)), so each hexagon
// gets hectares of open water and of flooded vegetation per date. Summed over the hexagons, the totals
// equal water.json exactly (checked: all 10 dates of Ñeembucú).

import { type Dataset, stepEnd } from "../data";
import type { GeoJSON, HexGrid } from "./hexgrid";

export interface WaterCells {
  /** Water dates (the zone's scenes). */
  dates: string[];
  /** Per hexagon id: hectares at each water date. */
  open: Map<number, Float64Array>;
  flooded: Map<number, Float64Array>;
}

async function pixels(url: string): Promise<ImageData | null> {
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height);
  } catch {
    return null;
  }
}

/** Hectares of water per hexagon and date, for each grid (same order as `grids`). */
export async function aggregateWater(ds: Dataset, grids: HexGrid[]): Promise<WaterCells[]> {
  const scenes = ds.index.scenes;
  const n = scenes.length;
  const out: WaterCells[] = grids.map(() => ({ dates: scenes.map((s) => s.date), open: new Map(), flooded: new Map() }));
  const [[x0, y1], [x1], [, y0]] = ds.index.image_coordinates; // TL, TR, BR
  let lookup: Int32Array[] = [];
  let size = "";
  for (let j = 0; j < n; j++) {
    const url = ds.waterUrl(j);
    const im = url ? await pixels(url) : null;
    if (!im) continue;
    const { width: W, height: H, data: d } = im;
    // hexagon of each pixel, computed once and reused by every date (same grid for all PNGs)
    if (size !== `${W}x${H}`) {
      size = `${W}x${H}`;
      lookup = grids.map(() => new Int32Array(W * H).fill(-2));
    }
    const dx = (x1 - x0) / W;
    const dy = (y1 - y0) / H;
    for (let py = 0; py < H; py++) {
      const lat = y1 - (py + 0.5) * dy;
      const ha = (dx * 111_320 * Math.cos((lat * Math.PI) / 180) * dy * 110_574) / 1e4;
      for (let px = 0; px < W; px++) {
        const p = py * W + px;
        if (d[p * 4 + 3] === 0) continue;
        const open = d[p * 4 + 2]! >= d[p * 4 + 1]!; // blue = open water, green = flooded vegetation
        for (let g = 0; g < grids.length; g++) {
          const lk = lookup[g]!;
          let id = lk[p]!;
          if (id === -2) {
            id = grids[g]!.locate(x0 + (px + 0.5) * dx, lat)?.id ?? -1;
            lk[p] = id;
          }
          if (id < 0) continue;
          const m = open ? out[g]!.open : out[g]!.flooded;
          let arr = m.get(id);
          if (!arr) {
            arr = new Float64Array(n);
            m.set(id, arr);
          }
          arr[j]! += ha;
        }
      }
    }
    await new Promise((r) => setTimeout(r, 0)); // keep the page responsive between dates
  }
  return out;
}

/** Water date shown at each timeline step (-1 before the zone's first pass): the same rule as the map images. */
export function waterSteps(w: WaterCells, timelineDates: string[]): number[] {
  return timelineDates.map((iso) => {
    const end = stepEnd(iso);
    let k = -1;
    w.dates.forEach((d, i) => {
      if (d <= end) k = i;
    });
    return k;
  });
}

/** Open water + flooded vegetation of one hexagon at water date k. */
export function waterHa(w: WaterCells, id: number, k: number): { open: number; flooded: number } {
  if (k < 0) return { open: 0, flooded: 0 };
  return { open: w.open.get(id)?.[k] ?? 0, flooded: w.flooded.get(id)?.[k] ?? 0 };
}

/** Hexagons with water, with w{t} = hectares under water at timeline step t (for the map's fill colour). */
export function waterGeoJSON(w: WaterCells, grid: HexGrid, steps: number[]): GeoJSON {
  const ids = new Set([...w.open.keys(), ...w.flooded.keys()]);
  const features: unknown[] = [];
  for (const id of ids) {
    const cell = grid.cells[id];
    if (!cell) continue;
    const props: Record<string, number> = { id };
    steps.forEach((k, t) => {
      const { open, flooded } = waterHa(w, id, k);
      props[`w${t}`] = Math.round((open + flooded) * 10) / 10;
    });
    features.push({ type: "Feature", id, properties: props, geometry: { type: "Polygon", coordinates: [cell.ring] } });
  }
  return { type: "FeatureCollection", features };
}

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Writes SYNTHETIC development data to web/fixtures/data/, following docs/DATA_CONTRACT.md.
// It exists only so the web app can be built and tested before the pipeline exports real
// NISAR results. Nothing here is a measurement: the landscape, the clearings, the rain and
// the validation numbers are invented. The dev server serves these files under /fixtures/
// and the app shows a "synthetic data" banner while it uses them. They never enter the build.
//
// The contract asks for WebP RGB images (pipeline output). These fixtures stay PNG because Node has
// no built-in WebP encoder; the web app reads each scene path from index.json, so both work.
//
// Usage: node scripts/make-fixtures.mjs

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "data");
mkdirSync(join(OUT, "rgb"), { recursive: true });

// ---------------------------------------------------------------- setup
const BBOX = [-61.0, -21.95, -60.4, -21.55]; // chaco-central-norte (CLAUDE.md §8.2)
const W = 960;
const H = 640;
const DATES = [
  "2026-06-01", "2026-06-13", "2026-06-25", "2026-07-07", "2026-07-19", "2026-08-24",
  "2026-09-05", "2026-09-17", "2026-09-29", "2026-10-11", "2026-10-23",
];
const T = DATES.length;

function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261114);
const gauss = () => {
  const u = Math.max(rnd(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
};
const ri = (a, b) => Math.floor(a + rnd() * (b - a + 1));

const lonOf = (x) => BBOX[0] + ((x + 0.5) / W) * (BBOX[2] - BBOX[0]);
const latOf = (y) => BBOX[3] - ((y + 0.5) / H) * (BBOX[3] - BBOX[1]);
const PX_M = ((BBOX[2] - BBOX[0]) / W) * 111320 * Math.cos((-21.75 * Math.PI) / 180);
const PY_M = ((BBOX[3] - BBOX[1]) / H) * 110574;

// Smooth value noise for natural canopy texture.
function valueNoise(cell) {
  const gw = Math.ceil(W / cell) + 2;
  const gh = Math.ceil(H / cell) + 2;
  const g = Float32Array.from({ length: gw * gh }, () => rnd() * 2 - 1);
  const out = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const fx = x / cell;
      const fy = y / cell;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = g[y0 * gw + x0];
      const b = g[y0 * gw + x0 + 1];
      const c = g[(y0 + 1) * gw + x0];
      const d = g[(y0 + 1) * gw + x0 + 1];
      out[y * W + x] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}
const texture = valueNoise(40).map((v, i) => v * 0.7);
const texture2 = valueNoise(9);

// ---------------------------------------------------------------- land cover
// clearIdx: -1 = forest all season, 0 = cleared before June (pasture), k = cleared at scene k.
const clearIdx = new Int8Array(W * H).fill(-1);
const road = new Uint8Array(W * H);
const water = new Uint8Array(W * H);

// Paddock blocks split by forest windbreak strips (typical of the central Chaco).
function paint(x0, y0, w, h, value, strip = 2, nx = 2, ny = 2) {
  const cw = w / nx;
  const ch = h / ny;
  for (let y = Math.max(0, y0); y < Math.min(H, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(W, x0 + w); x++) {
      const lx = (x - x0) % cw;
      const ly = (y - y0) % ch;
      if (lx < strip || ly < strip) continue; // windbreak
      const i = y * W + x;
      if (clearIdx[i] === -1) clearIdx[i] = value;
    }
  }
}

// Older ranches, concentrated south and east; the north-west keeps a large forest block.
const ranches = [];
for (let k = 0; k < 16; k++) {
  const w = ri(70, 190);
  const h = ri(60, 150);
  const x0 = ri(Math.floor(W * 0.28), W - 60);
  const y0 = ri(Math.floor(H * 0.25), H - 40);
  ranches.push({ x0, y0, w, h });
  paint(x0, y0, w, h, 0, 2, ri(2, 5), ri(2, 4));
}

// New clearings in this season, mostly at the edge of existing ranches (frontier expansion).
const clearings = [];
let guard = 0;
while (clearings.length < 28 && guard++ < 5000) {
  const r = ranches[ri(0, ranches.length - 1)];
  const side = ri(0, 3);
  const w = ri(14, 70);
  const h = ri(12, 55);
  let x0;
  let y0;
  if (side === 0) { x0 = r.x0 - w - 2; y0 = r.y0 + ri(0, Math.max(1, r.h - h)); }
  else if (side === 1) { x0 = r.x0 + r.w + 2; y0 = r.y0 + ri(0, Math.max(1, r.h - h)); }
  else if (side === 2) { x0 = r.x0 + ri(0, Math.max(1, r.w - w)); y0 = r.y0 - h - 2; }
  else { x0 = r.x0 + ri(0, Math.max(1, r.w - w)); y0 = r.y0 + r.h + 2; }
  if (x0 < 4 || y0 < 4 || x0 + w > W - 4 || y0 + h > H - 4) continue;
  let forest = 0;
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (clearIdx[y * W + x] === -1) forest++;
  if (forest < w * h * 0.9) continue;
  const overlaps = clearings.some((c) => x0 < c.x0 + c.w + 3 && x0 + w + 3 > c.x0 && y0 < c.y0 + c.h + 3 && y0 + h + 3 > c.y0);
  if (overlaps) continue;
  const event = [3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9][ri(0, 12)];
  clearings.push({ x0, y0, w, h, event });
  paint(x0, y0, w, h, event, 2, w > 40 ? 2 : 1, h > 34 ? 2 : 1);
}

// Two straight ranch roads and a small seasonal lagoon.
for (let x = 0; x < W; x++) for (let d = 0; d < 2; d++) road[(Math.floor(H * 0.62) + d) * W + x] = 1;
for (let y = 0; y < H; y++) for (let d = 0; d < 2; d++) road[y * W + Math.floor(W * 0.55) + d] = 1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W * 0.17) / 22;
    const dy = (y - H * 0.78) / 13;
    if (dx * dx + dy * dy < 1 + texture2[y * W + x] * 0.25) water[y * W + x] = 1;
  }
}

// ---------------------------------------------------------------- rain (synthetic)
const rainDates = [];
const rainMm = [];
for (let d = new Date("2026-05-15T00:00:00Z"); d <= new Date("2026-10-31T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
  const iso = d.toISOString().slice(0, 10);
  const month = d.getUTCMonth() + 1;
  const p = { 5: 0.12, 6: 0.06, 7: 0.05, 8: 0.06, 9: 0.12, 10: 0.24 }[month];
  const mm = rnd() < p ? Math.round((3 + rnd() * rnd() * 45) * 10) / 10 : 0;
  rainDates.push(iso);
  rainMm.push(mm);
}
// Soil moisture proxy per scene: rain in the 6 days before the acquisition, saturating.
const wet = DATES.map((iso) => {
  const i = rainDates.indexOf(iso);
  let s = 0;
  for (let k = Math.max(0, i - 6); k <= i; k++) s += rainMm[k] * (1 - (i - k) / 8);
  return Math.min(1, s / 30);
});

// ---------------------------------------------------------------- backscatter model (dB)
function sigma(i, t) {
  const tex = texture[i] + 0.35 * texture2[i];
  if (water[i]) return [-22 + gauss() * 1.2, -28.5 + gauss() * 1.2];
  if (road[i]) return [-14 + gauss() * 0.9, -22 + gauss() * 0.9];
  const c = clearIdx[i];
  const m = wet[t];
  if (c === -1 || (c > 0 && t < c)) {
    return [-7.4 + tex * 0.8 + m * 0.6 + gauss() * 0.9, -12.4 + tex * 0.9 + m * 0.3 + gauss() * 0.9];
  }
  if (c > 0 && t - c < 2) {
    // fresh clearing: felled trunks in windrows keep HH high, canopy volume (HV) is gone
    return [-6.6 + tex * 0.5 + gauss() * 1.3, -16.4 + tex * 0.5 + gauss() * 1.1];
  }
  return [-11.4 + tex * 0.6 + m * 2.6 + gauss() * 1.0, -19.2 + tex * 0.6 + m * 1.0 + gauss() * 1.0];
}

const hh = Array.from({ length: T }, () => new Float32Array(W * H));
const hv = Array.from({ length: T }, () => new Float32Array(W * H));
for (let t = 0; t < T; t++) {
  for (let i = 0; i < W * H; i++) {
    const [a, b] = sigma(i, t);
    hh[t][i] = a;
    hv[t][i] = b;
  }
}

// ---------------------------------------------------------------- PNG export
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const clip01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
// Fixed stretch for every date (CLAUDE.md §9 step 9), R = HH, G = HV, B = HH/HV.
for (let t = 0; t < T; t++) {
  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    // light 3x3 smoothing in linear power, like the multilook in the pipeline
    const x = i % W;
    const y = (i - x) / W;
    let sh = 0;
    let sv = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        sh += 10 ** (hh[t][j] / 10);
        sv += 10 ** (hv[t][j] / 10);
        n++;
      }
    }
    const a = 10 * Math.log10(sh / n);
    const b = 10 * Math.log10(sv / n);
    buf[i * 3] = Math.round(255 * clip01((a + 17) / 17) ** 1.25);
    buf[i * 3 + 1] = Math.round(255 * clip01((b + 26) / 18) ** 1.25);
    buf[i * 3 + 2] = Math.round(255 * clip01((a - b - 1) / 10) ** 1.1);
  }
  writeFileSync(join(OUT, "rgb", `${DATES[t]}.png`), png(W, H, buf));
}

// ---------------------------------------------------------------- 500 m grid
const ORIGIN = [BBOX[0], BBOX[3]];
const CELL = [0.0048, -0.0045];
const NX = 125;
const NY = 89;
const grid = { hv: [], hh: [] };
for (let t = 0; t < T; t++) {
  const sh = new Float64Array(NX * NY);
  const sv = new Float64Array(NX * NY);
  const n = new Uint32Array(NX * NY);
  for (let y = 0; y < H; y++) {
    const row = Math.floor((latOf(y) - ORIGIN[1]) / CELL[1]);
    for (let x = 0; x < W; x++) {
      const col = Math.floor((lonOf(x) - ORIGIN[0]) / CELL[0]);
      if (row < 0 || row >= NY || col < 0 || col >= NX) continue;
      const i = y * W + x;
      if (water[i]) continue; // outside the forest mask
      const k = row * NX + col;
      sh[k] += 10 ** (hh[t][i] / 10);
      sv[k] += 10 ** (hv[t][i] / 10);
      n[k]++;
    }
  }
  grid.hh.push(Array.from(n, (c, k) => (c ? Math.round(100 * Math.log10(sh[k] / c)) : null)));
  grid.hv.push(Array.from(n, (c, k) => (c ? Math.round(100 * Math.log10(sv[k] / c)) : null)));
}
writeFileSync(
  join(OUT, "grid_500m.json"),
  JSON.stringify({ dates: DATES, origin: ORIGIN, cell_deg: CELL, nx: NX, ny: NY, hv_db_x10: grid.hv, hh_db_x10: grid.hh }),
);

// ---------------------------------------------------------------- polygons
const features = clearings
  .map((c, k) => {
    const lon0 = BBOX[0] + (c.x0 / W) * (BBOX[2] - BBOX[0]);
    const lon1 = BBOX[0] + ((c.x0 + c.w) / W) * (BBOX[2] - BBOX[0]);
    const lat0 = BBOX[3] - (c.y0 / H) * (BBOX[3] - BBOX[1]);
    const lat1 = BBOX[3] - ((c.y0 + c.h) / H) * (BBOX[3] - BBOX[1]);
    const area = (c.w * PX_M * c.h * PY_M) / 1e4;
    const r = rnd();
    return {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[lon0, lat0], [lon1, lat0], [lon1, lat1], [lon0, lat1], [lon0, lat0]].map(([a, b]) => [
          Math.round(a * 1e5) / 1e5,
          Math.round(b * 1e5) / 1e5,
        ])],
      },
      properties: {
        id: `syn-${String(k + 1).padStart(3, "0")}`,
        first_date: DATES[c.event],
        area_ha: Math.round(area * 10) / 10,
        mean_drop_db: Math.round((-5.2 - rnd() * 2.4) * 10) / 10,
        dist_confirmed: r < 0.74 ? true : r < 0.9 ? false : null,
        status: "estimado",
      },
    };
  })
  .filter((f) => f.properties.area_ha >= 5)
  .sort((a, b) => a.properties.first_date.localeCompare(b.properties.first_date));
writeFileSync(join(OUT, "polygons.geojson"), JSON.stringify({ type: "FeatureCollection", features }));

// ---------------------------------------------------------------- rain + index
writeFileSync(
  join(OUT, "rain.json"),
  JSON.stringify({ dates: rainDates, mm: rainMm, source: "NASA POWER PRECTOTCORR", point: [-60.7, -21.75] }),
);

const maturity = (d) => (d === "2026-10-23" ? ["VALIDATED", "P05036"] : ["PROVISIONAL", "P05023"]);
const index = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  aoi: { id: "chaco-central-norte", bbox: BBOX },
  nisar: { track: 161, direction: "ASCENDING", frame: 167, mode: "20+5 DHDH" },
  scenes: DATES.map((d, k) => ({
    date: d,
    id: `SYNTHETIC_FIXTURE_${String(21 + k).padStart(3, "0")}_NOT_NISAR_DATA`,
    maturity: maturity(d)[0],
    crid: maturity(d)[1],
    rgb: `rgb/${d}.png`,
  })),
  image_coordinates: [[BBOX[0], BBOX[3]], [BBOX[2], BBOX[3]], [BBOX[2], BBOX[1]], [BBOX[0], BBOX[1]]],
  detection: {
    threshold_db: -3.0,
    persistence: 2,
    min_area_ha: 5,
    n_polygons: features.length,
    area_ha_total: Math.round(features.reduce((s, f) => s + f.properties.area_ha, 0)),
  },
  validation: { agreement_pct: 81, coverage_pct: 67, reference: "OPERA DIST-ALERT-HLS V1" },
  provenance: [
    { layer: "rgb", type: "satellite", source: "SYNTHETIC FIXTURE (stand-in for NISAR L2 GCOV)" },
    { layer: "polygons", type: "satellite", source: "SYNTHETIC FIXTURE (stand-in for CLEAR ΔHV detection)" },
    { layer: "validation", type: "satellite", source: "SYNTHETIC FIXTURE (stand-in for OPERA DIST-ALERT-HLS V1)" },
    { layer: "rain", type: "modeled", source: "SYNTHETIC FIXTURE (stand-in for NASA POWER PRECTOTCORR)" },
  ],
};
writeFileSync(join(OUT, "index.json"), JSON.stringify(index, null, 2));
console.log(`fixtures: ${T} scenes, ${features.length} polygons -> ${OUT}`);

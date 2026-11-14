// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST (lab) build packaging, run after `vite build --mode lab --outDir dist-lab`:
//  1. Downloads the EOX Sentinel-2 cloudless 2024 tiles that cover the study area (+ margin) for
//     zooms 9-13 into .lab-cache/ (once) and copies them to dist-lab/tiles/{z}/{x}/{y}.jpg.
//     A claude.ai artifact cannot load map tiles from the internet, so they ship with the page.
//     License: CC BY-NC-SA 4.0 (non-commercial, attribution shown on the map).
//  2. Writes dist-lab/lab-page.html: the built index.html as a page fragment (the Artifact publish
//     step adds its own <html>/<head>/<body> skeleton).
//  3. Writes dist-lab/files.json: every other file to publish, with its content type.
//
//  5. Adds daily rainfall from NASA POWER (data/rain.json, contract format) for the chart and the assistant.
//  4. Uses index.json from a teammate branch (LAB_DATA_REF, default origin/a/validation-metric) when it exists.
//
// Usage: node scripts/lab-package.mjs [dist-lab]

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(WEB, process.argv[2] ?? "dist-lab");
const CACHE = join(WEB, ".lab-cache", "tiles");
const MARGIN = 0.08; // must match LAB_TILE_MARGIN_DEG in src/lab/index.ts
const ZOOMS = [9, 10, 11, 12, 13]; // max must match LAB_TILE_MAXZOOM
const TILE_URL = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg";

const index = JSON.parse(readFileSync(join(WEB, "public", "data", "index.json"), "utf8"));
const [x0, y0, x1, y1] = index.aoi.bbox;
const bounds = [x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN];

const tx = (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z);
const ty = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

const tiles = [];
for (const z of ZOOMS) {
  for (let x = tx(bounds[0], z); x <= tx(bounds[2], z); x++) {
    for (let y = ty(bounds[3], z); y <= ty(bounds[1], z); y++) tiles.push([z, x, y]);
  }
}
console.log(`tiles: ${tiles.length} (zooms ${ZOOMS.join(", ")})`);

let fetched = 0;
for (const [z, x, y] of tiles) {
  const cached = join(CACHE, String(z), String(x), `${y}.jpg`);
  if (!existsSync(cached)) {
    const url = TILE_URL.replace("{z}", z).replace("{y}", y).replace("{x}", x);
    const res = await fetch(url, { headers: { "User-Agent": "clear-lab-build" } });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    mkdirSync(dirname(cached), { recursive: true });
    writeFileSync(cached, Buffer.from(await res.arrayBuffer()));
    fetched++;
    await new Promise((r) => setTimeout(r, 40)); // be gentle with the tile server
  }
  const out = join(DIST, "tiles", String(z), String(x), `${y}.jpg`);
  mkdirSync(dirname(out), { recursive: true });
  copyFileSync(cached, out);
}
console.log(`downloaded ${fetched} new tiles, ${tiles.length - fetched} from cache`);

// newer data from a teammate's branch (test build only): index.json of LAB_DATA_REF, when it exists
const ref = process.env.LAB_DATA_REF ?? "origin/a/validation-metric";
try {
  const json = execFileSync("git", ["show", `${ref}:web/public/data/index.json`], { cwd: WEB });
  const v = JSON.parse(json.toString());
  writeFileSync(join(DIST, "data", "index.json"), json);
  console.log(`data: index.json from ${ref} (schema ${v.schema_version}, validation ${JSON.stringify(v.validation)})`);
} catch {
  console.log(`data: ${ref} not found, keeping the local index.json`);
}

// daily rainfall at the study-area centre (NASA POWER, free API, no key): data/rain.json as in the contract
try {
  const cx = Math.round(((x0 + x1) / 2) * 100) / 100;
  const cy = Math.round(((y0 + y1) / 2) * 100) / 100;
  const first = index.scenes?.[0]?.date ?? "2025-11-01";
  const last = index.scenes?.[index.scenes.length - 1]?.date ?? "2026-10-31";
  const start = `${first.slice(0, 7)}-01`.replaceAll("-", "");
  const end = last.replaceAll("-", "");
  const cache = join(WEB, ".lab-cache", `power-${cx}-${cy}-${start}-${end}.json`);
  if (!existsSync(cache)) {
    const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG&longitude=${cx}&latitude=${cy}&start=${start}&end=${end}&format=JSON`;
    const res = await fetch(url, { headers: { "User-Agent": "clear-lab-build" } });
    if (!res.ok) throw new Error(`POWER ${res.status}`);
    mkdirSync(dirname(cache), { recursive: true });
    writeFileSync(cache, await res.text());
  }
  const power = JSON.parse(readFileSync(cache, "utf8"));
  const series = power.properties.parameter.PRECTOTCORR;
  const keys = Object.keys(series).sort();
  const rain = {
    dates: keys.map((k) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`),
    mm: keys.map((k) => (series[k] < 0 ? 0 : Math.round(series[k] * 10) / 10)),
    source: "NASA POWER PRECTOTCORR",
    point: [cx, cy],
  };
  writeFileSync(join(DIST, "data", "rain.json"), JSON.stringify(rain));
  const idxPath = join(DIST, "data", "index.json");
  const idx = JSON.parse(readFileSync(idxPath, "utf8"));
  if (!idx.provenance.some((p) => p.layer === "rain")) {
    idx.provenance.push({ layer: "rain", type: "modeled", source: "NASA POWER PRECTOTCORR (daily, MERRA-2/IMERG based)" });
    writeFileSync(idxPath, JSON.stringify(idx, null, 2));
  }
  console.log(`rain: ${rain.dates.length} days from NASA POWER at ${cx}, ${cy}`);
} catch (e) {
  console.log(`rain: not added (${e.message})`);
}

// page fragment: <title>, stylesheet/module links and the body content
const html = readFileSync(join(DIST, "index.html"), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";
const body = html.match(/<body>([\s\S]*?)<\/body>/)?.[1] ?? "";
const keep = head
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /^<(title|link|script|meta name="(description|theme-color)")/.test(l) && !/rel="icon"/.test(l));
// IBM Plex Sans (test theme typeface); the test theme (lab/boot CSS) render-blocking, so no flash
const fonts = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">';
const bootCss = readdirSync(join(DIST, "assets")).filter((f) => /^boot-.*\.css$/.test(f));
const early = ['<script>document.documentElement.classList.add("lab")</script>', ...bootCss.map((f) => `<link rel="stylesheet" href="./assets/${f}">`)];
const page = [...early, ...keep, fonts, body.trim()].join("\n").replace(/<title>[^<]*<\/title>/, "<title>CLEAR Lab</title>");
writeFileSync(join(DIST, "lab-page.html"), page + "\n");

// everything else to publish, with explicit content types
const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".geojson": "application/json",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const files = walk(DIST)
  .map((f) => relative(DIST, f))
  .filter((f) => !["index.html", "lab-page.html", "files.json", ".htaccess"].includes(f) && !f.endsWith(".gitkeep") && TYPES[extname(f)]);
const manifest = Object.fromEntries(files.map((f) => [f, { from: f, contentType: TYPES[extname(f)] }]));
writeFileSync(join(DIST, "files.json"), JSON.stringify(manifest, null, 1));
const tileFiles = files.filter((f) => f.startsWith("tiles/")).length;
console.log(`publish: lab-page.html + ${files.length} files (${tileFiles} tiles, ${files.length - tileFiles} app/data)`);

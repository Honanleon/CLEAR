// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Bundle budget (CLAUDE.md §11): JS + CSS in dist/assets must stay under 500 KB gzip.
// Data files and map tiles are not counted. Run after `vite build`.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const LIMIT = 500 * 1024;
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "..", "dist", "assets");
let total = 0;
const rows = [];
for (const f of readdirSync(ASSETS)) {
  if (!/\.(m?js|css)$/.test(f)) continue;
  const gz = gzipSync(readFileSync(join(ASSETS, f)), { level: 9 }).length;
  total += gz;
  rows.push([f, gz]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [f, gz] of rows) console.log(`${(gz / 1024).toFixed(1).padStart(8)} KB  ${f}`);
console.log(`${(total / 1024).toFixed(1).padStart(8)} KB  total gzip (limit ${LIMIT / 1024} KB)`);
if (total > LIMIT) {
  console.error("bundle over budget");
  process.exit(1);
}

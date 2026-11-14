// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// i18n lint: es.json and en.json must have the same keys, and every key used in index.html
// (data-i18n*) or in src/ (t("...") / tList("...")) must exist. Exits 1 on any problem.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const es = JSON.parse(readFileSync(join(ROOT, "src/i18n/es.json"), "utf8"));
const en = JSON.parse(readFileSync(join(ROOT, "src/i18n/en.json"), "utf8"));

const flatten = (o, p = "") =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v) ? flatten(v, `${p}${k}.`) : [`${p}${k}`],
  );
const esKeys = new Set(flatten(es));
const enKeys = new Set(flatten(en));
const problems = [];
for (const k of esKeys) if (!enKeys.has(k)) problems.push(`missing in en.json: ${k}`);
for (const k of enKeys) if (!esKeys.has(k)) problems.push(`missing in es.json: ${k}`);

const used = new Set();
const html = readFileSync(join(ROOT, "index.html"), "utf8");
for (const m of html.matchAll(/data-i18n(?:-list)?="([^"]+)"/g)) used.add(m[1]);
for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of m[1].split(";")) used.add(pair.split(":")[1].trim());

const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
for (const file of walk(join(ROOT, "src"))) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt(?:List)?\(\s*"([a-z_]+\.[A-Za-z_.]+)"/g)) used.add(m[1]);
}
for (const k of used) if (!esKeys.has(k)) problems.push(`used but not defined: ${k}`);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`i18n ok: ${esKeys.size} keys in es/en, ${used.size} static references checked`);

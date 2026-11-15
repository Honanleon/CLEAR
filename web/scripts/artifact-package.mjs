// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST SITE artifact build packaging, run after `vite build --mode artifact --outDir dist-artifact`:
// writes <dist>/artifact-page.html (the built index.html as a page fragment: the Artifact publish step adds its
// own <html>/<head>/<body>) and <dist>/files.json (every other file to publish, with its content type).
// Publish the page with those files and the `sample` capability (the CLEAR assistant needs it).
//
// Usage: node scripts/artifact-package.mjs [dist-artifact]

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(WEB, process.argv[2] ?? "dist-artifact");
const html = readFileSync(join(DIST, "index.html"), "utf8");
const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? "";
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)?.[1] ?? "";
const keep = head
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => /^<(title|link|script|meta name="(description|theme-color)")/.test(l) && !/rel="icon"/.test(l));
const page = [...keep, body.trim()].join("\n").replace(/<title>[^<]*<\/title>/, "<title>CLEAR Prueba</title>");
writeFileSync(join(DIST, "artifact-page.html"), page + "\n");

const TYPES = {
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".geojson": "application/json",
  ".webp": "image/webp",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const files = [];
const walk = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else {
      const rel = relative(DIST, p);
      if (["index.html", "artifact-page.html", "files.json", ".htaccess"].includes(rel) || rel.endsWith(".gitkeep")) continue;
      const contentType = TYPES[extname(p)];
      if (contentType) files.push({ path: rel, contentType });
    }
  }
};
walk(DIST);
writeFileSync(join(DIST, "files.json"), JSON.stringify(files));
console.log(`artifact: ${files.length} files, page ${page.length} bytes`);

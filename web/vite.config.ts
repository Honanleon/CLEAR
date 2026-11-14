// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
import { createReadStream, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const FIXTURES = resolve(ROOT, "fixtures");
const MIME: Record<string, string> = {
  ".json": "application/json",
  ".geojson": "application/geo+json",
  ".png": "image/png",
};

// Dev server only: serves the synthetic data in web/fixtures/ under /fixtures/.
// It is never part of the production build (see scripts/make-fixtures.mjs).
function fixtures(): Plugin {
  return {
    name: "clear-fixtures",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/fixtures", (req, res, next) => {
        const rel = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
        const file = resolve(FIXTURES, `.${rel}`);
        if (!file.startsWith(FIXTURES + sep)) return next();
        try {
          if (!statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        res.setHeader("Content-Type", MIME[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  // Relative base: works at the domain root and on the GitHub Pages mirror (/CLEAR/).
  base: "./",
  plugins: [fixtures()],
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1200,
  },
});

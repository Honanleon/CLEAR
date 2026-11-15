// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// "Can we trust the radar?": the two validation numbers as animated rings, the
// "X of N cases" sentence and three close-ups (radar before / after) cropped from the scene PNGs.

import { type Dataset, daysBetween, featureBBox, type PolygonCollection, type PolygonFeature, REPEAT_DAYS } from "../data";
import { fmt, onLang, t } from "../i18n";
import type { FocusDetail } from "../map";

function ring(pct: number | null, label: string, desc: string, cls: string): string {
  const r = 52;
  const c = 2 * Math.PI * r;
  const off = pct === null ? c : c * (1 - pct / 100);
  return `<div class="gauge ${cls}">
    <svg viewBox="0 0 128 128" aria-hidden="true">
      <circle class="gauge-track" cx="64" cy="64" r="${r}" />
      <circle class="gauge-arc" cx="64" cy="64" r="${r}" stroke-dasharray="${c.toFixed(1)}" style="--off:${off.toFixed(1)};--len:${c.toFixed(1)}" />
    </svg>
    <div class="gauge-num"><b data-target="${pct ?? ""}">${pct === null ? t("common.pending") : "0"}</b>${pct === null ? "" : "<small>%</small>"}</div>
    <h4>${label}</h4>
    <p>${desc}</p>
  </div>`;
}

function countUp(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".gauge-num b[data-target]").forEach((b) => {
    const target = Number(b.dataset.target);
    if (!b.dataset.target || Number.isNaN(target)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      b.textContent = fmt.num(target, Number.isInteger(target) ? 0 : 1);
      return;
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const f = Math.min(1, Math.max(0, (now - t0) / 1400));
      b.textContent = fmt.num(target * (1 - (1 - f) ** 3), Number.isInteger(target) ? 0 : 1);
      if (f < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

/** Three cases: the largest confirmed, the largest not confirmed (honesty) and another confirmed. */
function pickCases(fc: PolygonCollection): PolygonFeature[] {
  const bySize = [...fc.features].sort((a, b) => b.properties.area_ha - a.properties.area_ha);
  const yes = bySize.filter((f) => f.properties.dist_confirmed === true);
  const no = bySize.filter((f) => f.properties.dist_confirmed !== true);
  const out: PolygonFeature[] = [];
  if (yes[0]) out.push(yes[0]);
  if (no[0]) out.push(no[0]);
  for (const f of [...yes.slice(1), ...bySize]) {
    if (out.length >= 3) break;
    if (!out.includes(f)) out.push(f);
  }
  return out;
}

const images = new Map<string, Promise<HTMLImageElement>>();
function loadImage(url: string): Promise<HTMLImageElement> {
  let p = images.get(url);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    images.set(url, p);
  }
  return p;
}

async function drawCrop(canvas: HTMLCanvasElement, ds: Dataset, scene: number, f: PolygonFeature) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = await loadImage(ds.sceneUrl(scene));
  const [[ix0, iy1], [ix1], [, iy0]] = ds.index.image_coordinates; // TL, TR, BR
  const lon = (x: number) => ((x - ix0) / (ix1 - ix0)) * img.naturalWidth;
  const lat = (y: number) => ((iy1 - y) / (iy1 - iy0)) * img.naturalHeight;
  const [x0, y0, x1, y1] = featureBBox(f.geometry);
  const cx = (lon(x0) + lon(x1)) / 2;
  const cy = (lat(y0) + lat(y1)) / 2;
  const side = Math.max(lon(x1) - lon(x0), lat(y0) - lat(y1)) * 2.4 + 8;
  const sx = cx - side / 2;
  const sy = cy - side / 2;
  const S = canvas.width;
  ctx.imageSmoothingEnabled = side < S;
  ctx.fillStyle = "#05090c";
  ctx.fillRect(0, 0, S, S);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, S, S);
  // polygon outline
  const rings = f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
  ctx.strokeStyle = "rgba(255,255,255,.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  for (const ringCoords of rings) {
    ctx.beginPath();
    ringCoords.forEach(([x, y], k) => {
      const px = ((lon(x) - sx) / side) * S;
      const py = ((lat(y) - sy) / side) * S;
      if (k) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
  }
}

export function initValidation(ds: Dataset | null): void {
  const gauges = document.getElementById("gauges");
  const sentence = document.getElementById("cases-sentence");
  const casesEl = document.getElementById("cases");
  if (!gauges || !sentence || !casesEl) return;
  let fc: PolygonCollection | null = null;
  let counted = false;

  function render() {
    const v = ds?.index.validation;
    const pending = !v || (v.agreement_pct === null && v.coverage_pct === null);
    // schema v2: spatial (any-date) headline numbers plus the ±24-day ones. median_lead_days is not shown:
    // the team found the "radar sees it earlier" reading does not hold (CLAUDE.md §9, 14/11).
    const v2 = v?.agreement_pct_24d !== undefined;
    gauges!.innerHTML = pending
      ? `<div class="pending"><b>${t("trust.pending")}</b><p>${t("trust.pending_desc")}</p></div>`
      : ring(v.agreement_pct, t("trust.agreement"), t(v2 ? "trust.agreement_desc_any" : "trust.agreement_desc"), "gauge-a") +
        ring(v.coverage_pct, t("trust.coverage"), t(v2 ? "trust.coverage_desc_any" : "trust.coverage_desc"), "gauge-b") +
        (v2 && v.agreement_pct_24d != null && v.coverage_pct_24d != null
          ? `<p class="gauge-ref">${t("trust.window24", { a: fmt.num(v.agreement_pct_24d, 1), c: fmt.num(v.coverage_pct_24d, 1) })}</p>`
          : "") +
        `<p class="gauge-ref">${t("trust.reference", { ref: v.reference })}${ds?.provenance("validation") ? ` · ${ds.provenance("validation")!.source}` : ""}</p>`;
    gauges!.classList.remove("is-in");
    if (counted) {
      // two frames so the ring transition starts from the empty state
      requestAnimationFrame(() => requestAnimationFrame(() => gauges!.classList.add("is-in")));
      countUp(gauges!);
    }

    const checked = fc?.features.filter((f) => f.properties.dist_confirmed !== null) ?? [];
    const x = checked.filter((f) => f.properties.dist_confirmed === true).length;
    const nx = v?.polygons_confirmed ?? x;
    const nn = v?.polygons_total ?? checked.length;
    sentence!.textContent = nn ? t("trust.cases_sentence", { x: fmt.num(nx), n: fmt.num(nn) }) : "";
    renderCases();
  }

  function renderCases() {
    casesEl!.innerHTML = "";
    if (!ds || !fc) return;
    const last = ds.index.scenes.length - 1;
    for (const f of pickCases(fc)) {
      const p = f.properties;
      const tIdx = p.t ?? 0;
      const b = Math.max(0, tIdx - 1);
      const a = Math.min(last, tIdx + 1);
      const card = document.createElement("article");
      card.className = "case reveal is-in";
      const dist = p.dist_confirmed;
      card.innerHTML = `
        <div class="case-imgs">
          <figure><canvas width="320" height="320"></canvas><figcaption></figcaption></figure>
          <figure><canvas width="320" height="320"></canvas><figcaption></figcaption></figure>
        </div>
        <div class="case-body">
          <p class="case-date"></p>
          <p class="case-meta"></p>
          <span class="dist dist-${dist === null ? "null" : dist}"></span>
          <button type="button" class="btn btn-ghost btn-sm"></button>
        </div>`;
      const caps = card.querySelectorAll("figcaption");
      caps[0]!.textContent = t("trust.case_before", { date: fmt.date(ds.index.scenes[b]?.date ?? "") });
      caps[1]!.textContent = t("trust.case_after", { date: fmt.date(ds.index.scenes[a]?.date ?? "") });
      card.querySelector(".case-date")!.textContent =
        p.prev_date && daysBetween(p.prev_date, p.first_date) > REPEAT_DAYS
          ? t("trust.case_date_between", { prev: fmt.date(p.prev_date), date: fmt.date(p.first_date, true) })
          : t("trust.case_date", { date: fmt.date(p.first_date, true) });
      card.querySelector(".case-meta")!.textContent = t("trust.case_meta", { ha: fmt.num(p.area_ha, 1), db: fmt.signed(p.mean_drop_db) });
      card.querySelector(".dist")!.textContent = t(`chart.dist_${dist === null ? "null" : dist}`);
      const btn = card.querySelector("button")!;
      btn.textContent = t("trust.show_on_map");
      btn.addEventListener("click", () => {
        document.getElementById("map")?.scrollIntoView({ behavior: "smooth" });
        window.dispatchEvent(new CustomEvent<FocusDetail>("clear:focus", { detail: { featureId: f.id as number } }));
      });
      const canvases = card.querySelectorAll("canvas");
      void drawCrop(canvases[0]!, ds, b, f).catch(() => undefined);
      void drawCrop(canvases[1]!, ds, a, f).catch(() => undefined);
      casesEl!.append(card);
    }
  }

  // Load polygons and images only when the chapter gets close.
  new IntersectionObserver(
    (entries, obs) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      counted = true;
      if (!ds) return render();
      ds.polygons()
        .then((p) => {
          fc = p;
        })
        .catch(() => undefined)
        .finally(render);
    },
    { rootMargin: "300px 0px" },
  ).observe(gauges);

  onLang(render);
  render();
}

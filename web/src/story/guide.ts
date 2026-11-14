// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// "How to read the map", right under the map: a summary of the study area (totals) and the
// date color scale of the clearing areas. The static explanations live in index.html + i18n.

import { type Dataset, HEX_GRADIENT, HEX_STOPS, type PolygonCollection } from "../data";
import { fmt, onLang, t } from "../i18n";
import { buildHexGrid } from "../map/hexgrid";
import { SOCCER_FIELD_HA } from "../map/zone";

export function initGuide(ds: Dataset | null): void {
  const stats = document.getElementById("guide-stats");
  const ramp = document.getElementById("guide-ramp");
  if (!stats || !ramp || !ds) {
    stats?.remove();
    return;
  }
  let fc: PolygonCollection | null = null;

  function render() {
    if (!fc || !ds) return;
    const feats = fc.features;
    const total = feats.reduce((s, f) => s + f.properties.area_ha, 0);
    const grid = buildHexGrid(ds.index.aoi.bbox, fc, ds.index.scenes.length);
    const hexWith = grid.data.features.length;
    const checked = feats.filter((f) => f.properties.dist_confirmed !== null);
    const yes = checked.filter((f) => f.properties.dist_confirmed === true).length;

    stats!.innerHTML = "";
    const card = (value: string, label: string, note?: string, cls = "") => {
      const d = document.createElement("div");
      d.className = `gstat ${cls}`;
      const b = document.createElement("b");
      b.textContent = value;
      const s = document.createElement("span");
      s.textContent = label;
      d.append(b, s);
      if (note) {
        const n = document.createElement("small");
        n.textContent = note;
        d.append(n);
      }
      return d;
    };
    const head = document.createElement("h4");
    head.textContent = t("guide.stats_title");
    stats!.append(
      head,
      card(fmt.num(total), t("guide.stat_total"), t("guide.fields_total", { n: fmt.num(total / SOCCER_FIELD_HA) }), "gstat-hot"),
      card(fmt.num(feats.length), t("guide.stat_zones")),
      card(`${fmt.num(hexWith)}/${fmt.num(grid.shownCount)}`, t("guide.stat_largest")),
      card(checked.length ? `${fmt.num(yes)}/${fmt.num(checked.length)}` : t("common.pending"), t("guide.stat_confirmed")),
    );

    // the colour scale used on the map (hectares cleared per hexagon)
    ramp!.innerHTML = "";
    const bar = document.createElement("div");
    bar.className = "guide-ramp-bar";
    bar.style.background = HEX_GRADIENT;
    const labels = document.createElement("div");
    labels.className = "guide-ramp-labels";
    HEX_STOPS.forEach(([v], i) => {
      const s = document.createElement("span");
      s.textContent = i === HEX_STOPS.length - 1 ? `${fmt.num(v)}+` : fmt.num(v);
      labels.append(s);
    });
    const unit = document.createElement("p");
    unit.className = "guide-ramp-unit";
    unit.textContent = t("guide.colors_scale");
    ramp!.append(bar, labels, unit);
  }

  new IntersectionObserver(
    (entries, obs) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      ds.polygons()
        .then((p) => {
          fc = p;
          render();
        })
        .catch(() => stats.remove());
    },
    { rootMargin: "400px 0px" },
  ).observe(stats);
  onLang(render);
}

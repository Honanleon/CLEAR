// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST build only. "Expert data" block of the hexagon panel: the same data object the AI receives,
// as tables (clearings, radar signal at the centre cell, scene, method, validation) plus a JSON copy.

import { fmt } from "../i18n";
import type { HexContext } from "./context";
import { lt } from "./strings";

function db(v: number | null | undefined): string {
  return v === null || v === undefined ? lt("none") : `${fmt.signed(v, 1)} dB`;
}

function pct(v: number | null | undefined): string {
  return v === null || v === undefined ? lt("none") : `${fmt.num(v, 1)} %`;
}

function table(rows: [string, string][]): HTMLTableElement {
  const t = document.createElement("table");
  t.className = "xp-kv";
  for (const [k, v] of rows) {
    const tr = t.insertRow();
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = k;
    tr.append(th);
    tr.insertCell().textContent = v;
  }
  return t;
}

function section(title: string, ...children: HTMLElement[]): HTMLElement {
  const s = document.createElement("div");
  s.className = "xp-sec";
  const h = document.createElement("h5");
  h.textContent = title;
  s.append(h, ...children);
  return s;
}

export function renderExpert(host: HTMLElement, ctx: HexContext): void {
  const box = document.createElement("section");
  box.className = "xp";
  const h = document.createElement("h4");
  h.textContent = lt("exp_title");
  box.append(h);

  const hx = ctx.hexagon;
  box.append(
    section(
      lt("exp_hex"),
      table([
        [lt("exp_hex_id"), `#${hx.id} · ${fmt.num(hx.area_ha)} ha`],
        [lt("exp_hex_center"), `${hx.center_lon_lat[0]}, ${hx.center_lon_lat[1]}`],
        [lt("exp_hex_cleared"), `${fmt.num(hx.cleared_ha_total, 1)} ha (${fmt.num(hx.cleared_pct_of_hexagon_total, 1)} %)`],
      ]),
    ),
  );

  if (ctx.clearings.length) {
    const wrap = document.createElement("div");
    wrap.className = "xp-scroll";
    const t = document.createElement("table");
    t.className = "xp-grid";
    const head = t.createTHead().insertRow();
    for (const k of ["exp_col_id", "exp_col_date", "exp_col_ha", "exp_col_drop", "exp_col_dist"] as const) {
      const th = document.createElement("th");
      th.scope = "col";
      th.textContent = lt(k);
      head.append(th);
    }
    const body = t.createTBody();
    for (const c of ctx.clearings) {
      const tr = body.insertRow();
      const dist = c.optical_alert === null ? lt("unknown") : c.optical_alert ? lt("yes") : lt("no");
      for (const v of [c.id, c.first_date, fmt.num(c.polygon_area_ha, 1), db(c.mean_hv_drop_db), dist]) tr.insertCell().textContent = v;
    }
    wrap.append(t);
    box.append(section(lt("exp_polys"), wrap));
  }

  const s = ctx.radar_signal_center_cell;
  if (s) {
    box.append(
      section(
        lt("exp_signal"),
        table([
          [lt("exp_hv_base"), db(s.hv_baseline_db)],
          [lt("exp_hv_first"), db(s.hv_at_date_db)],
          [lt("exp_hv_last"), db(s.hv_last_db)],
          [lt("exp_hv_delta"), db(s.hv_delta_last_minus_baseline_db)],
          [lt("exp_hv_min"), `${db(s.hv_min_db)}${s.hv_min_date ? ` · ${s.hv_min_date}` : ""}`],
          [lt("exp_hh_base"), db(s.hh_baseline_db)],
          [lt("exp_hh_last"), db(s.hh_last_db)],
          [lt("exp_cell"), `${s.cell_col_row[0]}, ${s.cell_col_row[1]}`],
        ]),
      ),
    );
  }

  const sc = ctx.scene_of_first_detection;
  if (sc) {
    box.append(
      section(
        lt("exp_scene"),
        table([
          [lt("exp_col_date"), sc.date],
          [lt("exp_scene_maturity"), `${sc.maturity} · ${sc.crid}`],
          [lt("exp_scene_id"), sc.id],
        ]),
      ),
    );
  }

  const m = ctx.method;
  const n = m.nisar as { track: number; direction: string; frame: number; mode: string };
  box.append(
    section(
      lt("exp_method"),
      table([
        [lt("exp_threshold"), `${fmt.signed(m.threshold_db, 1)} dB`],
        [lt("exp_persistence"), lt("exp_persistence_value")],
        [lt("exp_min_area"), `${fmt.num(m.min_area_ha)} ha`],
        [lt("exp_mask"), m.forest_mask],
        [lt("exp_nisar"), `track ${n.track} ${n.direction} · frame ${n.frame} · ${n.mode}`],
      ]),
    ),
  );

  const v = ctx.validation;
  box.append(
    section(
      lt("exp_validation"),
      table([
        [lt("exp_agreement"), `${pct(v.agreement_pct_spatial)} · ${pct(v.agreement_pct_24d)}`],
        [lt("exp_coverage"), `${pct(v.coverage_pct_spatial)} · ${pct(v.coverage_pct_24d)}`],
        [lt("exp_lead"), v.median_radar_lead_days === null ? lt("none") : lt("exp_lead_value", { d: fmt.num(v.median_radar_lead_days) })],
        [lt("exp_cases"), `${fmt.num(v.polygons_confirmed)} / ${fmt.num(v.polygons_total)}`],
      ]),
    ),
  );

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "btn btn-ghost btn-sm";
  copy.textContent = lt("exp_copy");
  const json = JSON.stringify(ctx, null, 2);
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(json);
      copy.textContent = lt("exp_copied");
    } catch {
      copy.textContent = lt("exp_copy_fail");
      const pre = document.createElement("textarea");
      pre.className = "xp-json";
      pre.readOnly = true;
      pre.value = json;
      copy.after(pre);
      pre.select();
    }
  });
  box.append(copy);
  host.append(box);
}

// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Timeline with play: one tick per NISAR scene placed at its real date (so the instrument gap
// shows), a bar per tick with the hectares first detected in that pass, and the running totals.

import { daysBetween, INSTRUMENT_GAP, REPEAT_DAYS, type Scene } from "../data";
import { fmt, locale, onLang, t } from "../i18n";

const STEP_MS = 1100;

export interface TimelineOptions {
  scenes: Scene[];
  /** Hectares first detected at each scene index. */
  newArea: number[];
  /** Polygon count first detected at each scene index. */
  newCount: number[];
  onChange: (i: number) => void;
}

const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export class Timeline {
  readonly el: HTMLElement;
  private i = 0;
  private timer = 0;
  private playing = false;
  private shownArea = 0;
  private areaRaf = 0;

  constructor(private opts: TimelineOptions) {
    this.el = document.createElement("div");
    this.el.className = "tl";
    this.render();
    onLang(() => this.render());
  }

  get index(): number {
    return this.i;
  }

  private pos(iso: string): number {
    const s = this.opts.scenes;
    const d0 = day(s[0]?.date ?? iso) - 4;
    const d1 = day(s[s.length - 1]?.date ?? iso) + 4;
    return ((day(iso) - d0) / (d1 - d0)) * 100;
  }

  /** One label per month, placed on the 1st of the month (year added on the first label and in January). */
  private months(): string {
    const s = this.opts.scenes;
    if (!s.length) return "";
    const fmtM = new Intl.DateTimeFormat(locale(), { month: "short", timeZone: "UTC" });
    const fmtMY = new Intl.DateTimeFormat(locale(), { month: "short", year: "numeric", timeZone: "UTC" });
    const out: string[] = [];
    let [y, m] = (s[0]?.date ?? "").split("-").map(Number) as [number, number];
    const end = s[s.length - 1]?.date ?? "";
    for (let k = 0; k < 40; k++) {
      const iso = `${y}-${String(m).padStart(2, "0")}-01`;
      if (iso > end) break;
      const left = this.pos(iso);
      if (left >= 0 && left <= 100) {
        const d = new Date(`${iso}T00:00:00Z`);
        const label = out.length === 0 || m === 1 ? fmtMY.format(d) : fmtM.format(d);
        out.push(`<span class="tl-month${k % 3 === 0 ? " tl-month-q" : ""}" style="left:${left}%">${label}</span>`);
      }
      m++;
      if (m > 12) {
        m = 1;
        y++;
      }
    }
    return out.join("");
  }

  private render() {
    const { scenes, newArea } = this.opts;
    const maxArea = Math.max(1, ...newArea);
    const gapL = this.pos(INSTRUMENT_GAP[0]);
    const gapR = this.pos(INSTRUMENT_GAP[1]);
    const showGap = gapR > 0 && gapL < 100;

    this.el.innerHTML = `
      <button class="tl-play" type="button"></button>
      <div class="tl-main">
        <div class="tl-head">
          <div class="tl-when">
            <b class="tl-date"></b>
            <span class="tl-pm"></span>
          </div>
          <div class="tl-stats">
            <span class="tl-area"><b></b> <small></small></span>
            <span class="tl-count"><b></b> <small></small></span>
            <span class="tl-new"></span>
          </div>
        </div>
        <div class="tl-track" role="group">
          <div class="tl-rail"><i class="tl-fill"></i></div>
          ${showGap ? `<div class="tl-gap" style="left:${gapL}%;width:${gapR - gapL}%"><span></span></div>` : ""}
          ${this.months()}
          ${scenes
            .map(
              (s, k) => `<button type="button" class="tl-tick${k === 0 || s.date.slice(0, 7) !== scenes[k - 1]?.date.slice(0, 7) ? " is-month" : ""}" data-i="${k}" style="left:${this.pos(s.date)}%">
                <i class="tl-bar" style="height:${((newArea[k] ?? 0) / maxArea) * 100}%"></i>
                <span class="tl-dot"></span>
                <span class="tl-label">${fmt.date(s.date)}</span>
              </button>`,
            )
            .join("")}
        </div>
      </div>`;

    const gapLabel = this.el.querySelector<HTMLElement>(".tl-gap span");
    if (gapLabel) {
      gapLabel.textContent = t("chart.gap");
      gapLabel.parentElement?.setAttribute("title", `${t("map.gap")} (${fmt.date(INSTRUMENT_GAP[0])}–${fmt.date(INSTRUMENT_GAP[1])})`);
    }
    this.el.querySelector(".tl-pm")!.textContent = t("map.date_pm");
    this.el.querySelector(".tl-area small")!.textContent = t("map.stat_area");
    this.el.querySelector(".tl-count small")!.textContent = t("map.stat_polys");
    this.el.querySelectorAll<HTMLButtonElement>(".tl-tick").forEach((b) => {
      const k = Number(b.dataset.i);
      b.setAttribute("aria-label", fmt.date(scenes[k]?.date ?? "", true));
      b.addEventListener("click", () => {
        this.pause();
        this.set(k);
      });
    });
    this.el.querySelector(".tl-play")!.addEventListener("click", () => (this.playing ? this.pause() : this.play()));
    this.el.querySelector(".tl-track")!.addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "ArrowRight" || key === "ArrowLeft") {
        e.preventDefault();
        this.pause();
        this.set(this.i + (key === "ArrowRight" ? 1 : -1));
        this.el.querySelector<HTMLButtonElement>(`.tl-tick[data-i="${this.i}"]`)?.focus();
      }
    });
    this.paintPlay();
    this.paint(false);
  }

  private paintPlay() {
    const b = this.el.querySelector<HTMLButtonElement>(".tl-play");
    if (!b) return;
    b.classList.toggle("is-playing", this.playing);
    b.setAttribute("aria-label", this.playing ? t("map.pause") : t("map.play"));
    b.innerHTML = this.playing
      ? `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>`;
  }

  private paint(animate: boolean) {
    const { scenes, newArea, newCount } = this.opts;
    const s = scenes[this.i];
    if (!s) return;
    this.el.querySelector(".tl-date")!.textContent = fmt.date(s.date, true);
    const prev = scenes[this.i - 1];
    this.el.querySelector(".tl-pm")!.textContent =
      prev && daysBetween(prev.date, s.date) > REPEAT_DAYS ? t("map.date_since", { date: fmt.date(prev.date) }) : t("map.date_pm");
    // the maturity chip (PROVISIONAL / VALIDATED) was taken out on the team's request (15 Nov): each scene's
    // maturity and CRID stay in the Layers panel's sources ("Más opciones")
    const fill = this.el.querySelector<HTMLElement>(".tl-fill")!;
    fill.style.width = `${this.pos(s.date)}%`;
    this.el.querySelectorAll<HTMLElement>(".tl-tick").forEach((b) => {
      const k = Number(b.dataset.i);
      b.classList.toggle("is-current", k === this.i);
      b.classList.toggle("is-past", k < this.i);
      b.tabIndex = k === this.i ? 0 : -1;
      b.setAttribute("aria-current", k === this.i ? "step" : "false");
    });

    const area = newArea.slice(0, this.i + 1).reduce((a, b) => a + b, 0);
    const count = newCount.slice(0, this.i + 1).reduce((a, b) => a + b, 0);
    this.el.querySelector(".tl-count b")!.textContent = fmt.num(count);
    const fresh = newCount[this.i] ?? 0;
    const freshEl = this.el.querySelector<HTMLElement>(".tl-new")!;
    freshEl.textContent = fresh > 0 ? t("map.stat_new", { n: fmt.num(fresh) }) : t("map.stat_new_none");
    freshEl.classList.toggle("is-hot", fresh > 0);
    this.tweenArea(area, animate);
  }

  private tweenArea(target: number, animate: boolean) {
    const el = this.el.querySelector(".tl-area b")!;
    cancelAnimationFrame(this.areaRaf);
    if (!animate) {
      this.shownArea = target;
      el.textContent = fmt.num(target);
      return;
    }
    const from = this.shownArea;
    const t0 = performance.now();
    const step = (now: number) => {
      const f = Math.min(1, Math.max(0, (now - t0) / 700));
      const e = 1 - (1 - f) ** 3;
      this.shownArea = from + (target - from) * e;
      el.textContent = fmt.num(this.shownArea);
      if (f < 1) this.areaRaf = requestAnimationFrame(step);
    };
    this.areaRaf = requestAnimationFrame(step);
  }

  set(i: number, notify = true): void {
    const n = this.opts.scenes.length;
    const next = Math.max(0, Math.min(n - 1, i));
    if (next === this.i && this.el.querySelector(".tl-date")?.textContent) {
      if (notify) this.opts.onChange(next);
      return;
    }
    this.i = next;
    this.paint(true);
    if (notify) this.opts.onChange(next);
  }

  play(): void {
    if (this.playing) return;
    this.playing = true;
    this.paintPlay();
    if (this.i >= this.opts.scenes.length - 1) this.set(0);
    const tick = () => {
      if (!this.playing) return;
      if (this.i >= this.opts.scenes.length - 1) {
        // stop on the last pass: the final picture stays on screen
        this.pause();
        return;
      }
      this.set(this.i + 1);
      this.timer = window.setTimeout(tick, STEP_MS);
    };
    this.timer = window.setTimeout(tick, STEP_MS * 0.6);
  }

  pause(): void {
    if (!this.playing) return;
    this.playing = false;
    clearTimeout(this.timer);
    this.paintPlay();
  }

  get isPlaying(): boolean {
    return this.playing;
  }
}

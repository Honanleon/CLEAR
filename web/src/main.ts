// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Entry point: i18n, the story chapters, and the map (MapLibre is loaded lazily when the
// map chapter gets close, so the cover paints fast on phones).

import "@fontsource-variable/space-grotesk/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./styles.css";
import { type Dataset, loadDataset } from "./data";
import { fmt, initI18n, lang, onLang, setLang } from "./i18n";
import { initGuide } from "./story/guide";
import { initHero } from "./story/hero";
import { initRadar } from "./story/radar";
import { initValidation } from "./story/validation";

// TEST build only (vite --mode lab): test styles and controls, loaded before the page is drawn.
if (import.meta.env.MODE === "lab") await import("./lab/boot");

function initChrome() {
  const toggle = document.getElementById("lang-toggle");
  toggle?.addEventListener("click", () => setLang(lang() === "es" ? "en" : "es"));

  const bar = document.getElementById("progress-bar");
  const topbar = document.getElementById("topbar");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.transform = `scaleX(${max > 0 ? scrollY / max : 0})`;
    topbar?.classList.toggle("is-solid", scrollY > 40);
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // active section in the nav
  const links = new Map<string, HTMLAnchorElement>();
  document.querySelectorAll<HTMLAnchorElement>(".nav a").forEach((a) => links.set(a.hash.slice(1), a));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        links.forEach((a, id) => a.classList.toggle("is-active", id === e.target.id));
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  links.forEach((_, id) => {
    const s = document.getElementById(id);
    if (s) spy.observe(s);
  });

  // reveal on scroll
  const reveal = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add("is-in");
          reveal.unobserve(e.target);
        }
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));
}

function lazyMap(ds: Dataset | null) {
  const section = document.getElementById("map");
  if (!section) return;
  const obs = new IntersectionObserver(
    async (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      obs.disconnect();
      const mod = await import("./map");
      if (!ds) {
        mod.showMapUnavailable("map.no_data");
        return;
      }
      try {
        await mod.initMapSection(ds);
      } catch (err) {
        console.error(err);
        mod.showMapUnavailable("map.error");
      }
    },
    { rootMargin: "800px 0px" },
  );
  obs.observe(section);
}

async function boot() {
  initI18n();
  initChrome();
  const canvas = document.getElementById("hero-canvas") as HTMLCanvasElement | null;
  const hero = canvas ? initHero(canvas) : null;
  initRadar();

  const ds = await loadDataset();
  if (ds?.synthetic) {
    document.getElementById("synthetic-banner")!.hidden = false;
    document.getElementById("map-watermark")!.hidden = false;
    document.body.classList.add("is-synthetic");
  }
  if (ds) {
    hero?.setDates(ds.index.scenes.map((s) => s.date));
    const stat = document.getElementById("stat-scenes");
    const paint = () => {
      if (stat) stat.textContent = fmt.num(ds.index.scenes.length);
    };
    paint();
    onLang(paint);
  }
  initValidation(ds);
  initGuide(ds);
  lazyMap(ds);
}

void boot();

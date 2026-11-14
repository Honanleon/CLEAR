// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST build only. "General / Expert" audience mode, like the ES/EN switch: one state for the whole
// page, remembered in this browser, with a toggle in the top bar and another inside the assistant.

import { onLang } from "../i18n";
import { lt } from "./strings";

export type Audience = "general" | "expert";

const KEY = "clear-lab-audience";
const listeners = new Set<(a: Audience) => void>();
let current: Audience = "general";

try {
  const saved = localStorage.getItem(KEY);
  if (saved === "general" || saved === "expert") current = saved;
} catch {
  /* storage blocked: default */
}

export function audience(): Audience {
  return current;
}

export function setAudience(a: Audience): void {
  if (a === current) return;
  current = a;
  try {
    localStorage.setItem(KEY, a);
  } catch {
    /* ignore */
  }
  applyBodyClass();
  listeners.forEach((fn) => fn(a));
}

export function onAudience(fn: (a: Audience) => void): void {
  listeners.add(fn);
}

function applyBodyClass() {
  document.body.classList.toggle("aud-expert", current === "expert");
  document.body.classList.toggle("aud-general", current === "general");
}

/** A two-option switch; every copy stays in sync with the page state. */
export function audienceSwitch(compact = false): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = `aud-switch${compact ? " aud-switch-sm" : ""}`;
  wrap.setAttribute("role", "group");
  const paint = () => {
    wrap.innerHTML = "";
    wrap.setAttribute("aria-label", lt("aud_label"));
    for (const a of ["general", "expert"] as const) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = lt(a === "general" ? "aud_general" : "aud_expert");
      b.title = lt(a === "general" ? "aud_general_hint" : "aud_expert_hint");
      b.setAttribute("aria-pressed", String(current === a));
      b.addEventListener("click", () => setAudience(a));
      wrap.append(b);
    }
  };
  paint();
  onAudience(paint);
  onLang(paint);
  return wrap;
}

/** Puts the switch in the top bar, before the language button. */
export function installAudienceInTopbar(): void {
  applyBodyClass();
  const lang = document.getElementById("lang-toggle");
  if (!lang || document.querySelector(".topbar .aud-switch")) return;
  lang.before(audienceSwitch());
}

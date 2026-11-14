// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Tiny i18n: every user-visible string lives in es.json / en.json.
// Static HTML uses data-i18n (text), data-i18n-attr ("attr:key;attr:key") and
// data-i18n-list (an array rendered as <li> items). Code uses t().

import en from "./en.json";
import es from "./es.json";

export type Lang = "es" | "en";
type Tree = { [key: string]: string | string[] | Tree };

const DICTS: Record<Lang, Tree> = { es: es as Tree, en: en as Tree };
const STORAGE_KEY = "clear-lang";
const listeners = new Set<(lang: Lang) => void>();
let current: Lang = "es";

function detect(): Lang {
  const q = new URLSearchParams(location.search).get("lang");
  if (q === "es" || q === "en") return q;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "es" || saved === "en") return saved;
  } catch {
    /* storage blocked: fall through */
  }
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

function lookup(key: string, dict: Tree): unknown {
  let node: unknown = dict;
  for (const part of key.split(".")) {
    if (node === null || typeof node !== "object" || Array.isArray(node)) return undefined;
    node = (node as Tree)[part];
  }
  return node;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const value = lookup(key, DICTS[current]) ?? lookup(key, DICTS.es);
  if (typeof value !== "string") return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function tList(key: string): string[] {
  const value = lookup(key, DICTS[current]) ?? lookup(key, DICTS.es);
  return Array.isArray(value) ? value : [];
}

export function lang(): Lang {
  return current;
}

export function locale(): string {
  return current === "es" ? "es-PY" : "en-US";
}

export function applyStatic(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n ?? "");
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-attr]").forEach((el) => {
    for (const pair of (el.dataset.i18nAttr ?? "").split(";")) {
      const [attr, key] = pair.split(":");
      if (attr && key) el.setAttribute(attr.trim(), t(key.trim()));
    }
  });
  root.querySelectorAll<HTMLElement>("[data-i18n-list]").forEach((el) => {
    el.replaceChildren(
      ...tList(el.dataset.i18nList ?? "").map((text) => {
        const li = document.createElement("li");
        li.textContent = text;
        return li;
      }),
    );
  });
}

export function setLang(next: Lang): void {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  document.documentElement.lang = next;
  applyStatic();
  document.title = t("meta.title");
  listeners.forEach((fn) => fn(next));
}

export function onLang(fn: (lang: Lang) => void): void {
  listeners.add(fn);
}

export function initI18n(): void {
  current = detect();
  document.documentElement.lang = current;
  applyStatic();
  document.title = t("meta.title");
}

export const fmt = {
  num(value: number, digits = 0): string {
    return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
  },
  signed(value: number, digits = 1): string {
    const s = fmt.num(Math.abs(value), digits);
    return value < 0 ? `−${s}` : value > 0 ? `+${s}` : s;
  },
  date(iso: string, withYear = false): string {
    return new Intl.DateTimeFormat(locale(), {
      day: "numeric",
      month: "short",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(new Date(`${iso}T00:00:00Z`));
  },
};

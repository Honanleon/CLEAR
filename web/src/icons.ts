// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// Symbols the web fonts do not have (→ is missing from the Space Grotesk and JetBrains Mono subsets): drawn as
// SVG so they look the same on every system (on Windows the font fallback drew them in another typeface).

const ARROW_SVG =
  '<svg viewBox="0 0 16 10" aria-hidden="true"><path d="M1 5h13M10 1.5 14 5l-4 3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** An inline arrow (→) in the current text colour, sized to the text. */
export function arrow(cls = ""): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = `arr${cls ? ` ${cls}` : ""}`;
  s.innerHTML = ARROW_SVG;
  return s;
}

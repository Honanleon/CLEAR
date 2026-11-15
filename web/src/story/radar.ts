// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// "How radar sees": an animated forest-vs-pasture scattering diagram with an HH / HV / HH/HV switch.
// The values are typical illustrative L-band backscatter levels (the UI labels them as such).

import { fmt, onLang, t } from "../i18n";

type Channel = "hh" | "hv" | "ratio";

/** Illustrative L-band backscatter (dB): forest vs freshly cleared pasture. */
const TYPICAL = {
  forest: { hh: -7, hv: -12 },
  pasture: { hh: -11, hv: -19 },
};

function value(cover: "forest" | "pasture", ch: Channel): number {
  const v = TYPICAL[cover];
  return ch === "ratio" ? v.hh - v.hv : v[ch];
}

/** Opacity of the return rays: strong echo = bright ray. */
function strength(cover: "forest" | "pasture", ch: Channel): number {
  if (ch === "ratio") return Math.min(1, value(cover, ch) / 9);
  return Math.min(1, Math.max(0.06, ((value(cover, ch) + 25) / 18) ** 2));
}

/** A tree: trunk and a round crown that does not touch its neighbours. */
function tree(x: number, top: number, r: number): string {
  return `<g class="tree"><path class="trunk" d="M${x} 470V${top + r}" /><circle class="crown" cx="${x}" cy="${top}" r="${r}" /></g>`;
}

/** Echo: three arcs around (cx, cy) opening towards angle `dir` (degrees), like a wave going back up. */
function echo(cls: string, cx: number, cy: number, dir: number): string {
  const arcs = [34, 62, 90].map((r) => {
    const a0 = ((dir - 32) * Math.PI) / 180;
    const a1 = ((dir + 32) * Math.PI) / 180;
    const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    return `<path d="M${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}" />`;
  });
  return `<g class="echo ${cls}">${arcs.join("")}</g>`;
}

function figure(): string {
  const trees = [
    [92, 352, 30],
    [160, 336, 33],
    [228, 348, 30],
    [296, 332, 34],
    [364, 350, 29],
  ]
    .map(([x, top, r]) => tree(x as number, top as number, r as number))
    .join("");
  const grass = Array.from({ length: 24 }, (_, i) => {
    const x = 492 + i * 14;
    return `<path d="M${x} 470l-3 -${7 + (i % 3) * 3}M${x + 4} 470l2 -${6 + (i % 2) * 3}" />`;
  }).join("");
  const logs = [0, 1, 2].map((k) => `<rect class="log" x="${760 + k * 20}" y="456" width="16" height="12" rx="5" />`).join("");

  return `<svg viewBox="0 0 880 560" role="img" aria-labelledby="radar-fig-title">
    <title id="radar-fig-title">${t("radar.title")}</title>
    <defs>
      <radialGradient id="glow-sat" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#bfffe0" stop-opacity=".5" />
        <stop offset="1" stop-color="#bfffe0" stop-opacity="0" />
      </radialGradient>
      <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M0 0L10 5L0 10z" fill="#eef5ff" />
      </marker>
    </defs>

    <g class="sat" transform="translate(440 70)">
      <circle r="46" fill="url(#glow-sat)" />
      <rect class="sat-panel" x="-76" y="-7" width="46" height="14" rx="2" />
      <rect class="sat-panel" x="30" y="-7" width="46" height="14" rx="2" />
      <rect class="sat-body" x="-16" y="-13" width="32" height="26" rx="4" />
      <path class="sat-dish" d="M-22 18q22 18 44 0" />
    </g>
    <text class="fig-label" x="352" y="40" text-anchor="end">${t("radar.emit")}</text>
    <text class="fig-label fig-recv" x="528" y="40" id="fig-recv">${t("radar.receive", { pol: "V" })}</text>

    <path class="ray ray-in" d="M424 100L240 318" marker-end="url(#arrow)" />
    <path class="ray ray-in" d="M456 100L652 456" marker-end="url(#arrow)" />
    <path class="ray ray-away" d="M664 462L852 330" />

    <rect class="ground" x="40" y="470" width="370" height="30" rx="6" />
    <rect class="ground" x="470" y="470" width="370" height="30" rx="6" />
    <g class="forest">${trees}</g>
    <g class="grass">${grass}</g>
    <g>${logs}</g>

    <circle class="hit" cx="226" cy="334" r="4" />
    <circle class="hit" cx="204" cy="356" r="3" />
    <circle class="hit" cx="250" cy="352" r="3" />
    ${echo("echo-forest", 240, 318, -50)}
    ${echo("echo-pasture", 652, 456, -118)}

    <text class="fig-title" x="225" y="534" text-anchor="middle">${t("radar.forest")}</text>
    <text class="fig-title" x="655" y="534" text-anchor="middle">${t("radar.pasture")}</text>
  </svg>`;
}

export function initRadar(): void {
  const lab = document.getElementById("radar-lab");
  const fig = document.getElementById("radar-figure");
  const desc = document.getElementById("radar-desc");
  const meters = document.getElementById("radar-meters");
  const contrast = document.getElementById("radar-contrast");
  const seg = document.getElementById("radar-seg");
  if (!lab || !fig || !desc || !meters || !contrast || !seg) return;

  let channel: Channel = "hv";

  function render() {
    fig!.innerHTML = figure();
    update();
  }

  function update() {
    lab!.dataset.channel = channel;
    lab!.style.setProperty("--ret-forest", String(strength("forest", channel)));
    lab!.style.setProperty("--ret-pasture", String(strength("pasture", channel)));
    seg!.querySelectorAll<HTMLButtonElement>("button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.channel === channel));
    });
    const recv = document.getElementById("fig-recv");
    if (recv) recv.textContent = t("radar.receive", { pol: channel === "hh" ? "H" : channel === "hv" ? "V" : "H + V" });
    desc!.textContent = t(`radar.desc_${channel}`);

    const rows: ["forest" | "pasture", string][] = [
      ["forest", t("radar.forest")],
      ["pasture", t("radar.pasture")],
    ];
    meters!.innerHTML = "";
    for (const [cover, label] of rows) {
      const v = value(cover, channel);
      const pct = channel === "ratio" ? (v / 12) * 100 : ((v + 25) / 25) * 100;
      const row = document.createElement("div");
      row.className = `meter meter-${cover}`;
      row.innerHTML = `<span class="meter-label"></span><span class="meter-track"><i style="width:${pct.toFixed(1)}%"></i></span><b class="meter-val"></b>`;
      (row.querySelector(".meter-label") as HTMLElement).textContent = label;
      (row.querySelector(".meter-val") as HTMLElement).textContent = `${fmt.signed(v, 0)} ${t("radar.unit_db")}`;
      meters!.append(row);
    }
    contrast!.textContent = fmt.signed(value("pasture", channel) - value("forest", channel), 0);
  }

  seg.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-channel]");
    if (!btn) return;
    channel = btn.dataset.channel as Channel;
    update();
  });
  onLang(render);
  render();
}

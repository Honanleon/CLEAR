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

function tree(x: number, h: number, r: number): string {
  const top = 372 - h;
  return `<g class="tree">
    <path class="trunk" d="M${x} 372V${top + r}" />
    <path class="branch" d="M${x} ${top + r + 14}l-${r * 0.6} -${r * 0.5}M${x} ${top + r + 4}l${r * 0.55} -${r * 0.45}" />
    <ellipse class="crown" cx="${x}" cy="${top + r * 0.6}" rx="${r}" ry="${r * 1.05}" />
  </g>`;
}

function figure(): string {
  const trees = [
    [82, 112, 28], [128, 132, 34], [178, 104, 26], [222, 126, 32], [270, 116, 30], [318, 134, 33], [362, 108, 26],
  ]
    .map(([x, h, r]) => tree(x as number, h as number, r as number))
    .join("");
  const grass = Array.from({ length: 34 }, (_, i) => {
    const x = 470 + i * 11 + ((i * 7) % 5);
    return `<path d="M${x} 372l-2 -${6 + (i % 4) * 2}M${x + 3} 372l2 -${5 + (i % 3) * 2}" />`;
  }).join("");
  const logs = [0, 1, 2]
    .map((k) => `<rect class="log" x="${700 + k * 22}" y="${352 + (k % 2) * 6}" width="16" height="14" rx="5" />`)
    .join("");

  return `<svg viewBox="0 0 880 430" role="img" aria-labelledby="radar-fig-title">
    <title id="radar-fig-title">${t("radar.title")}</title>
    <defs>
      <radialGradient id="glow-sat" cx="50%" cy="50%" r="50%">
        <stop offset="0" stop-color="#bfffe0" stop-opacity=".55" />
        <stop offset="1" stop-color="#bfffe0" stop-opacity="0" />
      </radialGradient>
      <linearGradient id="soil" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="#3a2a1d" />
        <stop offset="1" stop-color="#140d08" />
      </linearGradient>
    </defs>

    <!-- satellite (generic drawing) -->
    <g class="sat" transform="translate(440 46)">
      <circle r="44" fill="url(#glow-sat)" />
      <rect class="sat-panel" x="-74" y="-7" width="46" height="14" rx="2" />
      <rect class="sat-panel" x="28" y="-7" width="46" height="14" rx="2" />
      <rect class="sat-body" x="-16" y="-13" width="32" height="26" rx="4" />
      <path class="sat-dish" d="M-22 18q22 18 44 0" />
    </g>
    <text class="fig-label" x="440" y="112" text-anchor="middle">${t("radar.emit")}</text>

    <!-- ground -->
    <rect x="30" y="372" width="380" height="40" fill="url(#soil)" rx="4" />
    <rect x="460" y="372" width="390" height="40" fill="url(#soil)" rx="4" />
    <g class="forest">${trees}</g>
    <g class="grass">${grass}</g>
    <g>${logs}</g>

    <!-- incident pulses -->
    <path class="ray ray-in" d="M426 70L232 268" />
    <path class="ray ray-in" d="M454 70L640 368" />

    <!-- volume scattering inside the canopy -->
    <path class="bounce" d="M232 268L196 240L262 226L214 300L282 284L246 330" />
    <circle class="hit" cx="232" cy="268" r="4" />
    <circle class="hit" cx="262" cy="226" r="3" />
    <circle class="hit" cx="214" cy="300" r="3" />

    <!-- returns -->
    <g class="returns returns-forest">
      <path class="ray ray-out" d="M196 240L420 74" />
      <path class="ray ray-out" d="M262 226L430 78" />
      <path class="ray ray-out" d="M282 284L434 80" />
    </g>
    <path class="ray ray-away" d="M640 368L860 160" />
    <g class="returns returns-pasture">
      <path class="ray ray-out" d="M640 368L456 78" />
    </g>

    <text class="fig-label fig-recv" x="300" y="150" text-anchor="middle" id="fig-recv">${t("radar.receive", { pol: "V" })}</text>
    <text class="fig-title" x="220" y="404" text-anchor="middle">${t("radar.forest")}</text>
    <text class="fig-title" x="655" y="404" text-anchor="middle">${t("radar.pasture")}</text>
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

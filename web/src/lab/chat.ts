// Parts of this file were generated with AI assistance (Claude Code). See docs/AI_USAGE.md
//
// TEST build only. The CLEAR assistant, through the claude.ai Artifact `sample` capability (runs on
// the viewer's own Claude account; no API key, no server). Every call carries the project knowledge
// (knowledge.ts), the data of the whole study area and, for a tapped hexagon, that hexagon's data.
// General audience: quick model, short plain answers. Expert audience: most capable model, technical
// answers, and page tools to look up the radar signal at any point or any hexagon.
// Conversations are kept per scope + audience + language so re-renders never ask twice.

import { lang } from "../i18n";
import { type Audience, audience, audienceSwitch } from "./audience";
import type { HexContext, Signal, StudyContext } from "./context";
import { KNOWLEDGE } from "./knowledge";
import { lt, ltList } from "./strings";

type Turn = { role: "user" | "assistant"; content: string };
type Tool = {
  name: string;
  description: string;
  inputSchema?: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
  execute(input: Record<string, unknown>): unknown;
};
type SampleOptions = {
  onText?: (u: { text: string }) => void;
  signal?: AbortSignal;
  modelTier?: "quick" | "default" | "complex";
  cache?: boolean | { gcTime: number };
  tools?: Tool[];
};
type SampleFn = ((input: string | Turn[], options?: SampleOptions) => Promise<{ text: string; truncated: boolean }>) & {
  limits?: () => Promise<{ tools?: { maxCount: number }; modelTiers?: string[] }>;
};
type ClaudeHost = { use(name: "sample"): Promise<SampleFn | null> };

let samplePromise: Promise<SampleFn | null> | null = null;
function getSample(): Promise<SampleFn | null> {
  if (!samplePromise) {
    const host = (window as unknown as { claude?: ClaudeHost }).claude;
    samplePromise = host ? host.use("sample").catch(() => null) : Promise.resolve(null);
  }
  return samplePromise;
}

let limitsPromise: Promise<{ tools: boolean; tiers: string[] | null }> | null = null;
function getLimits(sample: SampleFn) {
  limitsPromise ??= (sample.limits?.() ?? Promise.reject())
    .then((l) => ({ tools: Boolean(l.tools), tiers: l.modelTiers ?? null }))
    .catch(() => ({ tools: false, tiers: null }));
  return limitsPromise;
}

export interface ChatDeps {
  study: () => Promise<StudyContext>;
  signalAt: (lon: number, lat: number) => Promise<Signal | null>;
  hexagon: (id: number) => Promise<HexContext | null>;
}

export type ChatScope = { kind: "study" } | { kind: "hex"; cellId: number; context: () => Promise<HexContext> };

function instructions(aud: Audience, tools: boolean): string {
  const language = lang() === "en" ? "English" : "Spanish (rioplatense/Paraguayan register, use 'vos')";
  const style =
    aud === "expert"
      ? `Audience: remote-sensing and forest-monitoring EXPERTS. Be precise and technical. Answer directly in the first sentence, then justify with the method and the exact values (dB, ha, %, dates, product ids, CRID, maturity) from the knowledge and data, naming the fields you used. Discuss uncertainty and alternative explanations when relevant (soil moisture, windrows, burning, speckle, calibration maturity, forest mask, resolution, normalization). ${
          tools ? "You may call the tools to look up the radar series at any point or the details of any hexagon. " : ""
        }Use "- " bullets and **bold** for key numbers; no headings, no tables. At most 250 words unless the question really needs more.`
      : `Audience: the GENERAL PUBLIC with no technical background. Write in very simple, friendly words, as if explaining to a neighbour. First one short sentence that answers directly, with the key number in **bold**. Then at most 3 short "- " bullets only if they help. No jargon; if a technical word is unavoidable (radar, HV, dB), explain it in a few plain words. Compare hectares with soccer fields (1 field ≈ 0.7 ha). At most 90 words.`;
  return `You are the CLEAR assistant on a TEST version of the CLEAR website (NASA Space Apps 2026). Answer using ONLY the project knowledge and the data below.

Rules:
- If the answer is not in the knowledge or data, say so plainly. Never invent numbers, places, dates, causes or people.
- Say "radar-estimated clearing" ("desmonte estimado por radar" in Spanish); dates are ±12 days; results are estimates, not ground truth.
- Never say or suggest a clearing is illegal; never speculate about owners, companies or who did it. If asked, explain CLEAR only shows land-cover change; legality needs cadastre and permits CLEAR does not use.
- Never discuss or speculate about Indigenous territories or communities.
- Answer in ${language}.
- ${style}`;
}

function prompt(aud: Audience, tools: boolean, study: StudyContext, hex: HexContext | null, task: string | null): string {
  return [
    instructions(aud, tools),
    "=== PROJECT KNOWLEDGE ===",
    KNOWLEDGE,
    "=== DATA: WHOLE STUDY AREA (JSON) ===",
    JSON.stringify(study),
    hex ? "=== DATA: THE HEXAGON THE PERSON TAPPED (JSON) ===" : "",
    hex ? JSON.stringify(hex) : "",
    task ? `=== TASK ===\n${task}` : "=== TASK ===\nWait for the person's question in the next message and answer it.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function summaryTask(aud: Audience, hex: HexContext): string {
  if (hex.hexagon.cleared_ha_total <= 0) {
    return aud === "expert"
      ? "In 3-4 sentences: no clearing was detected in this hexagon; describe the HV/HH behaviour of the centre cell versus baseline and whether anything is close to the threshold."
      : "In 2 short sentences, tell the person that the radar found no clearing in this hexagon during the period.";
  }
  return aud === "expert"
    ? "Give an expert summary of this hexagon in at most 6 bullets: cleared area (ha, % of the hexagon) and dates (±12 d); clearings with mean ΔHV and optical-alert status; HV/HH behaviour of the centre cell (baseline, drop, minimum) and what it suggests (felling, windrows, burning, moisture); product maturity of the detection scene; main uncertainties."
    : "Explain what happened in this hexagon in at most 3 short sentences: how much forest was lost (hectares and soccer fields), when (±12 days), and whether another satellite also saw it.";
}

interface ChatState {
  turns: Turn[];
  status: "idle" | "busy" | "error";
  streaming: string;
  note: string;
  error: string;
  ctl: AbortController | null;
  started: boolean;
  view: (() => void) | null;
}
const states = new Map<string, ChatState>();

/** Escapes HTML, then renders **bold** and "- " bullets. */
function rich(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = "";
  let inList = false;
  for (const raw of esc.split("\n")) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/^#+\s*/, "");
    if (/^\s*[-•*]\s+/.test(line)) {
      if (!inList) html += "<ul>";
      inList = true;
      html += `<li>${line.replace(/^\s*[-•*]\s+/, "")}</li>`;
    } else {
      if (inList) html += "</ul>";
      inList = false;
      if (line.trim()) html += `<p>${line}</p>`;
    }
  }
  return inList ? `${html}</ul>` : html;
}

function errorText(code: string | undefined): string {
  if (["not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code ?? "")) return lt("ai_not_granted");
  if (code === "rate_limited") return lt("ai_rate");
  if (code === "refused") return lt("ai_refused");
  return lt("ai_error");
}

export function mountChat(host: HTMLElement, scope: ChatScope, deps: ChatDeps): void {
  const aud = audience();
  const scopeKey = scope.kind === "hex" ? `hex${scope.cellId}` : "study";
  const key = `${scopeKey}|${aud}|${lang()}`;
  let state = states.get(key);
  if (!state) {
    state = { turns: [], status: "idle", streaming: "", note: "", error: "", ctl: null, started: false, view: null };
    states.set(key, state);
  }
  const st = state;

  const box = document.createElement("section");
  box.className = `ai ai-${aud}`;
  host.append(box);

  const tools = (): Tool[] => [
    {
      name: "get_radar_signal",
      description:
        "Returns the NISAR HV and HH backscatter series (dB, not normalized) of the ~500 m grid cell that contains a point, with baseline, last value, minimum and dates. Use it to inspect any location in the study area.",
      inputSchema: { type: "object", properties: { lon: { type: "number" }, lat: { type: "number" } }, required: ["lon", "lat"] },
      async execute(input) {
        st.note = lt("ai_tool");
        st.view?.();
        const s = await deps.signalAt(Number(input.lon), Number(input.lat));
        if (!s) throw new Error("No radar data at that point (outside the study area or no data).");
        return s;
      },
    },
    {
      name: "get_hexagon",
      description:
        "Returns the full data of one map hexagon by id: hectares cleared per date, its clearings with mean ΔHV and optical-alert status, the detection scene and the radar series at its centre. Hexagon ids are listed in the study-area data.",
      inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
      async execute(input) {
        st.note = lt("ai_tool");
        st.view?.();
        const h = await deps.hexagon(Number(input.id));
        if (!h) throw new Error("No hexagon with that id.");
        return h;
      },
    },
  ];

  const ask = async (question: string | null) => {
    const sample = await getSample();
    if (!sample) {
      st.status = "error";
      st.error = lt("ai_unavailable");
      st.view?.();
      return;
    }
    const limits = await getLimits(sample);
    const useTools = aud === "expert" && limits.tools;
    const tier = aud === "expert" ? (!limits.tiers || limits.tiers.includes("complex") ? "complex" : "default") : "quick";
    const [study, hex] = await Promise.all([deps.study(), scope.kind === "hex" ? scope.context() : Promise.resolve(null)]);
    const task = question === null && hex ? summaryTask(aud, hex) : null;
    const intro: Turn = { role: "user", content: prompt(aud, useTools, study, hex, task) };

    let input: Turn[];
    if (question === null) {
      input = [intro];
    } else {
      st.turns.push({ role: "user", content: question });
      const [first, ...rest] = st.turns;
      // rules + data, the summary (if any), then the last exchanges; consecutive user turns are allowed
      input = first?.role === "assistant" ? [intro, first, ...rest.slice(-8)] : [intro, ...st.turns.slice(-9)];
    }
    st.status = "busy";
    st.streaming = "";
    st.note = "";
    st.error = "";
    st.ctl = new AbortController();
    st.view?.();
    try {
      const options: SampleOptions = {
        signal: st.ctl.signal,
        modelTier: tier,
        onText: ({ text }) => {
          st.streaming = text;
          st.note = "";
          st.view?.();
        },
      };
      if (useTools) options.tools = tools();
      else options.cache = question === null ? { gcTime: 30 * 60_000 } : false;
      const { text, truncated } = await sample(input, options);
      st.turns.push({ role: "assistant", content: truncated ? `${text}\n${lt("ai_cut")}` : text });
      st.status = "idle";
    } catch (e) {
      const err = e as { code?: string; text?: string };
      if (err.text) st.turns.push({ role: "assistant", content: `${err.text}\n${lt("ai_cut")}` });
      if (err.code === "cancelled") st.status = "idle";
      else {
        st.status = "error";
        st.error = errorText(err.code);
      }
    } finally {
      st.streaming = "";
      st.note = "";
      st.ctl = null;
      st.view?.();
    }
  };

  const blockedError = () => st.status === "error" && (st.error === lt("ai_unavailable") || st.error === lt("ai_not_granted"));

  const render = () => {
    if (!box.isConnected) {
      if (st.view === render) st.view = null;
      return;
    }
    const inputId = `ai-q-${key}`;
    const focused = document.activeElement?.id === inputId;
    const draft = (box.querySelector("input") as HTMLInputElement | null)?.value ?? "";
    box.innerHTML = "";

    const head = document.createElement("div");
    head.className = "ai-head";
    const title = document.createElement("div");
    title.className = "ai-title";
    title.innerHTML = `<span class="ai-spark" aria-hidden="true"></span><h4></h4><span class="ai-badge"></span>`;
    title.querySelector("h4")!.textContent = scope.kind === "hex" ? lt("ai_title") : lt("ai_title_study");
    title.querySelector(".ai-badge")!.textContent = lt("ai_badge");
    head.append(title, audienceSwitch(true));
    box.append(head);
    const model = document.createElement("p");
    model.className = "ai-model";
    model.textContent = aud === "expert" ? lt("ai_model_expert") : lt("ai_model_general");
    box.append(model);

    const log = document.createElement("div");
    log.className = "ai-log";
    log.setAttribute("aria-live", "polite");
    const bubble = (role: Turn["role"], html: string, label: string, cls = "") => {
      const m = document.createElement("div");
      m.className = `ai-msg ${role === "user" ? "ai-user" : "ai-bot"} ${cls}`;
      const who = document.createElement("span");
      who.className = "ai-who";
      who.textContent = label;
      const body = document.createElement("div");
      body.className = "ai-text";
      body.innerHTML = html;
      m.append(who, body);
      log.append(m);
    };
    st.turns.forEach((tn, i) => {
      if (tn.role === "user") bubble("user", rich(tn.content), lt("ai_you"));
      else bubble("assistant", rich(tn.content), i === 0 && scope.kind === "hex" ? `${lt("ai_bot")} · ${lt("ai_summary")}` : lt("ai_bot"));
    });
    if (st.status === "busy") {
      const waiting = st.note || (aud === "expert" ? lt("ai_thinking_expert") : lt("ai_thinking"));
      bubble(
        "assistant",
        st.streaming ? rich(st.streaming) : `<p class="ai-thinking"><i></i><i></i><i></i> ${waiting}</p>`,
        lt("ai_bot"),
        "is-streaming",
      );
    }
    if (st.status === "error") {
      const p = document.createElement("p");
      p.className = "ai-error";
      p.textContent = st.error;
      log.append(p);
      if (!blockedError()) {
        const retry = document.createElement("button");
        retry.type = "button";
        retry.className = "btn btn-ghost btn-sm";
        retry.textContent = lt("ai_retry");
        retry.addEventListener("click", () => {
          const last = st.turns[st.turns.length - 1];
          if (last?.role === "user") {
            st.turns.pop();
            void ask(last.content);
          } else void ask(null);
        });
        log.append(retry);
      }
    }
    if (log.childElementCount) box.append(log);

    if (!blockedError()) {
      const chips = document.createElement("div");
      chips.className = "ai-chips";
      const list =
        scope.kind === "hex" ? ltList(aud === "expert" ? "chips_expert" : "chips_public") : ltList(aud === "expert" ? "chips_study_expert" : "chips_study_public");
      for (const q of list) {
        const c = document.createElement("button");
        c.type = "button";
        c.className = "ai-chip";
        c.textContent = q;
        c.disabled = st.status === "busy";
        c.addEventListener("click", () => void ask(q));
        chips.append(c);
      }
      box.append(chips);

      const form = document.createElement("form");
      form.className = "ai-form";
      const input = document.createElement("input");
      input.type = "text";
      input.id = inputId;
      input.maxLength = 500;
      input.autocomplete = "off";
      input.placeholder = aud === "expert" ? lt("ai_placeholder_expert") : lt("ai_placeholder");
      input.setAttribute("aria-label", input.placeholder);
      input.value = draft;
      const btn = document.createElement("button");
      btn.className = "btn btn-primary btn-sm";
      if (st.status === "busy") {
        btn.type = "button";
        btn.textContent = lt("ai_stop");
        btn.addEventListener("click", () => st.ctl?.abort());
      } else {
        btn.type = "submit";
        btn.textContent = lt("ai_send");
      }
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q || st.status === "busy") return;
        input.value = "";
        void ask(q);
      });
      form.append(input, btn);
      box.append(form);
      if (focused) input.focus();
    }

    const foot = document.createElement("div");
    foot.className = "ai-foot";
    const note = document.createElement("p");
    note.className = "ai-note";
    note.textContent = lt("ai_disclaimer");
    foot.append(note);
    if (st.turns.length && st.status !== "busy") {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "ai-clear";
      clear.textContent = lt("ai_clear");
      clear.addEventListener("click", () => {
        st.turns = [];
        st.status = "idle";
        st.error = "";
        render();
      });
      foot.append(clear);
    }
    box.append(foot);
    log.scrollTop = log.scrollHeight;
  };

  st.view = render;
  render();
  // a tapped hexagon opens with a summary (the tap is the viewer's action); the study chat waits for a question
  if (!st.started && scope.kind === "hex") {
    st.started = true;
    void ask(null);
  }
}

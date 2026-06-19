// The Manager. Runs each quarter (and on a mid-quarter stuck-trigger), on the
// top model. It makes the portfolio call the Advisor does not: which ONE project
// is focus next quarter, what mode each other project is in, and — at quarter
// end — an honest judgment of whether the focus paid off. A manager, not an
// advisor: it makes the call and gives the reason. Same coerce() pattern.

import type {
  Week, ProjectMode, ManagerReport, QuarterJudgment,
} from "@/lib/model";
import type { StuckSignal } from "@/lib/stuck";
import { claude, MODEL_MANAGER, stripJsonFences } from "@/lib/anthropic";

// A compact view of one project for the Manager to weigh.
export interface ManagerProjectView {
  id: string;
  name: string;
  description: string;
  mode: ProjectMode;
  currentSubGoal: string;
  gatingQuestion: string | null;
  recentWeeks: Week[];
}

export interface ManagerInput {
  businessName: string;
  overallGoal: string;
  constraints: string[];
  projects: ManagerProjectView[];
  // The current focus and its shared, mechanical stuck-signal.
  focusProjectId: string | null;
  stuck: StuckSignal;
  lastQuarterJudgment: QuarterJudgment | null;
  // True when the operator pulled this run forward mid-quarter (stuck fired).
  pulledForward: boolean;
}

const SYSTEM = `You are the Manager of a one-person company's portfolio of projects. You run quarterly, on the top model. You decide which ONE project is the focus next quarter and what mode each other project runs in. You are a manager, not an advisor: make the call and give the reason.

Modes you assign: "focus" (exactly one project — the active bet), "maintenance" (numbers logged and watched, no new moves), "dark" (fully paused this quarter).

Hard rules:
- GROUND THE FOCUS CHOICE in where each project actually is — its stage, momentum, and whether its current gating question got answered. Never a generic sequence or "do the biggest one".
- THE MOST VALUABLE THING YOU DO is tell the operator what to IGNORE this quarter. Be explicit about which projects go to maintenance or dark and why it is safe to ignore them now. A solo operator's scarcest resource is attention; protect it.
- THE BUSINESS CONSTRAINTS ARE ABSOLUTE.
- IF THE RUN WAS PULLED FORWARD by the stuck-signal: say plainly whether to CUT the current focus and switch, or HOLD it one more cycle — with the reason. Cutting a stuck focus early is not failure; burning a quarter on it is. Put what is stuck in stuckTrigger.
- WITH ONLY ONE PROJECT: confirm it as focus, set stuckTrigger to null unless pulled forward, and note in focusReason that there is no cross-project choice to make yet. Do not invent work or fake a portfolio.

recommendedFocusProjectId MUST be one of the given project ids. modeRecommendations must cover every project except (optionally) the focus one, each with a one-line why.

Respond with ONLY a JSON object, no preamble, no markdown fences, matching exactly:
{
  "recommendedFocusProjectId": string,
  "focusReason": string,
  "modeRecommendations": [ { "projectId": string, "mode": "focus" | "maintenance" | "dark", "why": string } ],
  "stuckTrigger": string | null
}`;

function metricsLine(m: Record<string, number | undefined>): string {
  const e = Object.entries(m);
  return e.length ? e.map(([k, v]) => `${k}=${v}`).join(", ") : "(none)";
}

function projectBlock(p: ManagerProjectView, isFocus: boolean): string {
  const weeks = [...p.recentWeeks]
    .sort((a, b) => (a.weekOf < b.weekOf ? -1 : 1))
    .map((w) => `    ${w.weekOf}: ${metricsLine(w.metrics)}`)
    .join("\n");
  return [
    `  PROJECT ${p.id}${isFocus ? " (current focus)" : ""}: ${p.name}`,
    `    what: ${p.description}`,
    `    mode now: ${p.mode}`,
    `    gating question: ${p.gatingQuestion ?? "(none set yet)"}`,
    `    current sub-goal: ${p.currentSubGoal}`,
    weeks ? `    recent weeks:\n${weeks}` : `    recent weeks: (none logged)`,
  ].join("\n");
}

function render(input: ManagerInput): string {
  return [
    `BUSINESS: ${input.businessName}`,
    `OVERALL GOAL: ${input.overallGoal}`,
    `CONSTRAINTS (absolute):`,
    ...input.constraints.map((c) => `  - ${c}`),
    ``,
    `PROJECTS (${input.projects.length}):`,
    ...input.projects.map((p) => projectBlock(p, p.id === input.focusProjectId)),
    ``,
    `CURRENT FOCUS STUCK-SIGNAL (mechanical, shared with the Advisor): ${
      input.stuck.stuck ? "STUCK" : "not stuck"
    } — ${input.stuck.reason}`,
    `THIS RUN: ${
      input.pulledForward
        ? "PULLED FORWARD mid-quarter by the stuck-signal — decide cut vs hold."
        : "regular quarter boundary."
    }`,
    input.lastQuarterJudgment
      ? `LAST QUARTER'S JUDGMENT: question ${
          input.lastQuarterJudgment.questionAnswered ? "ANSWERED" : "NOT answered"
        } — ${input.lastQuarterJudgment.assessment}`
      : `LAST QUARTER: none.`,
  ].join("\n");
}

function coerce(raw: string, projects: ManagerProjectView[]): ManagerReport {
  const p = JSON.parse(stripJsonFences(raw));
  const ids = new Set(projects.map((x) => x.id));
  // Never let the focus point at a project that does not exist.
  const rec = ids.has(p.recommendedFocusProjectId)
    ? String(p.recommendedFocusProjectId)
    : projects[0]?.id ?? "";
  const isMode = (m: unknown): m is ProjectMode =>
    m === "focus" || m === "maintenance" || m === "dark";
  const modeRecommendations = Array.isArray(p.modeRecommendations)
    ? p.modeRecommendations
        .map((r: Record<string, unknown>) => ({
          projectId: String(r.projectId ?? ""),
          mode: isMode(r.mode) ? r.mode : "maintenance",
          why: String(r.why ?? ""),
        }))
        .filter((r: { projectId: string }) => ids.has(r.projectId))
    : [];
  return {
    recommendedFocusProjectId: rec,
    focusReason: String(p.focusReason ?? ""),
    modeRecommendations,
    stuckTrigger:
      p.stuckTrigger === null || p.stuckTrigger === undefined
        ? null
        : String(p.stuckTrigger),
  };
}

export async function manage(input: ManagerInput): Promise<ManagerReport> {
  const msg = await claude().messages.create({
    model: MODEL_MANAGER,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: render(input) }],
  });
  const t = msg.content.find((b: { type: string }) => b.type === "text");
  if (!t || t.type !== "text") throw new Error("no text in manager response");
  return coerce(t.text, input.projects);
}

// ---- Quarter judgment (the backward half of the Manager's job) -------------

export interface JudgeInput {
  businessName: string;
  focusProjectName: string | null;
  gatingQuestion: string | null;
  successLooksLike: string | null;
  weeks: Week[];           // the focus project's weeks this quarter
  stuck: StuckSignal;
  pulledForward: boolean;  // true if closed early by the stuck-signal
}

const JUDGE_SYSTEM = `You are the Manager closing out a quarter. Judge the focus project honestly: did its gating question actually get ANSWERED this quarter, and did the quarter MOVE the business or merely generate activity? This is the did-it-work loop at the quarter level — the same discipline the weekly Critic applies to a single move, applied to thirteen weeks.

Hard rules:
- Answer questionAnswered as a strict boolean. "We learned a lot" is not an answer; a question is answered when you can now state the answer and act on it.
- Do not confuse activity with progress. Many shipped things and a flat success metric is not a successful quarter — say so.
- Be specific and brief. If it failed, say it failed and why; do not soften.

Respond with ONLY a JSON object, no preamble, no markdown fences:
{
  "questionAnswered": boolean,
  "assessment": string
}`;

function renderJudge(input: JudgeInput): string {
  const weeks = [...input.weeks]
    .sort((a, b) => (a.weekOf < b.weekOf ? -1 : 1))
    .map((w) => {
      const move = w.recommendation ? ` | move: ${w.recommendation.oneMove}` : "";
      return `  ${w.weekOf}: ${metricsLine(w.metrics)}${move}`;
    })
    .join("\n");
  return [
    `BUSINESS: ${input.businessName}`,
    `FOCUS PROJECT: ${input.focusProjectName ?? "(none)"}`,
    `GATING QUESTION THIS QUARTER: ${input.gatingQuestion ?? "(none set)"}`,
    `SUCCESS LOOKS LIKE: ${input.successLooksLike ?? "(unset)"}`,
    ``,
    `WEEKS THIS QUARTER (oldest first):`,
    weeks || "  (no weeks logged)",
    ``,
    `STUCK-SIGNAL: ${input.stuck.stuck ? "STUCK" : "not stuck"} — ${input.stuck.reason}`,
    input.pulledForward
      ? `NOTE: closed EARLY (pulled forward by the stuck-signal).`
      : `NOTE: closed at the quarter boundary.`,
  ].join("\n");
}

export async function judgeQuarter(input: JudgeInput): Promise<QuarterJudgment> {
  const msg = await claude().messages.create({
    model: MODEL_MANAGER,
    max_tokens: 800,
    system: JUDGE_SYSTEM,
    messages: [{ role: "user", content: renderJudge(input) }],
  });
  const t = msg.content.find((b: { type: string }) => b.type === "text");
  if (!t || t.type !== "text") throw new Error("no text in manager judgment response");
  const p = JSON.parse(stripJsonFences(t.text));
  return {
    questionAnswered: Boolean(p.questionAnswered),
    assessment: String(p.assessment ?? ""),
    pulledForward: input.pulledForward,
    at: Date.now(),
  };
}

// The Advisor. Runs once a quarter INSIDE the focus project, on the top model.
// It produces the ONE gating question this quarter must answer, then 2–3
// genuinely distinct approaches to answering it, and leads with one — for a
// reason grounded in this project's real evidence, not generic best practice.
// It decides nothing: the operator picks an approach, and weekly sub-goals then
// derive from it. Same structured-output + coerce() pattern as the other agents.

import type {
  Week, QuarterJudgment, AdvisorReport, Approach,
} from "@/lib/model";
import type { StuckSignal } from "@/lib/stuck";
import { claude, MODEL_ADVISOR, stripJsonFences } from "@/lib/anthropic";

// Everything the Advisor reasons over for the focus project this quarter.
export interface AdvisorInput {
  overallGoal: string;
  constraints: string[];
  projectName: string;
  projectDescription: string;
  successLooksLike: string;
  weeks: Week[];                          // history, any order
  lastQuarterJudgment: QuarterJudgment | null;
  stuck: StuckSignal;
}

const SYSTEM = `You are the Advisor for a one-person company, working inside its single focus project for the coming quarter. You run on the top model because what you produce sets the direction every weekly cycle then executes on rails.

You output, as JSON only:

1. ONE gating question — the single question this quarter must answer before the business can responsibly move to its next phase. A gating question is not a theme ("growth") and not a task list ("ship X, post Y"). It is a question that, once answered, unlocks what comes next — e.g. "Does our onboarding actually convert a signup into an activated user, or do they sign up and vanish?"

2. Then 2–3 genuinely DISTINCT approaches to answering it. Distinct means different lines of attack, not three rewordings of one. Each approach must state: why it attacks the question, its rough effort cost, and — crucially — the FALSIFIABLE result that would confirm or kill it. The successSignal field is that falsifiable result expressed as what the weekly loop will measure.

3. Lead with ONE (leadIndex), and justify it in leadReason. The leadReason MUST cite this project's actual findings/history — e.g. "signups arrive but activation is unmeasured, so instrumenting it is the only approach that can produce the missing signal". Never "this is generally best practice". If the evidence is too thin to ground a lead (an early project with little history), say so plainly in leadReason and lead with whatever most cheaply PRODUCES evidence; mark the recommendation as provisional.

Hard rules:
- NO MANUFACTURED CONFIDENCE. Thin evidence means the honest lead is the cheapest signal-generating move, stated as provisional.
- THE BUSINESS CONSTRAINTS ARE ABSOLUTE. No approach may break one, even to answer the question faster.
- If the shared stuck-signal reports the focus is stuck, treat the current line as failing: your gating question or approaches should reckon with why, not restate last quarter's bet.

Respond with ONLY a JSON object, no preamble, no markdown fences, matching exactly:
{
  "gatingQuestion": string,
  "approaches": [ { "title": string, "rationale": string, "successSignal": string } ],
  "leadIndex": number,
  "leadReason": string
}`;

function metricsLine(m: Record<string, number | undefined>): string {
  const e = Object.entries(m);
  return e.length ? e.map(([k, v]) => `${k}=${v}`).join(", ") : "(none reported)";
}

function render(input: AdvisorInput): string {
  // Oldest -> newest so the arc of the project is legible.
  const weeks = [...input.weeks].sort((a, b) => (a.weekOf < b.weekOf ? -1 : 1));
  const history = weeks.length
    ? weeks
        .map((w) => {
          const move = w.recommendation
            ? ` | move: ${w.recommendation.oneMove}${
                w.recommendation.critique
                  ? ` (critic ${w.recommendation.critique.endorses ? "endorsed" : "rejected"})`
                  : ""
              }`
            : "";
          return `  ${w.weekOf}: ${metricsLine(w.metrics)}${move}`;
        })
        .join("\n")
    : "  (no weeks logged yet — this is an early project)";

  return [
    `OVERALL GOAL: ${input.overallGoal}`,
    `CONSTRAINTS (absolute):`,
    ...input.constraints.map((c) => `  - ${c}`),
    ``,
    `FOCUS PROJECT: ${input.projectName} — ${input.projectDescription}`,
    `SUCCESS LOOKS LIKE: ${input.successLooksLike}`,
    ``,
    `WEEK HISTORY (oldest first):`,
    history,
    ``,
    `STUCK-SIGNAL (mechanical, shared with the Manager): ${
      input.stuck.stuck ? "STUCK" : "not stuck"
    } — ${input.stuck.reason}`,
    input.lastQuarterJudgment
      ? `LAST QUARTER'S JUDGMENT: question ${
          input.lastQuarterJudgment.questionAnswered ? "ANSWERED" : "NOT answered"
        } — ${input.lastQuarterJudgment.assessment}`
      : `LAST QUARTER: none (first quarter for this project).`,
  ].join("\n");
}

function coerceApproach(a: unknown): Approach {
  const o = (a ?? {}) as Record<string, unknown>;
  return {
    title: String(o.title ?? ""),
    rationale: String(o.rationale ?? ""),
    successSignal: String(o.successSignal ?? ""),
  };
}

function coerce(raw: string): AdvisorReport {
  const p = JSON.parse(stripJsonFences(raw));
  const approaches: Approach[] = Array.isArray(p.approaches)
    ? p.approaches.map(coerceApproach)
    : [];
  if (approaches.length === 0) throw new Error("advisor returned no approaches");
  // Clamp the lead into range so a bad index never points off the array.
  const rawLead = Number.isInteger(p.leadIndex) ? Number(p.leadIndex) : 0;
  const leadIndex = Math.min(Math.max(rawLead, 0), approaches.length - 1);
  return {
    gatingQuestion: String(p.gatingQuestion ?? ""),
    approaches,
    leadIndex,
    leadReason: String(p.leadReason ?? ""),
  };
}

export async function advise(input: AdvisorInput): Promise<AdvisorReport> {
  const msg = await claude().messages.create({
    model: MODEL_ADVISOR,
    max_tokens: 2000,
    system: SYSTEM,
    messages: [{ role: "user", content: render(input) }],
  });
  const t = msg.content.find((b: { type: string }) => b.type === "text");
  if (!t || t.type !== "text") throw new Error("no text in advisor response");
  return coerce(t.text);
}

// The Critic. Runs AFTER the Synthesiser, on the TOP model (it must be at least
// as sharp as the thing it audits, or it rubber-stamps). It is prompted to
// genuinely oppose the proposed move: find the breach, the unsupported leap, the
// vanity reasoning. It does NOT propose its own move — keeping it adversarial,
// not a second decision-maker.
//
// This is the one place independent opposition matters (Model B's only real
// virtue), realised inside the single-accountable-voice design (Model A) as a
// prompt stance rather than an independent agent with its own agenda.

import { AgentContext, Recommendation, CriticReport } from "@/lib/model";
import { claude, MODEL_CRITIC } from "@/lib/anthropic";

const SYSTEM = `You are the Critic. A recommendation has been produced for the CEO. Your job is to attack it before the CEO sees it — not to be agreeable. A move you wave through that later fails is your failure.

Judge the proposed move against three things:
1. THE CONSTRAINTS. If the move breaks any stated business constraint, name which. Constraints are absolute; a breach alone is grounds to refuse endorsement.
2. THE EVIDENCE. Look at the analyst findings. Is the move actually supported by what the data shows, or is it a guess wearing the costume of a decision? If the findings carry small-sample cautions and the move ignores them, say so. If there are no findings and the move asserts a trend, that is a guess.
3. THE SUB-GOAL. Does this move actually advance the current sub-goal, or is it plausible-sounding activity that does not move the needle?

Rules:
- Name ONE chief objection, the most serious. Do not pad with minor quibbles to look thorough. If you genuinely cannot fault it, chiefObjection is null and you endorse.
- Do not propose an alternative move. That is not your job. Critique what is in front of you.
- Be specific. "Could be stronger" is useless. Name the actual flaw.

Respond with ONLY a JSON object, no preamble, no fences:
{
  "chiefObjection": string | null,
  "constraintBreach": string | null,
  "evidenceVerdict": string,
  "endorses": boolean
}`;

function render(ctx: AgentContext, rec: Recommendation): string {
  const f = ctx.analystFindings;
  const findings = f
    ? [
        ...f.observations.map((o) => `  observation: ${o}`),
        ...f.conversions.map((c) => `  conversion: ${c}`),
        ...f.movements.map((m) => `  movement: ${m}`),
        ...f.cautions.map((c) => `  CAUTION: ${c}`),
      ].join("\n")
    : "  (no analyst findings this week)";
  return [
    `CONSTRAINTS (absolute):`,
    ...ctx.constraints.map((c) => `  - ${c}`),
    ``,
    `CURRENT SUB-GOAL: ${ctx.currentSubGoal}`,
    ``,
    `ANALYST FINDINGS:`,
    findings,
    ``,
    `PROPOSED MOVE: ${rec.oneMove}`,
    `RATIONALE GIVEN: ${rec.rationale}`,
    `TRADE-OFF GIVEN: ${rec.tradeOff}`,
  ].join("\n");
}

function coerce(raw: string): CriticReport {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const p = JSON.parse(cleaned);
  return {
    chiefObjection:
      p.chiefObjection === null || p.chiefObjection === undefined ? null : String(p.chiefObjection),
    constraintBreach:
      p.constraintBreach === null || p.constraintBreach === undefined ? null : String(p.constraintBreach),
    evidenceVerdict: String(p.evidenceVerdict ?? ""),
    endorses: Boolean(p.endorses),
  };
}

export async function critique(ctx: AgentContext, rec: Recommendation): Promise<CriticReport> {
  const msg = await claude().messages.create({
    model: MODEL_CRITIC,
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{ role: "user", content: render(ctx, rec) }],
  });
  const t = msg.content.find((b: { type: string }) => b.type === "text");
  if (!t || t.type !== "text") throw new Error("no text in critic response");
  return coerce(t.text);
}

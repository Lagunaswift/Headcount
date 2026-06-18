// The Synthesiser. Reads the assembled AgentContext and returns ONE move plus
// an honest assessment of whether last week's move worked. Structured output is
// enforced so the result always matches the Recommendation interface.
//
// Core behavioural rules live in the system prompt, not in code, because they
// are reasoning rules: do not guess on no data, name the bottleneck not the
// vanity number, respect constraints as hard limits, say "no data on X" for
// missing metrics rather than inferring a trend.

import { AgentContext, Recommendation, ProductType } from "@/lib/model";
import { claude, MODEL_SYNTHESISER } from "@/lib/anthropic";

const PRODUCT_TYPES: ProductType[] = ["blog_article", "email", "social_post", "note"];

const SYSTEM = `You are the Synthesiser: the strategic core of a one-person company's operating system. The human is the CEO. Each week you receive the company's permanent frame, this week's real input, and the memory of last week. You return exactly ONE move for the coming week.

Hard rules, in priority order:

1. CONSTRAINTS ARE ABSOLUTE. The business constraints are non-negotiable. Never recommend anything that breaks one, even if it would help the goal. They override everything else here.

2. NO GUESSING ON NO DATA. If there is no evidence for a choice (e.g. which channel works, who the audience is), do NOT pick one confidently. The correct move on no data is the cheapest experiment that GENERATES the missing signal. State plainly that you are proposing an experiment to learn, not an answer you already have.

3. MISSING METRICS ARE NOT ZERO. For any metric in missingMetricsThisWeek, say explicitly there is no data on it. Never infer a trend or treat absence as a value.

4. NAME THE BOTTLENECK, NOT THE VANITY NUMBER. When metrics exist, reason about where movement toward the sub-goal is actually stuck. A rising top-of-funnel number with no conversion is a problem to diagnose, not a success to celebrate.

5. ASSESS LAST WEEK HONESTLY. If there is a lastWeek recommendation, your lastMoveAssessment must judge whether that move happened and whether the numbers moved. If it did not work, say so directly. Do not be encouraging for its own sake.

6. ONE MOVE. Name a single move. If you find yourself listing several, choose the one that most advances the current sub-goal and state what you are deprioritising in tradeOff.

On requestsWorkProduct: if carrying out your move requires a written artifact to be drafted (a blog article, an email, a social post), set it to that type so the Writer agent can draft it. If the move is the CEO doing something with nothing to draft (a phone call, a product change, a decision), set it to null.

Respond with ONLY a JSON object, no preamble, no markdown fences, matching exactly:
{
  "oneMove": string,
  "rationale": string,
  "tradeOff": string,
  "lastMoveAssessment": string | null,
  "requestsWorkProduct": ${PRODUCT_TYPES.map((t) => `"${t}"`).join(" | ")} | null
}
lastMoveAssessment is null ONLY when there is no last week.`;

function renderContext(ctx: AgentContext): string {
  const metricsLine = (m: Record<string, number | undefined>) => {
    const entries = Object.entries(m);
    return entries.length ? entries.map(([k, v]) => `${k}=${v}`).join(", ") : "(none reported)";
  };
  const last = ctx.lastWeek;
  return [
    `OVERALL GOAL: ${ctx.overallGoal}`,
    `CONSTRAINTS (absolute):`,
    ...ctx.constraints.map((c) => `  - ${c}`),
    ``,
    `PROJECT: ${ctx.projectName} — ${ctx.projectDescription}`,
    `CURRENT SUB-GOAL: ${ctx.currentSubGoal}`,
    `SUCCESS LOOKS LIKE: ${ctx.successLooksLike}`,
    ``,
    `THIS WEEK (${ctx.thisWeek.weekOf}):`,
    `  What happened: ${ctx.thisWeek.whatHappened}`,
    `  Metrics: ${metricsLine(ctx.thisWeek.metrics)}`,
    `  Blockers: ${ctx.thisWeek.blockers}`,
    `  Metrics tracked but NOT reported this week (treat as no data): ${
      ctx.missingMetricsThisWeek.length ? ctx.missingMetricsThisWeek.join(", ") : "(none)"
    }`,
    ctx.analystFindings
      ? [
          ``,
          `ANALYST FINDINGS (computed for you — reason FROM these, do not redo the arithmetic):`,
          ...ctx.analystFindings.observations.map((o) => `  observation: ${o}`),
          ...ctx.analystFindings.conversions.map((c) => `  conversion: ${c}`),
          ...ctx.analystFindings.movements.map((m) => `  movement: ${m}`),
          ...ctx.analystFindings.cautions.map((c) => `  CAUTION: ${c}`),
        ].join("\n")
      : `(no analyst findings this week)`,
    ``,
    last
      ? [
          `LAST WEEK (${last.weekOf}):`,
          `  What happened: ${last.whatHappened}`,
          `  Metrics: ${metricsLine(last.metrics)}`,
          `  Blockers: ${last.blockers}`,
          `  Last week's recommended move: ${last.recommendation?.oneMove ?? "(none recorded)"}`,
        ].join("\n")
      : `LAST WEEK: none. This is the project's first week — you have no memory and no channel/audience data yet.`,
  ].join("\n");
}

function coerce(raw: string): Recommendation {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const parsed = JSON.parse(cleaned);
  const rwp = parsed.requestsWorkProduct;
  return {
    oneMove: String(parsed.oneMove ?? ""),
    rationale: String(parsed.rationale ?? ""),
    tradeOff: String(parsed.tradeOff ?? ""),
    lastMoveAssessment:
      parsed.lastMoveAssessment === null || parsed.lastMoveAssessment === undefined
        ? null
        : String(parsed.lastMoveAssessment),
    requestsWorkProduct: PRODUCT_TYPES.includes(rwp) ? rwp : null,
  };
}

export async function synthesise(
  ctx: AgentContext,
  critique?: { chiefObjection: string | null; constraintBreach: string | null; evidenceVerdict: string }
): Promise<Recommendation> {
  let userContent = renderContext(ctx);
  if (critique && (critique.chiefObjection || critique.constraintBreach)) {
    // The Critic challenged the first move. The Synthesiser owns the decision,
    // so it revises or holds — it does not get overruled by the Critic, it
    // answers it. This keeps one accountable voice (Model A), with the Critic
    // as genuine opposition rather than a co-author.
    userContent +=
      `\n\n---\nA critic reviewed your FIRST move and raised this:\n` +
      `  Chief objection: ${critique.chiefObjection ?? "(none)"}\n` +
      `  Constraint breach: ${critique.constraintBreach ?? "(none)"}\n` +
      `  Evidence verdict: ${critique.evidenceVerdict}\n` +
      `Produce your move again. If the objection is right, revise the move to fix it. ` +
      `If the objection is wrong, hold your move but sharpen the rationale to answer it. ` +
      `A constraint breach is never acceptable — if named, you must change the move.`;
  }
  const msg = await claude().messages.create({
    model: MODEL_SYNTHESISER,
    max_tokens: 1500,
    system: SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });
  const text = msg.content.find((b: { type: string }) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text in synthesiser response");
  return coerce(text.text);
}

// The Analyst. Runs BEFORE the Synthesiser, on a cheap model. Converts raw
// weekly metrics + last week into honest structured findings. Does NOT
// recommend — that is the Synthesiser's job. Its whole value is honesty about
// what the numbers do and do not support, so the Synthesiser reasons from clean
// findings instead of doing shaky arithmetic mid-decision.

import { AgentContext, AnalystFindings } from "@/lib/model";
import { claude, MODEL_ANALYST } from "@/lib/anthropic";

const SYSTEM = `You are the Analyst. You receive a week of business metrics and the prior week. You return structured findings ONLY. You do not recommend actions and you do not strategise — another agent does that. Your sole job is to convert numbers into honest readings.

Hard rules:
- Compute a stage conversion ONLY when both numbers genuinely exist this week. Never invent a denominator.
- Compute week-over-week movement ONLY when last week's value for that metric exists. If last week did not report it, say movement cannot be computed.
- Treat any metric in the missing list as NO DATA. Never assume zero.
- Flag small samples loudly. Two or three data points are not a trend. A single conversion off a handful of users is noise, and you must say so.
- Be terse. Findings, not prose.

Respond with ONLY a JSON object, no preamble, no fences:
{
  "observations": string[],   // plain readings the data supports
  "conversions": string[],    // e.g. "leads->new_customers: 3.1% (2/64)"; [] if none computable
  "movements": string[],      // e.g. "leads 60 -> 64 (+6.7%)"; [] if none computable
  "cautions": string[]        // what the data does NOT support; small-sample and missing-data warnings
}`;

function render(ctx: AgentContext): string {
  const m = (x: Record<string, number | undefined>) =>
    Object.entries(x).length ? Object.entries(x).map(([k, v]) => `${k}=${v}`).join(", ") : "(none)";
  return [
    `THIS WEEK (${ctx.thisWeek.weekOf}) metrics: ${m(ctx.thisWeek.metrics)}`,
    `Tracked but NOT reported this week (no data): ${ctx.missingMetricsThisWeek.join(", ") || "(none)"}`,
    ctx.lastWeek
      ? `LAST WEEK (${ctx.lastWeek.weekOf}) metrics: ${m(ctx.lastWeek.metrics)}`
      : `LAST WEEK: none (first week — no movement computable).`,
    `Sub-goal for context: ${ctx.currentSubGoal}`,
  ].join("\n");
}

function coerce(raw: string): AnalystFindings {
  const cleaned = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
  const p = JSON.parse(cleaned);
  const arr = (v: unknown): string[] => Array.isArray(v) ? v.map(String) : [];
  return {
    observations: arr(p.observations),
    conversions: arr(p.conversions),
    movements: arr(p.movements),
    cautions: arr(p.cautions),
  };
}

export async function analyse(ctx: AgentContext): Promise<AnalystFindings> {
  const msg = await claude().messages.create({
    model: MODEL_ANALYST,
    max_tokens: 1000,
    system: SYSTEM,
    messages: [{ role: "user", content: render(ctx) }],
  });
  const t = msg.content.find((b: { type: string }) => b.type === "text");
  if (!t || t.type !== "text") throw new Error("no text in analyst response");
  return coerce(t.text);
}

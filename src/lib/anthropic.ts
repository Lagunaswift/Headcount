// Single place the Claude client and model tiers are configured. Server-only.
//
// Model tiers, placed by task weight — NOT a pipeline everything climbs.
// Each agent runs on the cheapest model that can do its specific job.
// Escalation (draft-cheap, review-expensive) happens only for high-stakes
// outputs, never by default.
import Anthropic from "@anthropic-ai/sdk";

export const MODELS = {
  // Bounded, mechanical work: arithmetic, extraction, structured findings.
  cheap: "claude-haiku-4-5",
  // Mid: competent prose for low-stakes copy (short outreach, social posts).
  mid: "claude-sonnet-4-6",
  // Judgment and high-stakes prose: the decision, the critique, long-form.
  top: "claude-opus-4-8",
} as const;

export type ModelTier = keyof typeof MODELS;

// Per-agent defaults. The decision is never cheaped out on; the analyst is
// mechanical so it runs cheap; the writer picks per task (see writer.ts).
export const MODEL_SYNTHESISER = MODELS.top;   // the decision — always top
export const MODEL_ANALYST = MODELS.cheap;     // numbers in, findings out
export const MODEL_CRITIC = MODELS.top;        // must be as sharp as what it audits

export function claude(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey });
}

export function firstText(msg: Anthropic.Message): string {
  const block = msg.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

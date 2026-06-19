// The Writer. Drafts ONE artifact serving a recommended move, in the business's
// voice. Free rein on the prose; the structure lives only in the returned
// envelope, never in the body. The constraints ARE the voice spec.
//
// Output split: the model returns a small JSON head (title/subject/etc — the
// ProductMeta) followed by a sentinel and then the raw body prose. We keep body
// OUT of the JSON so the model is never tempted to escape, truncate, or shape it
// into fields. Structure governs delivery; it must never structure the prose.

import { WriterContext, ProductMeta } from "@/lib/model";
import { claude, MODELS } from "@/lib/anthropic";

const SENTINEL = "===BODY BELOW THIS LINE===";

const VOICE_RULES = `Writing standards (apply all):
- Lead with the point. No throat-clearing, no preamble, no "in today's world".
- No "it is not X, it is Y" constructions. State the positive claim.
- No groups of three for rhythm. No anaphora. No relabelled repeats.
- No hollow intensifiers (very, truly, incredibly). No filler (delve, unpack, leverage, foster, elevate, robust, seamless, game-changer).
- No fake authority ("studies show" without a named study).
- Short paragraphs, 2-3 sentences. Every sentence earns its place.
- Write like a specific competent human, not a model padding a word count.`;

function system(ctx: WriterContext): string {
  return `You are the Writer for a one-person company. You draft one finished artifact at a time, in the company's voice, to carry out a specific move the CEO has approved.

THE BUSINESS CONSTRAINTS ARE YOUR VOICE SPEC AND ARE ABSOLUTE:
${ctx.constraints.map((c) => `  - ${c}`).join("\n")}

${VOICE_RULES}

You are producing a ${ctx.productType.replace("_", " ")}.

Respond in this exact shape and nothing else:
1. First, a single line of JSON containing only delivery metadata for this artifact type. For blog_article: {"title": "..."}. For email: {"subject": "...", "to": []}. For social_post: {"platform": "instagram|x|linkedin"}. For note: {}.
2. Then a line containing exactly: ${SENTINEL}
3. Then the full artifact body as plain prose. No markdown fences, no commentary, no sign-off about what you wrote. Just the artifact itself.`;
}

function userPrompt(ctx: WriterContext): string {
  const base = [
    `OVERALL GOAL: ${ctx.overallGoal}`,
    `CURRENT SUB-GOAL: ${ctx.currentSubGoal}`,
    `THE MOVE THIS ARTIFACT SERVES: ${ctx.theMove}`,
  ];
  if (ctx.revising) {
    base.push(
      ``,
      `THIS IS A REVISION. The previous draft was rejected with this note:`,
      `  "${ctx.revising.rejectionNote}"`,
      `Previous draft:`,
      ctx.revising.previousBody,
      ``,
      `Rewrite to address the rejection note. Do not merely tweak; fix the actual problem raised.`
    );
  }
  return base.join("\n");
}

export interface WriterOutput {
  body: string;
  meta: ProductMeta;
}

function splitOutput(raw: string): WriterOutput {
  const idx = raw.indexOf(SENTINEL);
  if (idx === -1) {
    // Model ignored the sentinel; treat the whole thing as body, no meta.
    return { body: raw.trim(), meta: {} };
  }
  const head = raw.slice(0, idx).trim();
  const body = raw.slice(idx + SENTINEL.length).trim();
  let meta: ProductMeta = {};
  try {
    const cleaned = head.replace(/```json/gi, "").replace(/```/g, "").trim();
    if (cleaned) meta = JSON.parse(cleaned) as ProductMeta;
  } catch {
    meta = {}; // bad head is non-fatal; body is what matters
  }
  return { body, meta };
}


// Which tier drafts which product. Bounded/low-stakes copy gets the mid model;
// a blog article (public, voice-heavy, high cost if weak) gets the top model.
// This is the per-task placement, NOT a pipeline everything climbs.
function draftModel(type: WriterContext["productType"]): string {
  switch (type) {
    case "blog_article":
      return MODELS.top;        // long-form, public, voice carries weight
    case "email":
    case "social_post":
      return MODELS.mid;        // competent short copy, low stakes
    case "note":
    default:
      return MODELS.mid;
  }
}

// High-stakes outputs get drafted then reviewed by the top model before they
// ever reach the operator's approval queue. Review scales with cost-of-wrong,
// so only long-form public artifacts trigger it. Everything else skips it.
function needsReview(type: WriterContext["productType"]): boolean {
  return type === "blog_article";
}

const REVIEW_SYSTEM = `You are a senior editor reviewing a draft before it reaches the founder. Improve it in place against these non-negotiable voice constraints, fixing any breach and tightening weak writing. Return ONLY the improved body prose — no commentary, no JSON, no fences. If the draft is already strong, return it largely unchanged.`;

async function reviewBody(constraints: string[], body: string): Promise<string> {
  const msg = await claude().messages.create({
    model: MODELS.top,
    max_tokens: 4000,
    system: `${REVIEW_SYSTEM}\n\nConstraints:\n${constraints.map((c) => `  - ${c}`).join("\n")}`,
    messages: [{ role: "user", content: body }],
  });
  const t = msg.content.find((b: { type: string }) => b.type === "text");
  return t && t.type === "text" ? t.text.trim() : body;
}

export async function write(ctx: WriterContext): Promise<WriterOutput> {
  const msg = await claude().messages.create({
    model: draftModel(ctx.productType),
    max_tokens: 4000,
    system: system(ctx),
    messages: [{ role: "user", content: userPrompt(ctx) }],
  });
  const text = msg.content.find((b: { type: string }) => b.type === "text");
  if (!text || text.type !== "text") throw new Error("no text in writer response");
  const out = splitOutput(text.text);

  // High-stakes only: draft-cheap, then review with the top model before the
  // operator ever sees it. Low-stakes copy returns straight from the draft.
  if (needsReview(ctx.productType)) {
    out.body = await reviewBody(ctx.constraints, out.body);
  }
  return out;
}

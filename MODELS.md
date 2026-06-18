# Model tiering and the agent chain

## The chain (each agent on its right tier)

```
context ─▶ Analyst (Haiku)  ─▶ findings folded into context
                               │
                               ▼
                          Synthesiser (Opus) ─▶ first move
                               │
                               ▼
                          Critic (Opus) ─▶ challenges the move
                               │
                  not endorsed │ (or constraint breach)
                               ▼
                          Synthesiser (Opus) ─▶ revises ONCE, answering the critique
                               │
                               ▼
                          move + critique saved to the week
                               │
              requestsWorkProduct │
                               ▼
                          Writer ─▶ drafts (model by task), high-stakes drafts
                                    are Opus-reviewed before the approval queue
                                    ─▶ lands as DRAFT (rung zero)
```

## Why these tiers (not a pipeline everything climbs)

Each agent runs on the cheapest model that can do ITS job. Escalation happens
only on a triggered condition, never by default.

- **Analyst → Haiku.** Bounded, mechanical: conversions, deltas, small-sample
  flags. No judgment. Runs every week, cheap.
- **Synthesiser → Opus.** The decision. Never cheaped out on; everything
  downstream inherits its judgment.
- **Critic → Opus.** Must be at least as sharp as what it audits or it
  rubber-stamps. A cheap critic reviewing an Opus move is theatre.
- **Writer → by task.** Short/low-stakes copy (email, social, note) runs Sonnet.
  Long-form public prose (blog_article) runs Opus AND gets a top-model review
  pass before you ever see it. Review scales with cost-of-being-wrong.

## Why one revision, not a loop

The Critic challenges once; the Synthesiser revises once, answering it. No
unbounded back-and-forth. The Synthesiser stays the single accountable voice —
the Critic is genuine opposition, not a co-author. A named constraint breach
always forces a revision; a mere objection lets the Synthesiser hold its move
but sharpen the rationale.

## Cost shape

A normal week with no work product: 1 Haiku + 1 Opus (+ 1 Opus critic, + maybe
1 Opus revision). A week that drafts a blog article adds 1 Opus draft + 1 Opus
review. Short-copy weeks add only a Sonnet call. You are not paying Opus to
review trivial work, and no agent watches another agent for its own sake.

## To change tiers

All model choices live in `src/lib/anthropic.ts` (`MODELS`, `MODEL_*`) and the
two pickers in `src/agents/writer.ts` (`draftModel`, `needsReview`). Nothing
else needs touching.

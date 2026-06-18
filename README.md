# Agentic Company — MVP skeleton

A business that runs as a weekly loop. You are the CEO. Each week you log what
happened; the **Synthesiser** names one move and judges whether last week's move
worked; if the move needs something written, the **Writer** drafts it for your
approval.

## Run it in 60 seconds (no Firestore needed)

```bash
cp .env.local.example .env.local
# put your ANTHROPIC_API_KEY in .env.local; leave STORE_BACKEND=memory
npm install
npm run dev
```

Open http://localhost:3000 → "Seed AthleticHive example" → open the project →
log a week → "Run the week".

In memory mode, data resets on server restart. That is intentional for early
dogfooding.

## Switch to Firestore (persistent)

1. Create a Firebase project, enable Firestore.
2. Generate a service account key (JSON).
3. base64-encode it and put it in `FIREBASE_SERVICE_ACCOUNT_B64`, or point
   `GOOGLE_APPLICATION_CREDENTIALS` at the file.
4. Set `STORE_BACKEND=firestore` in `.env.local`.

Same interface backs both — nothing else changes.

## What's wired

- `src/lib/model.ts` — the data model (Business → Project → Week, WorkProduct, trust ladder).
- `src/lib/store*.ts` — TeamStore interface + in-memory and Firestore backends.
- `src/agents/synthesiser.ts` — decides ONE move; structured output; will not guess on no data.
- `src/agents/writer.ts` — drafts artifacts in voice; constraints are the voice spec.
- `src/app/api/synthesise/route.ts` — the loop: context → recommendation → (maybe) draft.
- `src/app/project/[id]/page.tsx` — the weekly flow you click through.


## Model tiers (cost matched to task)

Each agent runs on the cheapest model that can do its job. This is NOT a pipeline
everything climbs — escalation only happens for high-stakes outputs.

- **Analyst** → Haiku 4.5. Bounded arithmetic and structured findings.
- **Writer** → Sonnet 4.6 for short copy (email, social); Opus 4.8 for blog
  articles (public, voice-heavy).
- **Synthesiser** → Opus 4.8, always. The decision is never cheaped out on.
- **Critic** (when added) → Opus 4.8. Must be as sharp as what it audits.

**Draft-cheap, review-expensive** applies to blog articles only: Sonnet/Opus
drafts, then Opus reviews against the voice constraints before the draft reaches
your approval queue. Low-stakes copy skips review. Tiers live in
`src/lib/anthropic.ts`; the Writer's per-task choice is in `src/agents/writer.ts`.

## The loop now (with Analyst)

1. assemble context
2. **Analyst (Haiku)** turns raw metrics into honest findings — conversions,
   movements, and explicit cautions (small samples, missing data)
3. **Synthesiser (Opus)** reasons FROM those findings, names one move, assesses
   last week
4. if the move needs writing, **Writer** drafts it (model by type, review if
   high-stakes), lands in `draft`

The Critic and the Writer-split are designed but not built — add them when real
weeks show the strain, per the sequencing rule. The Analyst is built because the
funnel/arithmetic strain is already visible.

## Trust ladder (autonomy)

Every drafted artifact lands in `draft`. Nothing leaves draft without you
(rung zero). Loosening this later is a config change in `RUNG_ZERO_POLICY`
(`model.ts`), not a rewrite.

## Known gaps (deliberate, for next steps)

- **Revision loop**: rejecting a draft records the reason but does not yet
  auto-rerun the Writer with it. The `WriterContext.revising` slot exists for this.
- **Funnel model**: metrics are flat counts. Reasoning about which conversion
  STEP is the bottleneck (lead→signup→activated→paid) has no structural support
  yet. Run a few real weeks before modelling it.
- **Auth / multi-tenancy**: single-user. Required before this is a product for
  other businesses.
- **No tests for live agent output**: agent wiring is type-checked and the loop
  logic is tested with stubs; the prompts themselves need real-key eval.

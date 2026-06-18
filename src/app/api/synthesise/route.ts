// THE LOOP — full chain, each agent on its right model tier.
//   1. assemble context
//   2. Analyst (cheap)      -> findings, folded into context
//   3. Synthesiser (top)    -> first move
//   4. Critic (top)         -> challenges the move
//   5. if not endorsed: Synthesiser revises ONCE answering the critique
//   6. save move + critique onto the week
//   7. if it requests a work product -> Writer drafts (model by task) -> draft
//      (rung zero: lands in "draft"; high-stakes drafts are top-model reviewed
//       inside the Writer before they ever reach the operator)
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import { analyse } from "@/agents/analyst";
import { synthesise } from "@/agents/synthesiser";
import { critique as runCritic } from "@/agents/critic";
import { write } from "@/agents/writer";
import { WriterContext, AgentContext } from "@/lib/model";

export async function POST(req: Request) {
  const store = getStore();
  const { projectId, weekId, weekOf } = await req.json();

  // 1 + 2: context, then Analyst findings folded in.
  const base = await store.buildAgentContext(projectId, weekOf);
  const findings = await analyse(base);
  const ctx: AgentContext = { ...base, analystFindings: findings };

  // 3: first move.
  let rec = await synthesise(ctx);

  // 4: Critic challenges it.
  const report = await runCritic(ctx, rec);

  // 5: revise once if the Critic did not endorse (or flagged a breach).
  if (!report.endorses || report.constraintBreach) {
    rec = await synthesise(ctx, {
      chiefObjection: report.chiefObjection,
      constraintBreach: report.constraintBreach,
      evidenceVerdict: report.evidenceVerdict,
    });
  }

  // 6: attach the critique to the move and persist.
  rec.critique = report;
  await store.saveRecommendation(weekId, rec);

  // 7: draft a work product if the move calls for one.
  let product = null;
  if (rec.requestsWorkProduct) {
    const writerCtx: WriterContext = {
      constraints: ctx.constraints,
      overallGoal: ctx.overallGoal,
      currentSubGoal: ctx.currentSubGoal,
      theMove: rec.oneMove,
      productType: rec.requestsWorkProduct,
      revising: null,
    };
    const out = await write(writerCtx);
    product = await store.saveProduct({
      projectId,
      weekId,
      fromRecommendation: true,
      type: rec.requestsWorkProduct,
      author: "writer",
      status: "draft", // rung zero
      body: out.body,
      meta: out.meta,
      review: null,
      version: 1,
      supersedes: null,
    });
  }

  return NextResponse.json({ recommendation: rec, findings, critique: report, product });
}

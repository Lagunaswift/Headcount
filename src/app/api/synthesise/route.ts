// THE LOOP — full chain, each agent on its right model tier.
//   0. mode gate: dark rejects, maintenance records only, focus runs the chain
//   1. assemble context (focus only), with the sub-goal DERIVED from the
//      chosen approach (the loop runs on rails once an approach is picked)
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
import { planWeeklyRun } from "@/agents/subgoal";
import { WriterContext, AgentContext } from "@/lib/model";

export async function POST(req: Request) {
  const store = await getStore();
  const { projectId, weekId, weekOf } = await req.json();

  // 0: mode gate. The weekly loop now behaves per project mode (set quarterly
  // by the operator/Manager). dark takes no input; maintenance logs the numbers
  // (the week was already added client-side) but produces no move; only focus
  // runs the full chain.
  const project = await store.getProject(projectId);
  const weeks = await store.getWeeks(projectId);
  const lastWeek = weeks.find((w) => w.weekOf < weekOf) ?? null;
  const plan = planWeeklyRun(project, lastWeek);
  if (plan.kind === "reject") {
    return NextResponse.json({ error: plan.message }, { status: plan.status });
  }
  if (plan.kind === "record") {
    return NextResponse.json({ mode: "maintenance", recorded: true });
  }

  // 1 + 2: context (with the derived sub-goal), then Analyst findings folded in.
  const base = await store.buildAgentContext(projectId, weekOf);
  const ctx: AgentContext = { ...base, currentSubGoal: plan.subGoal };
  const findings = await analyse(ctx);
  ctx.analystFindings = findings;

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

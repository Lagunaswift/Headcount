// Run the Manager for a business: which project should be focus next quarter,
// what mode each other runs in, and (if pulled forward) cut-vs-hold on the
// stuck focus. Returns a ManagerReport; does NOT apply it — the operator applies
// via /api/quarters/focus. Needs a key.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import { manage, type ManagerInput, type ManagerProjectView } from "@/agents/manager";
import { computeStuckSignal } from "@/lib/stuck";
import type { Week } from "@/lib/model";

export async function POST(req: Request) {
  const store = await getStore();
  const { businessId, pullForward } = await req.json();
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }
  const business = await store.getBusiness(businessId);
  const quarter = await store.getOpenQuarter(businessId);
  const focusProjectId = quarter?.focusProjectId ?? null;
  const projects = await store.getProjectsForBusiness(businessId);

  const views: ManagerProjectView[] = [];
  let focusWeeks: Week[] = [];
  let focusChosen = null;
  for (const p of projects) {
    const weeks = await store.getWeeks(p.id); // most-recent-first
    if (p.id === focusProjectId) {
      focusWeeks = weeks;
      focusChosen = p.chosenApproach;
    }
    views.push({
      id: p.id,
      name: p.name,
      description: p.description,
      mode: p.mode,
      currentSubGoal: p.currentSubGoal,
      gatingQuestion: p.gatingQuestion,
      recentWeeks: weeks.slice(0, 4),
    });
  }

  const stuck = computeStuckSignal(focusWeeks, focusChosen);
  const input: ManagerInput = {
    businessName: business.name,
    overallGoal: business.overallGoal,
    constraints: business.constraints,
    projects: views,
    focusProjectId,
    stuck,
    lastQuarterJudgment: null,
    pulledForward: !!pullForward,
  };

  const report = await manage(input);
  return NextResponse.json({ report, stuck });
}

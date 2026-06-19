// Run the Advisor for a focus project. Returns an AdvisorReport; does NOT apply
// it — the operator picks an approach via /api/quarters/approach. Needs a key.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import { advise, type AdvisorInput } from "@/agents/advisor";
import { computeStuckSignal } from "@/lib/stuck";

export async function POST(req: Request) {
  const store = await getStore();
  const { projectId } = await req.json();
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const project = await store.getProject(projectId);
  const business = await store.getBusiness(project.businessId);
  const weeks = await store.getWeeks(projectId);

  // The Advisor and the Manager read the SAME mechanical stuck-signal.
  const stuck = computeStuckSignal(weeks, project.chosenApproach);

  const input: AdvisorInput = {
    overallGoal: business.overallGoal,
    constraints: business.constraints,
    projectName: project.name,
    projectDescription: project.description,
    successLooksLike: project.successLooksLike,
    weeks,
    // Prior-quarter judgment carry-forward is a later enhancement (needs a
    // closed-quarter lookup); the Advisor handles null as "first quarter".
    lastQuarterJudgment: null,
    stuck,
  };

  const report = await advise(input);
  return NextResponse.json({ report });
}

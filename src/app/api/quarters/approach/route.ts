// The operator picks an approach (the Advisor's lead or an alternative). Writes
// chosenApproach + gatingQuestion onto the project; weekly sub-goals then derive
// from it. No model call — this is an operator gate.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import type { ChosenApproach } from "@/lib/model";

export async function POST(req: Request) {
  const store = await getStore();
  const { projectId, gatingQuestion, approach } = await req.json();
  if (!projectId || !gatingQuestion || !approach) {
    return NextResponse.json(
      { error: "projectId, gatingQuestion and approach are required" },
      { status: 400 }
    );
  }
  const project = await store.getProject(projectId);
  const quarter = await store.getOpenQuarter(project.businessId);
  if (!quarter) {
    return NextResponse.json(
      { error: "no open quarter — open one before choosing an approach" },
      { status: 400 }
    );
  }
  const chosen: ChosenApproach = {
    fromQuarter: quarter.id,
    gatingQuestion: String(gatingQuestion),
    approach: {
      title: String(approach.title ?? ""),
      rationale: String(approach.rationale ?? ""),
      successSignal: String(approach.successSignal ?? ""),
    },
    chosenAt: Date.now(),
  };
  const updated = await store.setProjectApproach(projectId, chosen.gatingQuestion, chosen);
  return NextResponse.json({ project: updated });
}

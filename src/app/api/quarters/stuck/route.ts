// The current stuck-signal for a project. The UI shows this on the focus project
// and surfaces the "Pull focus forward" action when stuck:true. No key — this is
// the shared mechanical computation, not an LLM judgment.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import { computeStuckSignal } from "@/lib/stuck";

export async function GET(req: Request) {
  const store = await getStore();
  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const project = await store.getProject(projectId);
  const weeks = await store.getWeeks(projectId);
  const stuck = computeStuckSignal(weeks, project.chosenApproach);
  return NextResponse.json({ stuck });
}

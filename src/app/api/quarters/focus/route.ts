// The operator applies the focus choice + per-project modes for the quarter.
// Writes them onto the quarter AND onto each Project.mode (the weekly loop reads
// Project.mode). The focus project is always forced to "focus". No key.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import type { ProjectMode } from "@/lib/model";

const MODES: ProjectMode[] = ["focus", "maintenance", "dark"];

export async function POST(req: Request) {
  const store = await getStore();
  const { quarterId, focusProjectId, projectModes } = await req.json();
  if (!quarterId || !focusProjectId || typeof projectModes !== "object" || !projectModes) {
    return NextResponse.json(
      { error: "quarterId, focusProjectId and projectModes are required" },
      { status: 400 }
    );
  }

  // Normalise: keep only valid modes, and force the focus project to "focus".
  const modes: Record<string, ProjectMode> = {};
  for (const [pid, m] of Object.entries(projectModes as Record<string, unknown>)) {
    if (MODES.includes(m as ProjectMode)) modes[pid] = m as ProjectMode;
  }
  modes[focusProjectId] = "focus";

  const quarter = await store.setQuarterFocus(quarterId, focusProjectId, modes);
  // The weekly loop gates on Project.mode, so apply each mode there too.
  for (const [pid, m] of Object.entries(modes)) {
    await store.setProjectMode(pid, m);
  }

  const projects = await store.getProjectsForBusiness(quarter.businessId);
  return NextResponse.json({ quarter, projects });
}

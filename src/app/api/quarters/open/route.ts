// Open a new quarter for a business. Only one open quarter at a time — if one
// is already open it is returned as-is. With a single project, that project is
// defaulted to focus so a solo operator never has to touch the Manager. No key.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import type { ProjectMode } from "@/lib/model";

function quarterLabel(d = new Date()): string {
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

// Read the open quarter without creating one (the UI polls this to render the
// quarter panel). Returns { quarter: null } when none is open.
export async function GET(req: Request) {
  const store = await getStore();
  const businessId = new URL(req.url).searchParams.get("businessId");
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }
  const quarter = await store.getOpenQuarter(businessId);
  return NextResponse.json({ quarter });
}

export async function POST(req: Request) {
  const store = await getStore();
  const { businessId, label } = await req.json();
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }

  const existing = await store.getOpenQuarter(businessId);
  if (existing) {
    return NextResponse.json({ quarter: existing, alreadyOpen: true });
  }

  const projects = await store.getProjectsForBusiness(businessId);
  const focusProjectId = projects.length === 1 ? projects[0].id : null;
  const projectModes: Record<string, ProjectMode> = {};
  if (focusProjectId) projectModes[focusProjectId] = "focus";

  const quarter = await store.createQuarter({
    businessId,
    label: typeof label === "string" && label ? label : quarterLabel(),
    startedAt: Date.now(),
    focusProjectId,
    projectModes,
    judgment: null,
    closed: false,
  });
  return NextResponse.json({ quarter });
}

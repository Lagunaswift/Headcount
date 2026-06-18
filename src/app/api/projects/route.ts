import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";

export async function GET(req: Request) {
  const store = getStore();
  const businessId = new URL(req.url).searchParams.get("businessId");
  if (!businessId) return NextResponse.json({ error: "businessId required" }, { status: 400 });
  const projects = await store.getProjectsForBusiness(businessId);
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const store = getStore();
  const b = await req.json();
  const project = await store.createProject({
    businessId: b.businessId,
    name: b.name,
    description: b.description,
    currentSubGoal: b.currentSubGoal,
    successLooksLike: b.successLooksLike,
    trackedMetrics: b.trackedMetrics ?? [],
  });
  return NextResponse.json({ project });
}

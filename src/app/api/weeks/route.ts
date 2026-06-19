import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";

export async function POST(req: Request) {
  const store = await getStore();
  const b = await req.json();
  // Strip undefined metric keys so absence is real absence (ground-truth rule).
  const metrics: Record<string, number> = {};
  for (const [k, v] of Object.entries(b.metrics ?? {})) {
    if (v !== undefined && v !== null && v !== "" && !Number.isNaN(Number(v))) {
      metrics[k] = Number(v);
    }
  }
  const week = await store.addWeek({
    projectId: b.projectId,
    weekOf: b.weekOf,
    whatHappened: b.whatHappened ?? "",
    metrics,
    blockers: b.blockers ?? "",
  });
  return NextResponse.json({ week });
}

// One-click seed: AthleticHive + the "First 50 paying users" project. Idempotent
// enough for dogfooding — calling twice creates a second copy, which is fine in
// memory mode. Returns the created ids.
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";

export async function POST() {
  const store = await getStore();
  const biz = await store.createBusiness({
    name: "AthleticHive",
    overallGoal: "Reach a sustainable base of paying subscribers.",
    constraints: [
      "Evidence-based claims only. No fabricated transformations or fake urgency.",
      "Respect that serious hybrid athletes already own Garmin and WHOOP. Do not pitch on having more metrics.",
      "Plain, direct voice. No hype words.",
    ],
  });
  const project = await store.createProject({
    businessId: biz.id,
    name: "First 50 paying users",
    description: "Take AthleticHive from a handful of users to 50 paying subscribers.",
    currentSubGoal: "Reach 50 paying subscribers.",
    successLooksLike:
      "50 active paid subscriptions. Leading indicator: users who log 3+ workouts in week one.",
    // Pre-ads: no spend tracked yet. Funnel steps tracked as flat counts for now.
    trackedMetrics: ["leads", "new_customers", "active_customers", "revenue"],
  });
  return NextResponse.json({ businessId: biz.id, projectId: project.id });
}

// Close the open quarter: the Manager judges whether the focus project's gating
// question got answered and whether the quarter moved the business or just
// generated activity, then the quarter is marked closed. `pulledForward` is true
// when the stuck-signal forced an early close. Needs a key (runs the Manager).
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import { judgeQuarter, type JudgeInput } from "@/agents/manager";
import { computeStuckSignal } from "@/lib/stuck";

export async function POST(req: Request) {
  const store = await getStore();
  const { businessId, pulledForward } = await req.json();
  if (!businessId) {
    return NextResponse.json({ error: "businessId required" }, { status: 400 });
  }
  const business = await store.getBusiness(businessId);
  const quarter = await store.getOpenQuarter(businessId);
  if (!quarter) {
    return NextResponse.json({ error: "no open quarter to close" }, { status: 400 });
  }

  const focus = quarter.focusProjectId ? await store.getProject(quarter.focusProjectId) : null;
  const weeks = focus ? await store.getWeeks(focus.id) : [];
  const stuck = computeStuckSignal(weeks, focus?.chosenApproach ?? null);

  const input: JudgeInput = {
    businessName: business.name,
    focusProjectName: focus?.name ?? null,
    gatingQuestion: focus?.gatingQuestion ?? null,
    successLooksLike: focus?.successLooksLike ?? null,
    weeks,
    stuck,
    pulledForward: !!pulledForward,
  };

  const judgment = await judgeQuarter(input);
  const closed = await store.closeQuarter(quarter.id, judgment);
  return NextResponse.json({ quarter: closed, judgment });
}

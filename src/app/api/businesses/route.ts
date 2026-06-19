import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";

export async function GET() {
  const store = await getStore();
  const businesses = await store.listBusinesses();
  return NextResponse.json({ businesses });
}

export async function POST(req: Request) {
  const store = await getStore();
  const body = await req.json();
  const biz = await store.createBusiness({
    name: body.name,
    overallGoal: body.overallGoal,
    constraints: body.constraints ?? [],
  });
  return NextResponse.json({ business: biz });
}

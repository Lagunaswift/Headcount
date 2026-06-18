import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const store = getStore();
  const { id } = await params;
  const project = await store.getProject(id);
  const weeks = await store.getWeeks(id);
  const products = await store.getProductsForProject(id);
  return NextResponse.json({ project, weeks, products });
}

// Move a product along the trust ladder (approve / reject / publish). The CEO
// does this from the UI. On reject with a note, the caller can re-run the writer
// as a revision (handled client-side by calling /api/synthesise-style revise —
// for MVP we just record the rejection; revision wiring is a follow-up).
import { NextResponse } from "next/server";
import { getStore } from "@/lib/store-factory";
import { ProductStatus } from "@/lib/model";

const ALLOWED: ProductStatus[] = ["draft", "approved", "rejected", "published"];

export async function POST(req: Request) {
  const store = await getStore();
  const { productId, status, note } = await req.json();
  if (!ALLOWED.includes(status)) {
    return NextResponse.json({ error: "bad status" }, { status: 400 });
  }
  // The operator is the only actor in the UI, so author of the review is operator.
  const product = await store.setProductStatus(productId, status, "operator", note ?? null);
  return NextResponse.json({ product });
}

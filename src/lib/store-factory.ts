// Picks the backend from STORE_BACKEND. Defaults to memory so the app runs
// with zero setup. Server-only module.
import { TeamStore } from "./store";
import { memoryStore } from "./store-memory";

export async function getStore(): Promise<TeamStore> {
  const backend = process.env.STORE_BACKEND ?? "memory";
  if (backend === "firestore") {
    // Dynamic import, not require(): firebase-admin is only loaded in firestore
    // mode (memory mode needs zero Firebase setup), AND the ESM `export class`
    // resolves correctly here. A CommonJS require() of this module under
    // Turbopack yields a namespace whose FirestoreStore is not callable as a
    // constructor ("FirestoreStore is not a constructor").
    const { FirestoreStore } = await import("./store-firestore");
    return new FirestoreStore();
  }
  return memoryStore();
}

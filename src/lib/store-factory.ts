// Picks the backend from STORE_BACKEND. Defaults to memory so the app runs
// with zero setup. Server-only module.
import { TeamStore } from "./store";
import { memoryStore } from "./store-memory";

export function getStore(): TeamStore {
  const backend = process.env.STORE_BACKEND ?? "memory";
  if (backend === "firestore") {
    // Lazy require so firebase-admin is never loaded in memory mode.
    const { FirestoreStore } = require("./store-firestore");
    return new FirestoreStore();
  }
  return memoryStore();
}

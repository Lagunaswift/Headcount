// Firestore-backed store. Same interface as InMemoryStore. Uses firebase-admin
// (server-side only — these routes run on the server). Switch to this backend
// with STORE_BACKEND=firestore once credentials are set.
//
// Collection layout:
//   businesses/{id}
//   projects/{id}          (flat, with businessId field — simpler queries than
//                           deep subcollections for the MVP)
//   weeks/{id}             (with projectId field)
//   products/{id}          (with projectId + weekId fields)

import {
  Business, Project, Week, Recommendation, AgentContext,
  WorkProduct, ProductStatus, AgentRole,
} from "./model";
import { TeamStore, assembleContext } from "./store";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

function adminApp(): App {
  if (getApps().length) return getApps()[0];
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return initializeApp({ credential: cert(json) });
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS / ADC.
  return initializeApp();
}

function db(): Firestore {
  return getFirestore(adminApp());
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class FirestoreStore implements TeamStore {
  private d = db();

  async createBusiness(b: Omit<Business, "id" | "createdAt">): Promise<Business> {
    const business: Business = { ...b, id: genId("biz"), createdAt: Date.now() };
    await this.d.collection("businesses").doc(business.id).set(business);
    return business;
  }

  async createProject(p: Omit<Project, "id" | "createdAt">): Promise<Project> {
    const biz = await this.d.collection("businesses").doc(p.businessId).get();
    if (!biz.exists) throw new Error(`business ${p.businessId} does not exist`);
    const project: Project = { ...p, id: genId("proj"), createdAt: Date.now() };
    await this.d.collection("projects").doc(project.id).set(project);
    return project;
  }

  async addWeek(w: Omit<Week, "id" | "createdAt" | "recommendation">): Promise<Week> {
    const proj = await this.d.collection("projects").doc(w.projectId).get();
    if (!proj.exists) throw new Error(`project ${w.projectId} does not exist`);
    const week: Week = { ...w, id: genId("week"), createdAt: Date.now() };
    await this.d.collection("weeks").doc(week.id).set(week);
    return week;
  }

  async saveRecommendation(weekId: string, rec: Recommendation): Promise<Week> {
    const ref = this.d.collection("weeks").doc(weekId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`week ${weekId} does not exist`);
    await ref.update({ recommendation: rec });
    return { ...(snap.data() as Week), recommendation: rec };
  }

  async getWeeks(projectId: string): Promise<Week[]> {
    const snap = await this.d.collection("weeks").where("projectId", "==", projectId).get();
    return snap.docs
      .map((d) => d.data() as Week)
      .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
  }

  async getWeek(weekId: string): Promise<Week> {
    const snap = await this.d.collection("weeks").doc(weekId).get();
    if (!snap.exists) throw new Error(`week ${weekId} does not exist`);
    return snap.data() as Week;
  }

  async getProject(projectId: string): Promise<Project> {
    const snap = await this.d.collection("projects").doc(projectId).get();
    if (!snap.exists) throw new Error(`project ${projectId} does not exist`);
    return snap.data() as Project;
  }

  async getProjectsForBusiness(businessId: string): Promise<Project[]> {
    const snap = await this.d.collection("projects").where("businessId", "==", businessId).get();
    return snap.docs.map((d) => d.data() as Project);
  }

  async getBusiness(businessId: string): Promise<Business> {
    const snap = await this.d.collection("businesses").doc(businessId).get();
    if (!snap.exists) throw new Error(`business ${businessId} does not exist`);
    return snap.data() as Business;
  }

  async listBusinesses(): Promise<Business[]> {
    const snap = await this.d.collection("businesses").get();
    return snap.docs.map((d) => d.data() as Business);
  }

  async buildAgentContext(projectId: string, weekOf: string): Promise<AgentContext> {
    const project = await this.getProject(projectId);
    const business = await this.getBusiness(project.businessId);
    const weeks = await this.getWeeks(projectId);
    return assembleContext(business, project, weeks, weekOf);
  }

  async saveProduct(p: Omit<WorkProduct, "id" | "createdAt">): Promise<WorkProduct> {
    const product: WorkProduct = { ...p, id: genId("prod"), createdAt: Date.now() };
    await this.d.collection("products").doc(product.id).set(product);
    return product;
  }

  async getProduct(productId: string): Promise<WorkProduct> {
    const snap = await this.d.collection("products").doc(productId).get();
    if (!snap.exists) throw new Error(`product ${productId} does not exist`);
    return snap.data() as WorkProduct;
  }

  async getProductsForWeek(weekId: string): Promise<WorkProduct[]> {
    const snap = await this.d.collection("products").where("weekId", "==", weekId).get();
    return snap.docs.map((d) => d.data() as WorkProduct).sort((a, b) => b.createdAt - a.createdAt);
  }

  async getProductsForProject(projectId: string): Promise<WorkProduct[]> {
    const snap = await this.d.collection("products").where("projectId", "==", projectId).get();
    return snap.docs.map((d) => d.data() as WorkProduct).sort((a, b) => b.createdAt - a.createdAt);
  }

  async setProductStatus(
    productId: string, status: ProductStatus, by: AgentRole, note: string | null
  ): Promise<WorkProduct> {
    const ref = this.d.collection("products").doc(productId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`product ${productId} does not exist`);
    const review = { by, at: Date.now(), note };
    await ref.update({ status, review });
    return { ...(snap.data() as WorkProduct), status, review };
  }
}

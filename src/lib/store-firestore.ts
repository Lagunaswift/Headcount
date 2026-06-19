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
  Business, Project, ProjectMode, Week, Recommendation, AgentContext,
  WorkProduct, ProductStatus, AgentRole, Quarter, QuarterJudgment, ChosenApproach,
} from "./model";
import { TeamStore, assembleContext, withProjectDefaults } from "./store";
import { getApps, initializeApp, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

function adminApp(): App {
  if (getApps().length) return getApps()[0];
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  if (b64) {
    const json = JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
    return initializeApp({ credential: cert(json), projectId: json.project_id });
  }
  // No service-account JSON. Two supported credential-free paths:
  //   - Firestore emulator: FIRESTORE_EMULATOR_HOST is set, the SDK talks to the
  //     emulator and needs no real credentials — but it still needs a project id
  //     to namespace the data.
  //   - Real Firestore via ADC: GOOGLE_APPLICATION_CREDENTIALS or workload
  //     identity supplies the credentials; the project id usually comes with them.
  // Resolve a project id from the usual env vars so the emulator path works and
  // ADC has an explicit project when the environment does not infer one.
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.GOOGLE_CLOUD_PROJECT ||
    process.env.GCLOUD_PROJECT ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  return initializeApp(projectId ? { projectId } : undefined);
}

// Memoised so settings() is applied exactly once. getFirestore() returns a
// singleton per app, and settings() may only be called before its first use.
let _db: Firestore | null = null;

function db(): Firestore {
  if (_db) return _db;
  const fs = getFirestore(adminApp());
  // The data model leans on optional fields: a Week carries no `recommendation`
  // until synthesis runs, a ProductMeta only holds the keys its type needs. The
  // in-memory store keeps those absent/undefined without complaint; the
  // Firestore Admin SDK rejects `undefined` field values by default. Ignoring
  // them makes absence mean the same thing in both backends — which is the whole
  // promise of the shared TeamStore interface ("nothing else changes").
  fs.settings({ ignoreUndefinedProperties: true });
  _db = fs;
  return _db;
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

  async createProject(
    p: Omit<Project, "id" | "createdAt" | "mode" | "gatingQuestion" | "chosenApproach">
  ): Promise<Project> {
    const biz = await this.d.collection("businesses").doc(p.businessId).get();
    if (!biz.exists) throw new Error(`business ${p.businessId} does not exist`);
    const project: Project = {
      ...p,
      id: genId("proj"),
      createdAt: Date.now(),
      mode: "focus",
      gatingQuestion: null,
      chosenApproach: null,
    };
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
    return withProjectDefaults(snap.data() as Project);
  }

  async getProjectsForBusiness(businessId: string): Promise<Project[]> {
    const snap = await this.d.collection("projects").where("businessId", "==", businessId).get();
    return snap.docs.map((d) => withProjectDefaults(d.data() as Project));
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

  // ---- The three-loop layer ----
  // quarters/{id} with a businessId field — the same flat-collection pattern.

  async createQuarter(q: Omit<Quarter, "id" | "createdAt">): Promise<Quarter> {
    const biz = await this.d.collection("businesses").doc(q.businessId).get();
    if (!biz.exists) throw new Error(`business ${q.businessId} does not exist`);
    const quarter: Quarter = { ...q, id: genId("qtr"), createdAt: Date.now() };
    await this.d.collection("quarters").doc(quarter.id).set(quarter);
    return quarter;
  }

  async getOpenQuarter(businessId: string): Promise<Quarter | null> {
    const snap = await this.d
      .collection("quarters")
      .where("businessId", "==", businessId)
      .where("closed", "==", false)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data() as Quarter;
  }

  async closeQuarter(quarterId: string, judgment: QuarterJudgment): Promise<Quarter> {
    const ref = this.d.collection("quarters").doc(quarterId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`quarter ${quarterId} does not exist`);
    await ref.update({ judgment, closed: true });
    return { ...(snap.data() as Quarter), judgment, closed: true };
  }

  async setQuarterFocus(
    quarterId: string,
    focusProjectId: string,
    projectModes: Record<string, ProjectMode>
  ): Promise<Quarter> {
    const ref = this.d.collection("quarters").doc(quarterId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`quarter ${quarterId} does not exist`);
    await ref.update({ focusProjectId, projectModes });
    return { ...(snap.data() as Quarter), focusProjectId, projectModes };
  }

  async setProjectMode(projectId: string, mode: ProjectMode): Promise<Project> {
    const ref = this.d.collection("projects").doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`project ${projectId} does not exist`);
    await ref.update({ mode });
    return withProjectDefaults({ ...(snap.data() as Project), mode });
  }

  async setProjectApproach(
    projectId: string,
    gatingQuestion: string,
    chosen: ChosenApproach
  ): Promise<Project> {
    const ref = this.d.collection("projects").doc(projectId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`project ${projectId} does not exist`);
    await ref.update({ gatingQuestion, chosenApproach: chosen });
    return withProjectDefaults({
      ...(snap.data() as Project),
      gatingQuestion,
      chosenApproach: chosen,
    });
  }
}

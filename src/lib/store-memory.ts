// In-memory store. Run the whole app with STORE_BACKEND=memory and zero setup.
// Mirrors Firestore behaviour exactly so the Firestore adapter is a drop-in.
// NOTE: state lives in module scope, so it resets on server restart. Fine for
// local dogfooding; not for anything real.

import {
  Business, Project, Week, Recommendation, AgentContext,
  WorkProduct, ProductStatus, AgentRole,
} from "./model";
import { TeamStore, assembleContext } from "./store";

export class InMemoryStore implements TeamStore {
  private businesses = new Map<string, Business>();
  private projects = new Map<string, Project>();
  private weeks = new Map<string, Week>();
  private products = new Map<string, WorkProduct>();
  private seq = 0;

  private id(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }

  async createBusiness(b: Omit<Business, "id" | "createdAt">): Promise<Business> {
    const business: Business = { ...b, id: this.id("biz"), createdAt: Date.now() };
    this.businesses.set(business.id, business);
    return business;
  }

  async createProject(p: Omit<Project, "id" | "createdAt">): Promise<Project> {
    if (!this.businesses.has(p.businessId)) {
      throw new Error(`business ${p.businessId} does not exist`);
    }
    const project: Project = { ...p, id: this.id("proj"), createdAt: Date.now() };
    this.projects.set(project.id, project);
    return project;
  }

  async addWeek(w: Omit<Week, "id" | "createdAt" | "recommendation">): Promise<Week> {
    if (!this.projects.has(w.projectId)) {
      throw new Error(`project ${w.projectId} does not exist`);
    }
    const week: Week = { ...w, id: this.id("week"), createdAt: Date.now() };
    this.weeks.set(week.id, week);
    return week;
  }

  async saveRecommendation(weekId: string, rec: Recommendation): Promise<Week> {
    const week = this.weeks.get(weekId);
    if (!week) throw new Error(`week ${weekId} does not exist`);
    week.recommendation = rec;
    this.weeks.set(weekId, week);
    return week;
  }

  async getWeeks(projectId: string): Promise<Week[]> {
    return [...this.weeks.values()]
      .filter((w) => w.projectId === projectId)
      .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1)); // most recent first
  }

  async getWeek(weekId: string): Promise<Week> {
    const w = this.weeks.get(weekId);
    if (!w) throw new Error(`week ${weekId} does not exist`);
    return w;
  }

  async getProject(projectId: string): Promise<Project> {
    const p = this.projects.get(projectId);
    if (!p) throw new Error(`project ${projectId} does not exist`);
    return p;
  }

  async getProjectsForBusiness(businessId: string): Promise<Project[]> {
    return [...this.projects.values()].filter((p) => p.businessId === businessId);
  }

  async getBusiness(businessId: string): Promise<Business> {
    const b = this.businesses.get(businessId);
    if (!b) throw new Error(`business ${businessId} does not exist`);
    return b;
  }

  async listBusinesses(): Promise<Business[]> {
    return [...this.businesses.values()];
  }

  async buildAgentContext(projectId: string, weekOf: string): Promise<AgentContext> {
    const project = await this.getProject(projectId);
    const business = await this.getBusiness(project.businessId);
    const weeks = await this.getWeeks(projectId);
    return assembleContext(business, project, weeks, weekOf);
  }

  async saveProduct(p: Omit<WorkProduct, "id" | "createdAt">): Promise<WorkProduct> {
    const product: WorkProduct = { ...p, id: this.id("prod"), createdAt: Date.now() };
    this.products.set(product.id, product);
    return product;
  }

  async getProduct(productId: string): Promise<WorkProduct> {
    const p = this.products.get(productId);
    if (!p) throw new Error(`product ${productId} does not exist`);
    return p;
  }

  async getProductsForWeek(weekId: string): Promise<WorkProduct[]> {
    return [...this.products.values()]
      .filter((p) => p.weekId === weekId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getProductsForProject(projectId: string): Promise<WorkProduct[]> {
    return [...this.products.values()]
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async setProductStatus(
    productId: string,
    status: ProductStatus,
    by: AgentRole,
    note: string | null
  ): Promise<WorkProduct> {
    const p = this.products.get(productId);
    if (!p) throw new Error(`product ${productId} does not exist`);
    p.status = status;
    p.review = { by, at: Date.now(), note };
    this.products.set(productId, p);
    return p;
  }
}

// Singleton across hot-reloads in dev.
const g = globalThis as unknown as { __memStore?: InMemoryStore };
export function memoryStore(): InMemoryStore {
  if (!g.__memStore) g.__memStore = new InMemoryStore();
  return g.__memStore;
}

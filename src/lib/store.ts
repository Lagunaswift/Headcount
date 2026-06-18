// ---------------------------------------------------------------------------
// Store: the read/write boundary. Same interface backs both an in-memory
// implementation (run today, no setup) and Firestore (production).
//
// Firestore mapping:
//   businesses/{businessId}
//   businesses/{businessId}/projects/{projectId}
//   businesses/{businessId}/projects/{projectId}/weeks/{weekId}
//   businesses/{businessId}/projects/{projectId}/products/{productId}
// weekOf is the ordering key for "last week" lookups.
// ---------------------------------------------------------------------------

import {
  Business,
  Project,
  Week,
  Recommendation,
  AgentContext,
  MetricKey,
  WeeklyMetrics,
  WorkProduct,
  ProductStatus,
} from "./model";

export interface TeamStore {
  createBusiness(b: Omit<Business, "id" | "createdAt">): Promise<Business>;
  createProject(p: Omit<Project, "id" | "createdAt">): Promise<Project>;
  addWeek(w: Omit<Week, "id" | "createdAt" | "recommendation">): Promise<Week>;
  saveRecommendation(weekId: string, rec: Recommendation): Promise<Week>;
  getWeeks(projectId: string): Promise<Week[]>;
  getWeek(weekId: string): Promise<Week>;
  getProject(projectId: string): Promise<Project>;
  getProjectsForBusiness(businessId: string): Promise<Project[]>;
  getBusiness(businessId: string): Promise<Business>;
  listBusinesses(): Promise<Business[]>;
  buildAgentContext(projectId: string, weekOf: string): Promise<AgentContext>;

  // Work products (the artifacts the Writer drafts).
  saveProduct(p: Omit<WorkProduct, "id" | "createdAt">): Promise<WorkProduct>;
  getProduct(productId: string): Promise<WorkProduct>;
  getProductsForWeek(weekId: string): Promise<WorkProduct[]>;
  getProductsForProject(projectId: string): Promise<WorkProduct[]>;
  // Move a product along the trust ladder. Records who/why.
  setProductStatus(
    productId: string,
    status: ProductStatus,
    by: WorkProduct["author"],
    note: string | null
  ): Promise<WorkProduct>;
}

// Deterministic missing-metric computation: tracked but not reported this week.
export function computeMissingMetrics(
  tracked: MetricKey[],
  reported: WeeklyMetrics
): MetricKey[] {
  return tracked.filter((m) => reported[m] === undefined);
}

// Shared context assembly so both backends behave identically. Takes the raw
// records and returns the AgentContext; no storage concerns in here.
export function assembleContext(
  business: Business,
  project: Project,
  weeks: Week[], // most-recent-first
  weekOf: string
): AgentContext {
  const thisWeek = weeks.find((w) => w.weekOf === weekOf);
  if (!thisWeek) {
    throw new Error(`week ${weekOf} not found for project ${project.id}`);
  }
  const prior = weeks.filter((w) => w.weekOf < weekOf);
  const lastWeek = prior.length > 0 ? prior[0] : null;

  return {
    overallGoal: business.overallGoal,
    constraints: business.constraints,
    projectName: project.name,
    projectDescription: project.description,
    currentSubGoal: project.currentSubGoal,
    successLooksLike: project.successLooksLike,
    thisWeek: {
      weekOf: thisWeek.weekOf,
      whatHappened: thisWeek.whatHappened,
      metrics: thisWeek.metrics,
      blockers: thisWeek.blockers,
    },
    lastWeek: lastWeek
      ? {
          weekOf: lastWeek.weekOf,
          whatHappened: lastWeek.whatHappened,
          metrics: lastWeek.metrics,
          blockers: lastWeek.blockers,
          recommendation: lastWeek.recommendation ?? null,
        }
      : null,
    missingMetricsThisWeek: computeMissingMetrics(
      project.trackedMetrics,
      thisWeek.metrics
    ),
  };
}

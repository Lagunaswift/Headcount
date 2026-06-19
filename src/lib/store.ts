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
  ProjectMode,
  Week,
  Recommendation,
  AgentContext,
  MetricKey,
  WeeklyMetrics,
  WorkProduct,
  ProductStatus,
  Quarter,
  QuarterJudgment,
  ChosenApproach,
} from "./model";

export interface TeamStore {
  createBusiness(b: Omit<Business, "id" | "createdAt">): Promise<Business>;
  // The three-loop fields (mode/gatingQuestion/chosenApproach) are NOT supplied
  // at creation — a brand-new project defaults to focus with no approach yet, so
  // a solo user with one project just works without touching the Manager.
  createProject(
    p: Omit<Project, "id" | "createdAt" | "mode" | "gatingQuestion" | "chosenApproach">
  ): Promise<Project>;
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

  // ---- The three-loop layer (Portfolio -> Quarter -> Project) ----
  createQuarter(q: Omit<Quarter, "id" | "createdAt">): Promise<Quarter>;
  getOpenQuarter(businessId: string): Promise<Quarter | null>;
  closeQuarter(quarterId: string, judgment: QuarterJudgment): Promise<Quarter>;
  setQuarterFocus(
    quarterId: string,
    focusProjectId: string,
    projectModes: Record<string, ProjectMode>
  ): Promise<Quarter>;
  setProjectMode(projectId: string, mode: ProjectMode): Promise<Project>;
  setProjectApproach(
    projectId: string,
    gatingQuestion: string,
    chosen: ChosenApproach
  ): Promise<Project>;
}

// Back-compat: projects created before the three-loop layer have no mode/
// gatingQuestion/chosenApproach. Fill safe defaults on read so they still load
// identically in both backends. A pre-existing project becomes a focus project
// with no approach yet — exactly a fresh project's day-one state.
export function withProjectDefaults(p: Project): Project {
  return {
    ...p,
    mode: p.mode ?? "focus",
    gatingQuestion: p.gatingQuestion ?? null,
    chosenApproach: p.chosenApproach ?? null,
  };
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

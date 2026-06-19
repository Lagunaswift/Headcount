// ---------------------------------------------------------------------------
// Agentic Team — core data model (MVP)
//
// Design rules baked in here, not bolted on:
//  1. Hierarchy: Business (permanent money/growth goal + constraints)
//                  -> Project (standing context + ONE active sub-goal)
//                    -> Week (the recurring delta + stored recommendation)
//  2. Ground-truth rule: a metric that is not tracked is ABSENT, never zero.
//     Absence is represented by the key simply not being present.
//  3. Memory: each cycle an agent receives last week's delta AND last week's
//     recommendation, so the synthesiser can ask "did the move work".
//  4. Minimalism: every field must change an agent's reasoning. No admin fields.
//  5. Rigid envelope, free contents: agents return TYPED fields the system can
//     act on (status, type, links), but the creative payload (an article body)
//     is one open string the system never sub-structures. Structure governs
//     DELIVERY; it must never structure the PROSE.
//  6. Trust ladder, representable from day one: every work product carries an
//     approval status. Autonomy is a POLICY over which status transitions an
//     agent may make unattended — not a future schema change.
// ---------------------------------------------------------------------------

// A metric the system understands. Shared vocabulary so the time series and
// any later charting stay consistent across projects. A project only carries
// the ones that are REAL for it.
export type MetricKey =
  | "revenue"          // money in this week
  | "new_customers"    // newly acquired paying customers/clients
  | "active_customers" // currently paying / active
  | "lost_customers"   // churned this week
  | "leads"            // top of funnel: signups, enquiries, waitlist adds
  | "spend";           // marketing / ad / acquisition spend this week

// A single metric reading for a week. Value is whatever unit the business uses
// (currency for revenue/spend, count for the rest). Absence of a key = not
// tracked that week, which agents MUST treat as "no data", not as 0.
export type WeeklyMetrics = Partial<Record<MetricKey, number>>;

// Which agent produced a thing. Mirrors MetricKey discipline: a small shared
// vocabulary, extended only when a role genuinely exists. The Synthesiser
// advises (names the one move); the Writer drafts work products on request.
// "operator" is you — work products can originate from a human too.
export type AgentRole =
  | "synthesiser"
  | "writer"
  | "operator";

// The kinds of work product the system can hold, render, and act on. Only the
// real ones. Each type implies a different `meta` shape (see ProductMeta) and a
// different eventual ACTION when published (post, send, etc.).
export type ProductType =
  | "blog_article"
  | "email"
  | "social_post"
  | "note";        // catch-all for drafted text that is not yet a typed asset

// The trust ladder, made mechanical. A work product moves through these states.
// Which agent may perform which transition unattended is a POLICY decision made
// elsewhere (see ActionPolicy), NOT encoded here — the model only guarantees
// every state is representable.
//   draft      -> the agent has written it; nothing has happened in the world
//   approved   -> the operator (or a permitted agent) has signed it off
//   rejected   -> sent back; `review.note` says why
//   published  -> the real-world action has happened (posted, sent). Terminal.
export type ProductStatus =
  | "draft"
  | "approved"
  | "rejected"
  | "published";

// Type-specific delivery details. Kept OUT of `body` so the creative payload
// stays a pure prose string the envelope cannot flatten. Optional throughout
// because a draft may not have a recipient or slug decided yet.
export interface ProductMeta {
  // blog_article
  title?: string;
  slug?: string;
  // email
  subject?: string;
  to?: string[];
  // social_post
  platform?: "instagram" | "x" | "linkedin";
  // shared
  tags?: string[];
}

// An operator's verdict on a work product. Present once it leaves `draft`.
export interface ProductReview {
  by: AgentRole;        // who moved it out of draft (usually "operator")
  at: number;
  note: string | null;  // required-in-spirit on rejection; why it was sent back
}

// ---------------------------------------------------------------------------
// The thing the Writer produces. THE artifact the whole "draft the blog article,
// do not just tell me to" promise hangs on.
//
// Rigid envelope: id, type, status, authorship, linkage, meta — all typed, all
// actionable. Free contents: `body` is one open string. Voice and structure of
// the prose are governed by the writing standards the Writer agent follows, not
// by this schema. Do NOT add intro/section/conclusion sub-fields here; that is
// exactly how an envelope leaks into and flattens the writing.
// ---------------------------------------------------------------------------
export interface WorkProduct {
  id: string;
  projectId: string;
  // The week whose cycle produced this, so a product is always traceable to the
  // context that justified it.
  weekId: string;
  // Was this drafted because a recommendation asked for it? This is the spine of
  // the did-it-work loop: move recommended -> work drafted -> work shipped ->
  // next week assesses the outcome. False if drafted ad hoc.
  fromRecommendation: boolean;

  type: ProductType;
  author: AgentRole;        // "writer" for agent drafts; "operator" if you wrote it
  status: ProductStatus;

  // The creative payload. Open prose. The system stores and displays it; it does
  // not parse it. Everything structured lives in `meta`, never in here.
  body: string;
  meta: ProductMeta;

  // Set when the product leaves `draft`. Null while still a draft.
  review: ProductReview | null;

  // Monotonic version for this logical product. A revised draft increments it,
  // so "draft #3 supersedes #2" is real and not guesswork. For MVP each revision
  // is a new WorkProduct with `version` bumped and `supersedes` pointing back.
  version: number;
  supersedes: string | null; // id of the WorkProduct this revision replaces

  createdAt: number;
}

// The permanent frame. Set once per business, changed rarely.
export interface Business {
  id: string;
  name: string;
  // The overall goal. For every business this is some form of "grow / make
  // money", kept as free text so it can be stated in the operator's terms.
  overallGoal: string;
  // The non-negotiables growth must not break. THIS is what stops an agent
  // recommending something that erodes the brand in service of the goal.
  // e.g. for Hierocles: "No manufactured urgency. UK English, no contractions,
  // no em dashes. The philosophy is the engine, not the selling point."
  constraints: string[];
  createdAt: number;
}

// How a project is being run THIS quarter. Set by the operator each quarter
// (informed by the Manager). Drives how the weekly loop behaves.
//   focus       -> full weekly chain runs; this is the one active bet
//   maintenance -> numbers are logged and watched, but NO new moves are produced
//   dark        -> project accepts nothing this quarter; fully paused
export type ProjectMode = "focus" | "maintenance" | "dark";

// A project under a business. Holds its identity and ONE active sub-goal —
// the actual operating target the agents reason against. The overall goal is
// the why; the sub-goal is the what-this-period.
export interface Project {
  id: string;
  businessId: string;
  name: string;
  // One line: what this project IS. The agent's frame for what it's looking at.
  description: string;
  // The current operating target the agents reason against. NO LONGER set by
  // the operator once a quarter is running: when `chosenApproach` exists the
  // weekly loop derives this from it each week (see subgoal derivation). The
  // operator's initial value is the day-one fallback for a fresh project that
  // has no chosenApproach yet, so nothing breaks before the first Advisor run.
  currentSubGoal: string;
  // What success for the sub-goal actually looks like, so an agent can judge
  // progress rather than mere activity.
  successLooksLike: string;
  // Which metrics are real for THIS project. Drives what the weekly form asks
  // for and what the time series tracks. Only the applicable ones.
  trackedMetrics: MetricKey[];
  // The current operating mode. Defaults to "focus" for a brand-new project
  // (so a solo user with one project just works without touching the Manager).
  mode: ProjectMode;
  // The Advisor's gating question for the current quarter, once set. Null until
  // the Advisor has run and the operator has picked an approach.
  gatingQuestion: string | null;
  // The approach the operator chose for this quarter (the Advisor's lead or an
  // alternative). Null until chosen. Weekly sub-goals derive from this.
  chosenApproach: ChosenApproach | null;
  createdAt: number;
}

// One week of real input for a project, plus the stored output of synthesis.
export interface Week {
  id: string;
  projectId: string;
  // ISO week label, e.g. "2026-W23". Used to order the time series and to
  // fetch "last week" deterministically.
  weekOf: string;
  // What actually happened. Freeform but anchored — the UI prompts with last
  // week's recommendation so this is rarely a blank box.
  whatHappened: string;
  // Whatever moved this week. Only real numbers; missing = not tracked.
  metrics: WeeklyMetrics;
  // What is stuck or blocked. The constraint/blocker signal.
  blockers: string;
  // ---- written by the system, not the operator ----
  // The synthesiser's output for THIS week, stored so next week can check it.
  recommendation?: Recommendation;
  createdAt: number;
}

// The synthesiser's structured output. Names ONE move and reports on last
// week's. Kept structured (not freeform prose) so "did it work" is checkable.
export interface Recommendation {
  // The single move for the coming week. The whole product promise.
  oneMove: string;
  // Why this move, in terms of the sub-goal it advances.
  rationale: string;
  // The trade-off the synthesiser made — what it chose NOT to prioritise.
  tradeOff: string;
  // From week 2 onward: did last week's recommended move happen, and did the
  // numbers move? Null on the first week (no prior to assess).
  lastMoveAssessment: string | null;
  // Does carrying out this move require a work product to be drafted (e.g. the
  // move IS "publish the second article")? If so, name the type the Writer
  // should produce. Null when the move is operator action with nothing to draft
  // (e.g. "phone your three warmest leads"). This is the handoff from the
  // advising agent to the drafting agent.
  requestsWorkProduct: ProductType | null;
  // The Critic's report on this move, if the Critic ran. Stored with the move so
  // the operator can see that it was challenged and how it held up. Optional for
  // backward compatibility (early weeks / critic-disabled runs).
  critique?: CriticReport;
}

// ---------------------------------------------------------------------------
// What an agent actually receives each cycle. This is the assembled context —
// the single most important object in the system, because it defines the
// minimum information an agent needs to reason about movement toward a goal
// with honesty about what it does and does not know.
// ---------------------------------------------------------------------------
export interface AgentContext {
  // The permanent frame.
  overallGoal: string;
  constraints: string[];
  // The project identity and operating target.
  projectName: string;
  projectDescription: string;
  currentSubGoal: string;
  successLooksLike: string;
  // This week's real input.
  thisWeek: {
    weekOf: string;
    whatHappened: string;
    metrics: WeeklyMetrics;
    blockers: string;
  };
  // The memory. Null when this is the project's first week.
  lastWeek: {
    weekOf: string;
    whatHappened: string;
    metrics: WeeklyMetrics;
    blockers: string;
    recommendation: Recommendation | null;
  } | null;
  // The Analyst's structured findings for this week, if the Analyst ran.
  // Optional so the Synthesiser still works without it (backward compatible).
  analystFindings?: AnalystFindings;
  // Explicit, computed list of metrics the project tracks but did NOT report
  // this week — so the prompt can instruct the agent to say "no data on X"
  // rather than infer a trend. Ground-truth rule, made mechanical.
  missingMetricsThisWeek: MetricKey[];
}

// ---------------------------------------------------------------------------
// The Writer's context. Distinct from AgentContext because the Writer answers a
// narrower question: "produce THIS artifact, in voice, serving THIS move." It
// inherits the frame (goal + constraints, which encode voice rules) but is
// pointed at a single recommended move, not the whole week's synthesis problem.
// ---------------------------------------------------------------------------
export interface WriterContext {
  // The non-negotiables. For a writer these ARE the voice spec (UK English, no
  // contractions, no em dashes, no manufactured urgency, etc).
  constraints: string[];
  overallGoal: string;
  currentSubGoal: string;
  // The move that justifies this piece of work.
  theMove: string;
  // What to produce.
  productType: ProductType;
  // If this is a revision rather than a first draft, the prior body and the
  // reviewer's rejection note, so the Writer revises against real feedback
  // instead of starting blind.
  revising: {
    previousBody: string;
    rejectionNote: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Autonomy as POLICY, not schema. Which roles may perform which status
// transition WITHOUT operator sign-off. Rung 0 of your trust ladder is the
// default: agents may only ever land a product in `draft`; every move out of
// draft requires the operator. Loosening this later is a config change here,
// not a model change anywhere.
// ---------------------------------------------------------------------------
export type StatusTransition =
  | "draft->approved"
  | "draft->rejected"
  | "approved->published"
  | "approved->rejected"
  | "rejected->draft";   // a rejected product can be revised back into a draft

export interface ActionPolicy {
  // For each transition, which roles may make it unattended. Empty array means
  // operator-only (the safe default).
  allowedUnattended: Partial<Record<StatusTransition, AgentRole[]>>;
}

// The conservative starting policy. Nothing leaves draft without you, except a
// writer may turn a rejection back into a fresh draft to revise.
export const RUNG_ZERO_POLICY: ActionPolicy = {
  allowedUnattended: {
    "draft->approved": [],
    "draft->rejected": [],
    "approved->published": [],
    "approved->rejected": [],
    "rejected->draft": ["writer"],
  },
};

// ---------------------------------------------------------------------------
// The Analyst's output. Runs BEFORE the Synthesiser on a cheap model. Turns raw
// weekly metrics + history into honest, structured findings — conversion
// between stages, what moved, and crucially what the data CANNOT support
// (small samples, missing metrics). It does NOT recommend. It exists so the
// Synthesiser stops doing arithmetic in its head and stops over-reading a
// couple of data points as a trend.
// ---------------------------------------------------------------------------
export interface AnalystFindings {
  // Plain-language readings the data genuinely supports.
  observations: string[];
  // Stage-to-stage conversion where both numbers exist this week, e.g.
  // "leads->new_customers: 3.1% (2/64)". Only computed where real.
  conversions: string[];
  // Week-over-week movement where last week's number exists too.
  movements: string[];
  // Explicit honesty: what the numbers do NOT let you conclude. Small-sample
  // warnings, missing metrics, single data points that are not yet a trend.
  cautions: string[];
}

// ---------------------------------------------------------------------------
// The Critic's output. Runs AFTER the Synthesiser, on the top model, and is
// prompted to genuinely oppose — not rubber-stamp. It exists so nothing reaches
// the operator unchallenged: the mechanical version of "a function returning
// without error proves nothing." The Synthesiser then either revises the move
// or defends it. The Critic never writes the move itself (that would collapse
// the separation that makes the challenge worth anything).
// ---------------------------------------------------------------------------
export interface CriticReport {
  // The single most serious problem with the proposed move, or null if the
  // Critic genuinely cannot fault it. Forcing ONE keeps it from listing ten
  // weak quibbles to look busy.
  chiefObjection: string | null;
  // Does the move break a stated business constraint? Names which, or null.
  constraintBreach: string | null;
  // Is the move actually supported by the Analyst's findings, or is it a guess
  // dressed as a decision? Honest verdict here.
  evidenceVerdict: string;
  // Whether, on balance, the Critic thinks the move should proceed to the
  // operator as-is. False means the Synthesiser should revise before you see it.
  endorses: boolean;
}

// ===========================================================================
// THE THREE-LOOP LAYER (Portfolio -> Quarter -> Project -> Week)
//
// Two slower outer loops above the weekly chain, each running quarterly:
//   - Manager: picks the ONE focus project, sets others to maintenance/dark,
//     judges last quarter. Can be pulled forward by the stuck-signal.
//   - Advisor: inside the focus project, produces the gating question + a few
//     reasoned approaches, leads with one. The operator picks; weekly sub-goals
//     then derive from it.
// The weekly loop is unchanged except it now behaves per project mode.
// ===========================================================================

// One reasoned approach to answering the quarter's gating question.
export interface Approach {
  // Short handle, e.g. "Instrument the activation step".
  title: string;
  // The reasoning: why this attacks the question, what it would cost in effort,
  // and crucially what RESULT would confirm or kill it (falsifiable).
  rationale: string;
  // What success for this approach looks like in a few weeks — the thing the
  // weekly loop will measure against.
  successSignal: string;
}

// The Advisor's full quarterly output for the focus project.
export interface AdvisorReport {
  // The single question this quarter must answer before moving on.
  gatingQuestion: string;
  // 2–3 approaches. approaches[leadIndex] is the recommended lead.
  approaches: Approach[];
  // Index into approaches of the recommended lead.
  leadIndex: number;
  // WHY the lead is the lead — must reference the actual findings/evidence, not
  // a generic preference. Falsifiable: when the lead is wrong, this says why it
  // looked right, so the miss is legible.
  leadReason: string;
}

// What the operator picked (the lead, or an alternative). Stored on Project.
export interface ChosenApproach {
  fromQuarter: string;         // Quarter.id this was chosen in
  gatingQuestion: string;      // copied so the project is self-contained
  approach: Approach;          // the chosen one
  chosenAt: number;
}

// The Manager's quarterly recommendation to the operator.
export interface ManagerReport {
  // Which project it recommends putting on focus, and why — referencing where
  // each project actually is, not a generic rule.
  recommendedFocusProjectId: string;
  focusReason: string;
  // Per project, the recommended mode for the coming quarter + one line why.
  modeRecommendations: { projectId: string; mode: ProjectMode; why: string }[];
  // If this run was triggered by the stuck-signal mid-quarter, what's stuck.
  stuckTrigger: string | null;
}

// The Manager's end-of-quarter (or pulled-forward) assessment.
export interface QuarterJudgment {
  // Did the focus project's gating question actually get answered?
  questionAnswered: boolean;
  // Honest read on whether the quarter moved the business or just generated
  // activity. This is the did-it-work loop at the quarter level.
  assessment: string;
  // Was this judgment triggered early by the stuck-signal, or at quarter end?
  pulledForward: boolean;
  at: number;
}

// A quarter is the unit the two outer loops operate on. One per business per
// ~13-week period. Holds the portfolio decision (which project is focus, what
// mode each other project is in) and, at quarter end, the Manager's judgment.
export interface Quarter {
  id: string;
  businessId: string;          // a quarter belongs to a business/portfolio root
  label: string;               // e.g. "2026-Q3"
  startedAt: number;
  // Which project the Manager/operator put on focus this quarter.
  focusProjectId: string | null;
  // Mode per project for this quarter. projectId -> mode. Projects absent from
  // the map inherit their own Project.mode (treat as maintenance if unsure).
  projectModes: Record<string, ProjectMode>;
  // Filled at quarter end (or when pulled forward): did the focus pay off?
  judgment: QuarterJudgment | null;
  // True once this quarter is closed (judged). Only one open quarter at a time
  // per business.
  closed: boolean;
  createdAt: number;
}

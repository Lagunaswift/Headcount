// ---------------------------------------------------------------------------
// The shared stuck-signal. MECHANICAL, not an LLM judgment, so the Manager
// (deciding whether to pull focus forward) and the Advisor (deciding whether to
// keep deriving toward the question or flag it) read the SAME definition of
// "is the focus working" and never fight — one deriving toward a dead question
// while the other tries to call it.
//
// Deliberately strict. A false "stuck" thrashes focus, which is worse than a
// slow quarter, so when the evidence is thin the verdict is NOT stuck. Two
// ground-truth rules hold: absent metrics are unknown, never read as "no
// progress"; and a single bad week is never stuck.
// ---------------------------------------------------------------------------

import type { Week, ChosenApproach, MetricKey, WeeklyMetrics } from "./model";

// How many recent weeks must ALL show no movement before we call it stuck.
export const STUCK_WINDOW = 3;

export interface StuckSignal {
  stuck: boolean;
  // The weeks examined and why the verdict — for transparency in the UI.
  reason: string;
  weeksConsidered: number;
}

// For each metric, which direction is improvement: up for the growth metrics,
// down for the cost/loss metrics.
const HIGHER_IS_BETTER: Record<MetricKey, boolean> = {
  revenue: true,
  new_customers: true,
  active_customers: true,
  leads: true,
  lost_customers: false,
  spend: false,
};

// Lexical map from a metric to words that, appearing in a successSignal, tie
// that metric to the approach. Deterministic and intentionally narrow; used
// only to focus the "did the success metric move" check on the metrics the
// approach actually claims to move.
const METRIC_KEYWORDS: Record<MetricKey, string[]> = {
  revenue: ["revenue", "mrr", "arr", "sales", "income", "paid", "payment"],
  new_customers: ["new customer", "signup", "sign-up", "sign up", "acquisition", "conversion", "convert"],
  active_customers: ["active customer", "active user", "retention", "retained", "subscriber", "subscription"],
  lost_customers: ["churn", "lost customer", "cancellation", "cancel"],
  leads: ["lead", "enquir", "inquir", "waitlist", "top of funnel", "traffic"],
  spend: ["spend", "ad cost", "budget", "cac", "cost per"],
};

// Which metrics the approach's successSignal names. If none are recognised we
// fall back to every metric, so we never FAIL to notice movement (that errs
// toward "not stuck", which is the safe direction).
function tiedMetrics(successSignal: string): MetricKey[] {
  const s = successSignal.toLowerCase();
  const keys = (Object.keys(METRIC_KEYWORDS) as MetricKey[]).filter((k) =>
    METRIC_KEYWORDS[k].some((w) => s.includes(w))
  );
  return keys.length ? keys : (Object.keys(HIGHER_IS_BETTER) as MetricKey[]);
}

// Narrow lexical check for a lastMoveAssessment that plainly reports the move
// did not move the numbers. The authoritative guard is the metric clause; this
// only lets the Synthesiser's own "it didn't work" verdict corroborate.
const NO_MOVEMENT_PHRASES = [
  "did not move", "didn't move", "no movement", "no change", "unchanged",
  "no improvement", "no progress", "stalled", "stayed the same", "stayed flat",
  "remained flat", "made no difference", "didn't work", "did not work",
];

function assessmentReportsNoMovement(assessment: string | null): boolean {
  if (!assessment) return false;
  const a = assessment.toLowerCase();
  return NO_MOVEMENT_PHRASES.some((p) => a.includes(p));
}

// A single week shows "no progress" when it has a recommendation that either
// the Critic refused to endorse on first pass, or whose own last-move
// assessment says the numbers did not move. A week with NO recommendation does
// not count as no-progress — it breaks the stuck chain (conservative).
function weekShowsNoProgress(week: Week): boolean {
  const rec = week.recommendation;
  if (!rec) return false;
  const critiqueRejected = rec.critique?.endorses === false;
  return critiqueRejected || assessmentReportsNoMovement(rec.lastMoveAssessment);
}

// Did any tied metric improve from the start to the end of the window? Only
// metrics present at BOTH ends are comparable; an absent metric is unknown and
// is skipped, never read as "no progress".
function anyTiedMetricImproved(
  oldest: WeeklyMetrics,
  newest: WeeklyMetrics,
  keys: MetricKey[]
): boolean {
  for (const k of keys) {
    const a = oldest[k];
    const b = newest[k];
    if (a === undefined || b === undefined) continue; // not comparable -> unknown
    if (HIGHER_IS_BETTER[k] ? b > a : b < a) return true;
  }
  return false;
}

// The verdict. weeks may be in any order; chosenApproach is null before the
// operator has picked one (in which case there is nothing to be stuck against).
export function computeStuckSignal(
  weeks: Week[],
  chosenApproach: ChosenApproach | null
): StuckSignal {
  if (!chosenApproach) {
    return {
      stuck: false,
      reason: "No approach chosen yet — nothing to measure progress against.",
      weeksConsidered: 0,
    };
  }

  // Most-recent-first, take the window, then read it oldest -> newest.
  const desc = [...weeks].sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
  const windowDesc = desc.slice(0, STUCK_WINDOW);

  if (windowDesc.length < STUCK_WINDOW) {
    return {
      stuck: false,
      reason: `Only ${windowDesc.length} week(s) logged; need ${STUCK_WINDOW} before a stuck verdict.`,
      weeksConsidered: windowDesc.length,
    };
  }

  const windowAsc = [...windowDesc].reverse();
  const oldest = windowAsc[0];
  const newest = windowAsc[windowAsc.length - 1];
  const span = `${oldest.weekOf}–${newest.weekOf}`;

  const allNoProgress = windowAsc.every(weekShowsNoProgress);
  const keys = tiedMetrics(chosenApproach.approach.successSignal);
  const improved = anyTiedMetricImproved(oldest.metrics, newest.metrics, keys);
  const stuck = allNoProgress && !improved;

  let reason: string;
  if (stuck) {
    reason = `Stuck: all ${STUCK_WINDOW} weeks (${span}) show an unendorsed or unmoved move, and no success metric improved across the window.`;
  } else if (!allNoProgress) {
    reason = `Not stuck: at least one of the last ${STUCK_WINDOW} weeks (${span}) had an endorsed move or moved the numbers.`;
  } else {
    reason = `Not stuck: a success metric improved across the last ${STUCK_WINDOW} weeks (${span}).`;
  }

  return { stuck, reason, weeksConsidered: STUCK_WINDOW };
}

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStuckSignal, STUCK_WINDOW } from "./stuck.ts";
import type { Week, Recommendation, ChosenApproach, WeeklyMetrics } from "./model";

// --- builders ---------------------------------------------------------------

function rec(opts: { endorses?: boolean; lastMoveAssessment?: string | null } = {}): Recommendation {
  return {
    oneMove: "do the thing",
    rationale: "because",
    tradeOff: "not the other thing",
    lastMoveAssessment: opts.lastMoveAssessment ?? null,
    requestsWorkProduct: null,
    critique: {
      chiefObjection: null,
      constraintBreach: null,
      evidenceVerdict: "ok",
      endorses: opts.endorses ?? true,
    },
  };
}

function week(
  weekOf: string,
  metrics: WeeklyMetrics,
  recommendation?: Recommendation
): Week {
  return {
    id: `week_${weekOf}`,
    projectId: "proj_1",
    weekOf,
    whatHappened: "stuff",
    metrics,
    blockers: "",
    recommendation,
    createdAt: 0,
  };
}

const approach = (successSignal: string): ChosenApproach => ({
  fromQuarter: "qtr_1",
  gatingQuestion: "does activation work?",
  approach: { title: "t", rationale: "r", successSignal },
  chosenAt: 0,
});

const REVENUE_APPROACH = approach("paid revenue climbs week over week");

// --- the three required cases ----------------------------------------------

test("3 flat weeks = stuck", () => {
  // Every week: move not endorsed, and the success metric (revenue) is flat.
  const weeks = [
    week("2026-W21", { revenue: 100 }, rec({ endorses: false })),
    week("2026-W22", { revenue: 100 }, rec({ endorses: false })),
    week("2026-W23", { revenue: 100 }, rec({ endorses: false })),
  ];
  const s = computeStuckSignal(weeks, REVENUE_APPROACH);
  assert.equal(s.stuck, true);
  assert.equal(s.weeksConsidered, STUCK_WINDOW);
});

test("1 bad week among good ones = not stuck", () => {
  const weeks = [
    week("2026-W21", { revenue: 100 }, rec({ endorses: false })), // the one bad week
    week("2026-W22", { revenue: 100 }, rec({ endorses: true })),
    week("2026-W23", { revenue: 100 }, rec({ endorses: true })),
  ];
  assert.equal(computeStuckSignal(weeks, REVENUE_APPROACH).stuck, false);
});

test("fewer than STUCK_WINDOW weeks = not stuck", () => {
  const weeks = [
    week("2026-W22", { revenue: 100 }, rec({ endorses: false })),
    week("2026-W23", { revenue: 100 }, rec({ endorses: false })),
  ];
  const s = computeStuckSignal(weeks, REVENUE_APPROACH);
  assert.equal(s.stuck, false);
  assert.equal(s.weeksConsidered, 2);
});

// --- supporting guarantees --------------------------------------------------

test("success metric improving across the window = not stuck", () => {
  const weeks = [
    week("2026-W21", { revenue: 100 }, rec({ endorses: false })),
    week("2026-W22", { revenue: 120 }, rec({ endorses: false })),
    week("2026-W23", { revenue: 150 }, rec({ endorses: false })), // revenue climbed
  ];
  assert.equal(computeStuckSignal(weeks, REVENUE_APPROACH).stuck, false);
});

test("absent success metric is unknown, not 'no progress' (still stuck on the move signal alone)", () => {
  // Revenue never reported -> we cannot say it improved; verdict rests on the
  // three unendorsed moves. It must NOT flip to "not stuck" just because the
  // metric is absent, nor be treated as a value.
  const weeks = [
    week("2026-W21", {}, rec({ endorses: false })),
    week("2026-W22", {}, rec({ endorses: false })),
    week("2026-W23", {}, rec({ endorses: false })),
  ];
  assert.equal(computeStuckSignal(weeks, REVENUE_APPROACH).stuck, true);
});

test("a non-success (vanity) metric rising does not clear a stuck focus", () => {
  // leads climb, but the approach's success metric is revenue and it is flat.
  const weeks = [
    week("2026-W21", { revenue: 100, leads: 10 }, rec({ endorses: false })),
    week("2026-W22", { revenue: 100, leads: 30 }, rec({ endorses: false })),
    week("2026-W23", { revenue: 100, leads: 80 }, rec({ endorses: false })),
  ];
  assert.equal(computeStuckSignal(weeks, REVENUE_APPROACH).stuck, true);
});

test("lastMoveAssessment reporting no movement counts even when the critic endorsed", () => {
  const weeks = [
    week("2026-W21", { revenue: 100 }, rec({ endorses: true, lastMoveAssessment: "The move did not move the numbers." })),
    week("2026-W22", { revenue: 100 }, rec({ endorses: true, lastMoveAssessment: "Revenue stayed flat." })),
    week("2026-W23", { revenue: 100 }, rec({ endorses: true, lastMoveAssessment: "No change again." })),
  ];
  assert.equal(computeStuckSignal(weeks, REVENUE_APPROACH).stuck, true);
});

test("no chosen approach yet = not stuck", () => {
  const weeks = [
    week("2026-W21", { revenue: 100 }, rec({ endorses: false })),
    week("2026-W22", { revenue: 100 }, rec({ endorses: false })),
    week("2026-W23", { revenue: 100 }, rec({ endorses: false })),
  ];
  assert.equal(computeStuckSignal(weeks, null).stuck, false);
});

test("a week with no recommendation breaks the stuck chain", () => {
  const weeks = [
    week("2026-W21", { revenue: 100 }, rec({ endorses: false })),
    week("2026-W22", { revenue: 100 }), // no recommendation (e.g. not yet synthesised)
    week("2026-W23", { revenue: 100 }, rec({ endorses: false })),
  ];
  assert.equal(computeStuckSignal(weeks, REVENUE_APPROACH).stuck, false);
});

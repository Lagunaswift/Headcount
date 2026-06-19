import { test } from "node:test";
import assert from "node:assert/strict";
import { planWeeklyRun, deriveSubGoal } from "./subgoal.ts";
import type { Project, Week, ChosenApproach, ProjectMode } from "../lib/model";

const chosen: ChosenApproach = {
  fromQuarter: "qtr_1",
  gatingQuestion: "does activation work?",
  approach: {
    title: "Instrument activation",
    rationale: "r",
    successSignal: "activated users (3+ workouts in week one) rises",
  },
  chosenAt: 0,
};

function project(mode: ProjectMode, opts: Partial<Project> = {}): Project {
  return {
    id: "proj_1",
    businessId: "biz_1",
    name: "First 50 paying users",
    description: "d",
    currentSubGoal: "operator's original sub-goal",
    successLooksLike: "s",
    trackedMetrics: ["leads", "new_customers"],
    mode,
    gatingQuestion: opts.gatingQuestion ?? null,
    chosenApproach: opts.chosenApproach ?? null,
    createdAt: 0,
    ...opts,
  };
}

function week(whatHappened: string): Week {
  return {
    id: "week_1",
    projectId: "proj_1",
    weekOf: "2026-W23",
    whatHappened,
    metrics: {},
    blockers: "",
    createdAt: 0,
  };
}

// --- planWeeklyRun: the §5 mode gate -----------------------------------------

test("dark project rejects the run with 400", () => {
  const action = planWeeklyRun(project("dark", { chosenApproach: chosen }), null);
  assert.equal(action.kind, "reject");
  if (action.kind === "reject") assert.equal(action.status, 400);
});

test("maintenance project records only, no chain", () => {
  const action = planWeeklyRun(project("maintenance", { chosenApproach: chosen }), null);
  assert.equal(action.kind, "record");
});

test("focus project runs the chain against a derived sub-goal", () => {
  const action = planWeeklyRun(project("focus", { chosenApproach: chosen }), null);
  assert.equal(action.kind, "run");
  if (action.kind === "run") {
    assert.match(action.subGoal, /activated users/);
  }
});

// --- deriveSubGoal: §4 option (a) --------------------------------------------

test("with no chosen approach, falls back to the operator's currentSubGoal", () => {
  assert.equal(deriveSubGoal(project("focus"), null), "operator's original sub-goal");
});

test("with a chosen approach, the sub-goal is the approach's success signal", () => {
  const g = deriveSubGoal(project("focus", { chosenApproach: chosen }), null);
  assert.equal(g, "activated users (3+ workouts in week one) rises");
});

test("with a last week, the derived sub-goal is narrowed by what happened", () => {
  const g = deriveSubGoal(
    project("focus", { chosenApproach: chosen }),
    week("Added the activation event and shipped the onboarding checklist.")
  );
  assert.match(g, /activated users/);
  assert.match(g, /continuing from:/);
  assert.match(g, /onboarding checklist/);
});

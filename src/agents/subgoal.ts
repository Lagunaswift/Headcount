// ---------------------------------------------------------------------------
// Sub-goal derivation + weekly mode planning. Both are deterministic (no LLM),
// so the "runs on rails" promise holds: once the operator picks an approach,
// each week's sub-goal is derived rather than typed by hand, and the weekly
// route's behaviour per project mode is decided by a pure function the tests
// can exercise without an API key.
// ---------------------------------------------------------------------------

import type { Project, Week } from "@/lib/model";

function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length <= n ? t : `${t.slice(0, n - 1).trimEnd()}…`;
}

// §4 option (a), deterministic: the sub-goal IS the chosen approach's success
// signal — the thing the weekly loop measures against — narrowed by what last
// week actually did, so it sharpens rather than repeating verbatim each week.
// Day-one fallback: a project with no chosen approach yet keeps the operator's
// initial currentSubGoal, so nothing breaks before the first Advisor run.
// (Upgrade path, if these read too static across weeks: swap this body for a
// cheap-model call — the signature stays the same.)
export function deriveSubGoal(project: Project, lastWeek: Week | null): string {
  const chosen = project.chosenApproach;
  if (!chosen) return project.currentSubGoal;
  const goal = chosen.approach.successSignal;
  const carry = lastWeek?.whatHappened?.trim();
  return carry ? `${goal} — continuing from: ${truncate(carry, 120)}` : goal;
}

// What the weekly route should do for a project, decided purely from its mode.
//   dark        -> reject: the project takes no input this quarter
//   maintenance -> record only: the week's numbers are already logged; no chain
//   focus       -> run the full chain against the derived sub-goal
export type WeeklyAction =
  | { kind: "reject"; status: number; message: string }
  | { kind: "record" }
  | { kind: "run"; subGoal: string };

export function planWeeklyRun(project: Project, lastWeek: Week | null): WeeklyAction {
  switch (project.mode) {
    case "dark":
      return {
        kind: "reject",
        status: 400,
        message: `"${project.name}" is dark this quarter and accepts no input. Change its mode via the Manager to log or run it.`,
      };
    case "maintenance":
      return { kind: "record" };
    case "focus":
    default:
      return { kind: "run", subGoal: deriveSubGoal(project, lastWeek) };
  }
}

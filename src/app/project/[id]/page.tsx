"use client";
import { useEffect, useState, use } from "react";

const METRIC_KEYS = ["leads", "new_customers", "active_customers", "lost_customers", "revenue", "spend"] as const;

interface Project {
  id: string; name: string; description: string; currentSubGoal: string;
  successLooksLike: string; trackedMetrics: string[];
}
interface Recommendation {
  oneMove: string; rationale: string; tradeOff: string;
  lastMoveAssessment: string | null; requestsWorkProduct: string | null;
  critique?: {
    chiefObjection: string | null; constraintBreach: string | null;
    evidenceVerdict: string; endorses: boolean;
  };
}
interface Week {
  id: string; weekOf: string; whatHappened: string;
  metrics: Record<string, number>; blockers: string; recommendation?: Recommendation;
}
interface Product {
  id: string; weekId: string; type: string; status: string;
  body: string; meta: { title?: string; subject?: string; platform?: string };
}

function isoWeekNow(): string {
  const d = new Date();
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((target.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [running, setRunning] = useState(false);

  // form state
  const [weekOf, setWeekOf] = useState(isoWeekNow());
  const [whatHappened, setWhatHappened] = useState("");
  const [blockers, setBlockers] = useState("");
  const [metricVals, setMetricVals] = useState<Record<string, string>>({});

  async function load() {
    const r = await fetch(`/api/projects/${id}/context`);
    const d = await r.json();
    setProject(d.project);
    setWeeks(d.weeks);
    setProducts(d.products);
  }
  useEffect(() => { load(); }, [id]);

  const tracked = project?.trackedMetrics ?? [];

  async function runWeek() {
    if (!project) return;
    setRunning(true);
    try {
      // 1. save the week
      const metrics: Record<string, string> = {};
      for (const k of tracked) if (metricVals[k] !== undefined && metricVals[k] !== "") metrics[k] = metricVals[k];
      const wr = await fetch("/api/weeks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, weekOf, whatHappened, blockers, metrics }),
      });
      const { week } = await wr.json();
      // 2. run the loop
      await fetch("/api/synthesise", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: id, weekId: week.id, weekOf }),
      });
      // 3. reset + reload
      setWhatHappened(""); setBlockers(""); setMetricVals({});
      await load();
    } finally { setRunning(false); }
  }

  async function setStatus(productId: string, status: string) {
    let note: string | null = null;
    if (status === "rejected") note = prompt("Why are you rejecting this? (the Writer would use this to revise)") || null;
    await fetch("/api/products/status", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, status, note }),
    });
    await load();
  }

  if (!project) return <div className="wrap"><p className="spin">Loading…</p></div>;

  const reportedThisForm = tracked.filter((k) => metricVals[k] !== undefined && metricVals[k] !== "");
  const willBeMissing = tracked.filter((k) => !reportedThisForm.includes(k));

  return (
    <div className="wrap">
      <a href="/" className="mono" style={{ fontSize: 12 }}>← all businesses</a>
      <div className="eyebrow" style={{ marginTop: 18 }}>Project</div>
      <h1>{project.name}</h1>
      <p className="muted">{project.description}</p>
      <div className="card" style={{ marginTop: 14 }}>
        <span className="label">Current sub-goal</span>
        <div className="move" style={{ fontSize: 17 }}>{project.currentSubGoal}</div>
        <span className="label">Success looks like</span>
        <p className="muted" style={{ marginBottom: 0 }}>{project.successLooksLike}</p>
      </div>

      <hr className="rule" />

      {/* ---------------- weekly input ---------------- */}
      <h3>Log this week</h3>
      <div className="card">
        <span className="label">Week of (ISO)</span>
        <input value={weekOf} onChange={(e) => setWeekOf(e.target.value)} className="mono" />

        <span className="label">What happened</span>
        <textarea value={whatHappened} onChange={(e) => setWhatHappened(e.target.value)}
          placeholder="What you actually did, what moved, what landed." />

        <span className="label">Metrics — leave blank what you did not measure (blank means no data, not zero)</span>
        <div className="metrics-grid">
          {tracked.map((k) => (
            <div className="metric-cell" key={k}>
              <span className="label">{k}</span>
              <input type="number" value={metricVals[k] ?? ""} className="mono"
                onChange={(e) => setMetricVals((m) => ({ ...m, [k]: e.target.value }))} />
            </div>
          ))}
        </div>
        {willBeMissing.length > 0 && (
          <div className="miss">Will be flagged as no data: {willBeMissing.join(", ")}</div>
        )}

        <span className="label" style={{ marginTop: 14 }}>Blockers</span>
        <textarea value={blockers} onChange={(e) => setBlockers(e.target.value)}
          placeholder="What is stuck." />

        <div className="row" style={{ marginTop: 6 }}>
          <button onClick={runWeek} disabled={running || !whatHappened}>
            {running ? "Agents working…" : "Run the week"}
          </button>
          {running && <span className="spin">Synthesiser deciding, Writer drafting if needed…</span>}
        </div>
      </div>

      <hr className="rule" />

      {/* ---------------- history ---------------- */}
      <h3>The loop, week by week</h3>
      {weeks.length === 0 && <p className="muted">No weeks logged yet.</p>}
      {weeks.map((w) => {
        const rec = w.recommendation;
        const prods = products.filter((p) => p.weekId === w.id);
        return (
          <div className="card" key={w.id}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="mono" style={{ fontWeight: 600 }}>{w.weekOf}</span>
              <span className="mono muted" style={{ fontSize: 12 }}>
                {Object.keys(w.metrics).length ? Object.entries(w.metrics).map(([k, v]) => `${k} ${v}`).join("  ·  ") : "no metrics"}
              </span>
            </div>
            <p style={{ marginTop: 8 }}>{w.whatHappened}</p>
            {w.blockers && <p className="muted" style={{ fontSize: 14 }}><em>Blocked:</em> {w.blockers}</p>}

            {rec && (
              <div style={{ borderTop: "1px solid var(--line)", marginTop: 12, paddingTop: 14 }}>
                <span className="label">The move</span>
                <div className="move">{rec.oneMove}</div>
                <p><span className="label" style={{ display: "inline" }}>why </span>{rec.rationale}</p>
                <p className="muted" style={{ fontSize: 14 }}><em>Trade-off:</em> {rec.tradeOff}</p>
                {rec.critique && (rec.critique.chiefObjection || rec.critique.constraintBreach) && (
                  <div style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 12, margin: "12px 0", fontSize: 14 }}>
                    <span className="label" style={{ color: "var(--accent)" }}>
                      Critic {rec.critique.endorses ? "(addressed)" : "(challenged)"}
                    </span>
                    {rec.critique.constraintBreach && (
                      <p style={{ marginBottom: 4 }}><em>Constraint:</em> {rec.critique.constraintBreach}</p>
                    )}
                    {rec.critique.chiefObjection && (
                      <p style={{ marginBottom: 4 }}><em>Objection:</em> {rec.critique.chiefObjection}</p>
                    )}
                    <p className="muted" style={{ marginBottom: 0 }}>{rec.critique.evidenceVerdict}</p>
                  </div>
                )}
                {rec.lastMoveAssessment && (
                  <p style={{ fontSize: 14 }}><em>Did last week&apos;s move work? </em>{rec.lastMoveAssessment}</p>
                )}
              </div>
            )}

            {prods.map((p) => (
              <div key={p.id} style={{ borderTop: "1px dashed var(--line)", marginTop: 14, paddingTop: 14 }}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="label" style={{ marginBottom: 0 }}>
                    Drafted {p.type.replace("_", " ")}{p.meta.title ? `: ${p.meta.title}` : ""}
                  </span>
                  <span className={`tag ${p.status}`}>{p.status}</span>
                </div>
                <div className="body-prose" style={{ marginTop: 10 }}>{p.body}</div>
                {p.status === "draft" && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <button onClick={() => setStatus(p.id, "approved")}>Approve</button>
                    <button className="ghost" onClick={() => setStatus(p.id, "rejected")}>Reject</button>
                  </div>
                )}
                {p.status === "approved" && (
                  <div className="row" style={{ marginTop: 10 }}>
                    <button onClick={() => setStatus(p.id, "published")}>Mark published</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

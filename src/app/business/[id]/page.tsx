"use client";
import { useEffect, useState, use } from "react";

type Mode = "focus" | "maintenance" | "dark";

interface Approach { title: string; rationale: string; successSignal: string; }
interface Project {
  id: string; name: string; description: string; mode: Mode;
  gatingQuestion: string | null;
  chosenApproach: { gatingQuestion: string; approach: Approach } | null;
}
interface Biz { id: string; name: string; overallGoal: string; }
interface Quarter {
  id: string; label: string; focusProjectId: string | null;
  projectModes: Record<string, Mode>; judgment: unknown; closed: boolean;
}
interface ManagerReport {
  recommendedFocusProjectId: string; focusReason: string;
  modeRecommendations: { projectId: string; mode: Mode; why: string }[];
  stuckTrigger: string | null;
}
interface AdvisorReport {
  gatingQuestion: string; approaches: Approach[]; leadIndex: number; leadReason: string;
}
interface Stuck { stuck: boolean; reason: string; weeksConsidered: number; }

const MODES: Mode[] = ["focus", "maintenance", "dark"];

export default function BusinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [quarter, setQuarter] = useState<Quarter | null>(null);
  const [stuck, setStuck] = useState<Stuck | null>(null);

  const [manager, setManager] = useState<ManagerReport | null>(null);
  const [advisor, setAdvisor] = useState<AdvisorReport | null>(null);
  const [focusChoice, setFocusChoice] = useState<string>("");
  const [modeChoices, setModeChoices] = useState<Record<string, Mode>>({});

  const [busy, setBusy] = useState<string>("");
  const [err, setErr] = useState<string>("");

  async function load() {
    const bl = await (await fetch("/api/businesses")).json();
    setBiz((bl.businesses as Biz[]).find((b) => b.id === id) ?? null);
    const ps: Project[] = (await (await fetch(`/api/projects?businessId=${id}`)).json()).projects;
    setProjects(ps);
    const q: Quarter | null = (await (await fetch(`/api/quarters/open?businessId=${id}`)).json()).quarter;
    setQuarter(q);
    if (q?.focusProjectId) {
      const s = await (await fetch(`/api/quarters/stuck?projectId=${q.focusProjectId}`)).json();
      setStuck(s.stuck);
    } else {
      setStuck(null);
    }
  }
  useEffect(() => { load(); }, [id]);

  // POST helper that surfaces the server's error text instead of swallowing it.
  async function post(url: string, body: unknown): Promise<Record<string, unknown> | null> {
    const r = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(`${url}: ${(d as { error?: string }).error ?? r.status}`); return null; }
    return d as Record<string, unknown>;
  }

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(label); setErr("");
    try { await fn(); } catch (e) { setErr(String(e)); } finally { setBusy(""); }
  }

  const openQuarter = () => run("open", async () => {
    await post("/api/quarters/open", { businessId: id });
    await load();
  });

  const runManager = (pullForward = false) => run("manager", async () => {
    const d = await post("/api/quarters/manager", { businessId: id, pullForward });
    if (!d) return;
    const report = d.report as ManagerReport;
    setManager(report);
    setFocusChoice(report.recommendedFocusProjectId);
    const m: Record<string, Mode> = {};
    for (const r of report.modeRecommendations) m[r.projectId] = r.mode;
    m[report.recommendedFocusProjectId] = "focus";
    setModeChoices(m);
  });

  const applyFocus = () => run("focus", async () => {
    if (!quarter || !focusChoice) return;
    await post("/api/quarters/focus", {
      quarterId: quarter.id, focusProjectId: focusChoice, projectModes: modeChoices,
    });
    setManager(null);
    await load();
  });

  const runAdvisor = (projectId: string) => run("advisor", async () => {
    const d = await post("/api/quarters/advisor", { projectId });
    if (d) setAdvisor(d.report as AdvisorReport);
  });

  const pickApproach = (projectId: string, gatingQuestion: string, approach: Approach) =>
    run("approach", async () => {
      await post("/api/quarters/approach", { projectId, gatingQuestion, approach });
      setAdvisor(null);
      await load();
    });

  const closeQuarter = (pulledForward = false) => run("close", async () => {
    await post("/api/quarters/close", { businessId: id, pulledForward });
    setManager(null); setAdvisor(null);
    await load();
  });

  if (!biz) return <div className="wrap"><p className="spin">Loading…</p></div>;

  const focusProject = projects.find((p) => p.id === quarter?.focusProjectId) ?? null;

  return (
    <div className="wrap">
      <a href="/" className="mono" style={{ fontSize: 12 }}>← all businesses</a>
      <div className="eyebrow" style={{ marginTop: 18 }}>Portfolio · Quarter</div>
      <h1>{biz.name}</h1>
      <p className="muted">{biz.overallGoal}</p>

      {err && <div className="banner" style={{ borderColor: "var(--accent)" }}>
        <span className="label" style={{ color: "var(--accent)" }}>Error</span>{err}
      </div>}

      {/* ---------------- the quarter ---------------- */}
      <hr className="rule" />
      {!quarter && (
        <div className="card">
          <h3>No open quarter</h3>
          <p className="muted">A quarter is the unit the Manager and Advisor operate on.</p>
          <button onClick={openQuarter} disabled={busy === "open"}>
            {busy === "open" ? "Opening…" : "Open a quarter"}
          </button>
        </div>
      )}

      {quarter && (
        <>
          <div className="card">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 style={{ margin: 0 }}>{quarter.label}</h2>
              <span className="mono muted" style={{ fontSize: 12 }}>
                focus: {focusProject ? focusProject.name : "not set"}
              </span>
            </div>

            {/* every project's mode at a glance */}
            <div style={{ marginTop: 14 }}>
              {projects.map((p) => (
                <div key={p.id} className="row" style={{ justifyContent: "space-between", borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
                  <a href={`/project/${p.id}`}>{p.name}</a>
                  <span className={`tag ${p.mode}`}>{p.mode}</span>
                </div>
              ))}
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button onClick={() => runManager(false)} disabled={!!busy}>
                {busy === "manager" ? "Manager thinking…" : "Run Manager"}
              </button>
              <button className="ghost" onClick={() => closeQuarter(false)} disabled={!!busy}>
                {busy === "close" ? "Closing…" : "Close quarter"}
              </button>
            </div>
          </div>

          {/* stuck banner on the focus project */}
          {stuck?.stuck && (
            <div className="banner">
              <span className="label">Focus is stuck</span>
              {stuck.reason}
              <div className="row" style={{ marginTop: 10 }}>
                <button onClick={() => runManager(true)} disabled={!!busy}>Pull focus forward</button>
              </div>
            </div>
          )}

          {/* Manager report -> confirm focus + modes */}
          {manager && (
            <div className="card">
              <h3>Manager&apos;s recommendation</h3>
              <span className="label">Put on focus</span>
              <div className="move" style={{ fontSize: 17 }}>
                {projects.find((p) => p.id === manager.recommendedFocusProjectId)?.name ?? manager.recommendedFocusProjectId}
              </div>
              <p>{manager.focusReason}</p>
              {manager.stuckTrigger && (
                <p className="muted" style={{ fontSize: 14 }}><em>Stuck trigger:</em> {manager.stuckTrigger}</p>
              )}
              <span className="label" style={{ marginTop: 10 }}>What to ignore this quarter</span>
              {manager.modeRecommendations.map((r) => (
                <p key={r.projectId} style={{ fontSize: 14, marginBottom: 6 }}>
                  <span className={`tag ${r.mode}`}>{r.mode}</span>{" "}
                  {projects.find((p) => p.id === r.projectId)?.name ?? r.projectId} — {r.why}
                </p>
              ))}

              <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
                <span className="label">Confirm focus + modes</span>
                {projects.map((p) => (
                  <div className="row" key={p.id} style={{ justifyContent: "space-between", marginBottom: 8 }}>
                    <span>{p.name}</span>
                    <div className="row">
                      <label className="mono" style={{ fontSize: 12 }}>
                        <input type="radio" name="focus" style={{ width: "auto", marginRight: 6 }}
                          checked={focusChoice === p.id} onChange={() => setFocusChoice(p.id)} />
                        focus
                      </label>
                      <select style={{ width: "auto", marginBottom: 0 }}
                        value={focusChoice === p.id ? "focus" : (modeChoices[p.id] ?? "maintenance")}
                        disabled={focusChoice === p.id}
                        onChange={(e) => setModeChoices((m) => ({ ...m, [p.id]: e.target.value as Mode }))}>
                        {MODES.filter((m) => m !== "focus").map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
                <button onClick={applyFocus} disabled={!!busy || !focusChoice} style={{ marginTop: 8 }}>
                  {busy === "focus" ? "Applying…" : "Apply focus + modes"}
                </button>
              </div>
            </div>
          )}

          {/* Advisor: gating question + approaches for the focus project */}
          {focusProject && (
            <div className="card">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <h3 style={{ marginBottom: 0 }}>Advisor · {focusProject.name}</h3>
                <button className="ghost" onClick={() => runAdvisor(focusProject.id)} disabled={!!busy}>
                  {busy === "advisor" ? "Advisor thinking…" : "Run Advisor"}
                </button>
              </div>

              {focusProject.chosenApproach && !advisor && (
                <div style={{ marginTop: 12 }}>
                  <span className="label">Chosen this quarter</span>
                  <p style={{ marginBottom: 4 }}><em>Q:</em> {focusProject.chosenApproach.gatingQuestion}</p>
                  <div className="approach lead">
                    <strong>{focusProject.chosenApproach.approach.title}</strong>
                    <p className="muted mono" style={{ fontSize: 13, marginBottom: 0 }}>
                      success: {focusProject.chosenApproach.approach.successSignal}
                    </p>
                  </div>
                </div>
              )}

              {advisor && (
                <div style={{ marginTop: 12 }}>
                  <span className="label">Gating question</span>
                  <div className="move" style={{ fontSize: 17 }}>{advisor.gatingQuestion}</div>
                  {advisor.approaches.map((a, i) => (
                    <div key={i} className={`approach${i === advisor.leadIndex ? " lead" : ""}`}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                        <strong>{a.title}</strong>
                        {i === advisor.leadIndex && <span className="tag focus">lead</span>}
                      </div>
                      <p style={{ fontSize: 14 }}>{a.rationale}</p>
                      <p className="muted mono" style={{ fontSize: 13 }}>success: {a.successSignal}</p>
                      {i === advisor.leadIndex && (
                        <p className="muted" style={{ fontSize: 13 }}><em>why lead:</em> {advisor.leadReason}</p>
                      )}
                      <button onClick={() => pickApproach(focusProject.id, advisor.gatingQuestion, a)} disabled={!!busy}>
                        {busy === "approach" ? "Saving…" : "Pick this approach"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

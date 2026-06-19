"use client";
import { useEffect, useState } from "react";

interface Biz { id: string; name: string; overallGoal: string; }
interface Proj { id: string; name: string; currentSubGoal: string; mode: string; }
interface Quarter { id: string; label: string; focusProjectId: string | null; }

export default function Home() {
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [projects, setProjects] = useState<Record<string, Proj[]>>({});
  const [quarters, setQuarters] = useState<Record<string, Quarter | null>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/businesses");
    const { businesses } = await r.json();
    setBusinesses(businesses);
    const pmap: Record<string, Proj[]> = {};
    const qmap: Record<string, Quarter | null> = {};
    for (const b of businesses) {
      const pr = await fetch(`/api/projects?businessId=${b.id}`);
      pmap[b.id] = (await pr.json()).projects;
      const qr = await fetch(`/api/quarters/open?businessId=${b.id}`);
      qmap[b.id] = (await qr.json()).quarter;
    }
    setProjects(pmap);
    setQuarters(qmap);
  }
  useEffect(() => { load(); }, []);

  async function seed() {
    setBusy(true);
    await fetch("/api/seed", { method: "POST" });
    await load();
    setBusy(false);
  }

  return (
    <div className="wrap">
      <div className="eyebrow">Operating System</div>
      <h1>The company as three loops.</h1>
      <p className="muted">
        A portfolio of businesses. Each quarter the Manager names the ONE focus
        project and parks the rest; the Advisor sets that project&apos;s gating
        question and the approach you pick; then the weekly loop runs it on rails.
        Maintenance projects log their numbers without producing moves; dark
        projects pause entirely.
      </p>

      <div className="row" style={{ marginTop: 18 }}>
        <button onClick={seed} disabled={busy}>
          {busy ? "Seeding…" : "Seed AthleticHive example"}
        </button>
      </div>

      <hr className="rule" />

      {businesses.length === 0 && <p className="muted">No businesses yet. Seed the example to begin.</p>}

      {businesses.map((b) => {
        const q = quarters[b.id];
        const ps = projects[b.id] ?? [];
        return (
          <div className="card" key={b.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
              <div>
                <div className="eyebrow">Business</div>
                <h2>{b.name}</h2>
              </div>
              <a href={`/business/${b.id}`} className="mono" style={{ fontSize: 12 }}>
                {q ? `quarter ${q.label} →` : "open a quarter →"}
              </a>
            </div>
            <p className="muted" style={{ marginBottom: 14 }}>{b.overallGoal}</p>
            {ps.map((p) => (
              <div key={p.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <a href={`/project/${p.id}`} style={{ fontSize: 18 }}>{p.name}</a>
                  <span className={`tag ${p.mode}`}>{p.mode}</span>
                </div>
                <div className="muted mono" style={{ fontSize: 13 }}>{p.currentSubGoal}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

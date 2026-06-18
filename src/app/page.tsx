"use client";
import { useEffect, useState } from "react";

interface Biz { id: string; name: string; overallGoal: string; }
interface Proj { id: string; name: string; currentSubGoal: string; }

export default function Home() {
  const [businesses, setBusinesses] = useState<Biz[]>([]);
  const [projects, setProjects] = useState<Record<string, Proj[]>>({});
  const [busy, setBusy] = useState(false);

  async function load() {
    const r = await fetch("/api/businesses");
    const { businesses } = await r.json();
    setBusinesses(businesses);
    const map: Record<string, Proj[]> = {};
    for (const b of businesses) {
      const pr = await fetch(`/api/projects?businessId=${b.id}`);
      map[b.id] = (await pr.json()).projects;
    }
    setProjects(map);
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
      <h1>The company as a weekly loop.</h1>
      <p className="muted">
        Each business has one permanent goal and a set of constraints. Each project
        carries one sub-goal. Every week you log what happened; the Synthesiser names
        one move and judges whether last week&apos;s move worked. When a move needs
        something written, the Writer drafts it for your approval.
      </p>

      <div className="row" style={{ marginTop: 18 }}>
        <button onClick={seed} disabled={busy}>
          {busy ? "Seeding…" : "Seed AthleticHive example"}
        </button>
      </div>

      <hr className="rule" />

      {businesses.length === 0 && <p className="muted">No businesses yet. Seed the example to begin.</p>}

      {businesses.map((b) => (
        <div className="card" key={b.id}>
          <div className="eyebrow">Business</div>
          <h2>{b.name}</h2>
          <p className="muted" style={{ marginBottom: 14 }}>{b.overallGoal}</p>
          {(projects[b.id] ?? []).map((p) => (
            <div key={p.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
              <span className="label">Project</span>
              <a href={`/project/${p.id}`} style={{ fontSize: 18 }}>{p.name}</a>
              <div className="muted mono" style={{ fontSize: 13 }}>{p.currentSubGoal}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

import React from "react";
import { useSkillRegistry } from "../hooks/useSkillRegistry";

export function SkillRegistryPanel() {
  const { skills, grouped, loading, error, refresh } = useSkillRegistry();

  return (
    <div className="panel">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0 }}>On-chain Skill Registry</h3>
        <button className="btn btn-small" onClick={refresh}>Refresh</button>
      </div>
      {loading ? <div>Loading skills...</div> : null}
      {error ? <div style={{ color: "#ff6b6b" }}>{error}</div> : null}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
        <Metric label="Active" value={grouped.active.length} />
        <Metric label="Draft" value={grouped.draft.length} />
        <Metric label="Paused" value={grouped.paused.length} />
        <Metric label="Deprecated" value={grouped.deprecated.length} />
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {skills.map((skill) => (
          <div key={skill.skillId} style={{ border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 600 }}>{skill.namespace}/{skill.name}</div>
                <div style={{ opacity: 0.72, fontSize: 13 }}>{skill.description}</div>
              </div>
              <span className="badge">{skill.status}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {(skill.tags ?? []).map((tag) => (
                <span className="badge" key={tag}>{tag}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.16)", borderRadius: 10, padding: 8, textAlign: "center" }}>
      <div style={{ fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", opacity: 0.65 }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 18, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

/**
 * EvolvePanel.jsx
 *
 * Sidebar panel for the Self-Evolving Skill Engine.
 * Lets users describe a skill in natural language and trigger auto-generation.
 * Shows evolved skills with their quality scores and test results.
 */

import { useState, useEffect, useCallback } from "react";
import client from "../services/api.js";

export default function EvolvePanel({ walletAddress }) {
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [minScore, setMinScore] = useState(0.6);
  const [evolving, setEvolving] = useState(false);
  const [result, setResult] = useState(null);
  const [evolvedSkills, setEvolvedSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const loadEvolvedSkills = useCallback(async () => {
    setLoading(true);
    try {
      const r = await client.get("/api/evolution/skills");
      setEvolvedSkills(r.data?.payload?.skills || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadEvolvedSkills(); }, [loadEvolvedSkills]);

  const handleEvolve = async () => {
    if (!description.trim()) return;
    setEvolving(true);
    setResult(null);
    try {
      const r = await client.post("/api/evolution/evolve", {
        description: description.trim(),
        tags: tags.split(",").map(t => t.trim()).filter(Boolean),
        minScore,
        maxAttempts: 3,
      });
      setResult(r.data?.payload);
      if (r.data?.payload?.success) {
        await loadEvolvedSkills();
        setDescription("");
        setTags("");
      }
    } catch (err) {
      setResult({ success: false, error: err.message, score: 0, testResults: [], attempts: 0, durationMs: 0 });
    }
    setEvolving(false);
  };

  const scoreColor = (score) => {
    if (score >= 0.8) return "#10b981";
    if (score >= 0.6) return "#f59e0b";
    return "#ef4444";
  };

  const scoreLabel = (score) => {
    if (score >= 0.8) return "Excellent";
    if (score >= 0.6) return "Good";
    if (score >= 0.4) return "Fair";
    return "Poor";
  };

  return (
    <div className="evolve-panel">
      <div className="evolve-header">
        <span className="evolve-icon">🧬</span>
        <span>Self-Evolving Skills</span>
        <span className="evolve-badge">0G Compute</span>
      </div>

      <div className="evolve-description-text">
        Describe a skill in plain English. The framework will generate, test, and
        hot-register it automatically using 0G Compute.
      </div>

      {/* Generation form */}
      <div className="evolve-form">
        <label className="evolve-label">Skill Description</label>
        <textarea
          className="evolve-textarea"
          rows={4}
          placeholder="e.g. Fetch the current gas price on Ethereum and return it in Gwei"
          value={description}
          onChange={e => setDescription(e.target.value)}
          disabled={evolving}
        />

        <label className="evolve-label">Tags (comma-separated)</label>
        <input
          className="evolve-input"
          placeholder="defi, price, gas"
          value={tags}
          onChange={e => setTags(e.target.value)}
          disabled={evolving}
        />

        <label className="evolve-label">Min Quality Score: {minScore.toFixed(2)}</label>
        <input
          type="range"
          min={0.3} max={0.95} step={0.05}
          value={minScore}
          onChange={e => setMinScore(parseFloat(e.target.value))}
          disabled={evolving}
          className="evolve-range"
        />

        <button
          className="evolve-btn"
          onClick={handleEvolve}
          disabled={evolving || !description.trim()}
        >
          {evolving ? (
            <><span className="spinner-sm" /> Evolving…</>
          ) : (
            "⚡ Generate & Register Skill"
          )}
        </button>
      </div>

      {/* Result */}
      {result && (
        <div className={`evolve-result ${result.success ? "success" : "failure"}`}>
          <div className="evolve-result-header">
            <span>{result.success ? "✓ Skill Evolved!" : "✗ Evolution Failed"}</span>
            <span className="evolve-result-score" style={{ color: scoreColor(result.score) }}>
              Score: {(result.score * 100).toFixed(0)}% ({scoreLabel(result.score)})
            </span>
          </div>
          {result.success && result.skillManifest && (
            <div className="evolve-result-id">
              ID: <code>{result.skillManifest.id}</code>
            </div>
          )}
          {result.error && (
            <div className="evolve-result-error">{result.error}</div>
          )}
          <div className="evolve-result-meta">
            {result.attempts} attempt{result.attempts !== 1 ? "s" : ""} · {result.durationMs}ms
            {result.testResults?.length > 0 && (
              <> · {result.testResults.filter(t => t.passed).length}/{result.testResults.length} tests passed</>
            )}
          </div>
        </div>
      )}

      {/* Evolved skills list */}
      <div className="evolve-skills-header">
        <span>Evolved Skills ({evolvedSkills.length})</span>
        <button className="evolve-refresh" onClick={loadEvolvedSkills} disabled={loading}>
          {loading ? "…" : "↻"}
        </button>
      </div>

      <div className="evolve-skills-list">
        {evolvedSkills.length === 0 && !loading && (
          <div className="evolve-empty">No evolved skills yet. Generate your first one above.</div>
        )}
        {evolvedSkills.map(skill => (
          <div
            key={skill.id}
            className={`evolve-skill-card ${expanded === skill.id ? "expanded" : ""}`}
            onClick={() => setExpanded(expanded === skill.id ? null : skill.id)}
          >
            <div className="evolve-skill-top">
              <div className="evolve-skill-info">
                <code className="evolve-skill-id">{skill.id}</code>
                <div className="evolve-skill-desc">{skill.description.slice(0, 60)}</div>
              </div>
              <div className="evolve-skill-score" style={{ color: scoreColor(skill.score) }}>
                {(skill.score * 100).toFixed(0)}%
              </div>
            </div>

            {expanded === skill.id && (
              <div className="evolve-skill-detail">
                <div className="evolve-skill-tags">
                  {skill.manifest?.tags?.map(t => (
                    <span key={t} className="skill-tag">{t}</span>
                  ))}
                </div>
                <div className="evolve-skill-tests">
                  {skill.testResults?.map((tr, i) => (
                    <div key={i} className={`evolve-test ${tr.passed ? "pass" : "fail"}`}>
                      {tr.passed ? "✓" : "✗"} Test {i + 1}
                      {tr.error && <span className="evolve-test-error"> — {tr.error.slice(0, 50)}</span>}
                    </div>
                  ))}
                </div>
                {skill.storageHash && (
                  <div className="evolve-storage-hash">
                    0G Hash: <code>{skill.storageHash.slice(0, 20)}…</code>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * OnChainPanel.jsx
 *
 * Sidebar panel for the on-chain SkillRegistry contract on 0G Network.
 * Shows all published skills, allows endorsing and publishing new ones.
 */

import { useState, useEffect, useCallback } from "react";
import client from "../services/api.js";

export default function OnChainPanel({ walletAddress }) {
  const [skills, setSkills] = useState([]);
  const [loading, setLoading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishForm, setPublishForm] = useState({
    id: "", name: "", description: "", contentHash: "", tags: "",
  });
  const [showPublishForm, setShowPublishForm] = useState(false);
  const [endorsing, setEndorsing] = useState(null);
  const [message, setMessage] = useState(null);

  const loadSkills = useCallback(async () => {
    setLoading(true);
    try {
      const r = await client.get("/api/onchain/skills");
      setSkills(r.data?.payload?.skills || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { loadSkills(); }, [loadSkills]);

  const handlePublish = async () => {
    if (!publishForm.id || !publishForm.name || !publishForm.contentHash) {
      setMessage({ type: "error", text: "id, name, and contentHash are required" });
      return;
    }
    setPublishing(true);
    try {
      const r = await client.post("/api/onchain/publish", {
        ...publishForm,
        tags: publishForm.tags.split(",").map(t => t.trim()).filter(Boolean),
      });
      setMessage({ type: "success", text: `Published! TxHash: ${r.data?.payload?.txHash?.slice(0, 20)}…` });
      setShowPublishForm(false);
      setPublishForm({ id: "", name: "", description: "", contentHash: "", tags: "" });
      await loadSkills();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
    setPublishing(false);
  };

  const handleEndorse = async (key) => {
    if (!walletAddress) {
      setMessage({ type: "error", text: "Connect wallet to endorse" });
      return;
    }
    setEndorsing(key);
    try {
      await client.post(`/api/onchain/endorse/${key}`);
      setMessage({ type: "success", text: "Endorsed!" });
      await loadSkills();
    } catch (err) {
      setMessage({ type: "error", text: err.message });
    }
    setEndorsing(null);
  };

  return (
    <div className="onchain-panel">
      <div className="onchain-header">
        <span className="onchain-icon">⛓️</span>
        <span>On-Chain Registry</span>
        <span className="onchain-badge">0G Chain</span>
      </div>

      <div className="onchain-subtitle">
        Skills published to <code>SkillRegistry.sol</code> on 0G Newton Testnet (chainId 16600)
      </div>

      {message && (
        <div className={`onchain-message ${message.type}`}>
          {message.text}
          <button onClick={() => setMessage(null)}>×</button>
        </div>
      )}

      <div className="onchain-actions">
        <button className="onchain-btn" onClick={loadSkills} disabled={loading}>
          {loading ? "…" : "↻ Refresh"}
        </button>
        <button
          className="onchain-btn primary"
          onClick={() => setShowPublishForm(s => !s)}
          disabled={!walletAddress}
          title={!walletAddress ? "Connect wallet to publish" : ""}
        >
          + Publish Skill
        </button>
      </div>

      {showPublishForm && (
        <div className="onchain-publish-form">
          <div className="publish-form-title">Publish to 0G Chain</div>
          {[
            { key: "id", label: "Skill ID", placeholder: "defi.price" },
            { key: "name", label: "Name", placeholder: "Token Price Fetcher" },
            { key: "description", label: "Description", placeholder: "Fetches token prices" },
            { key: "contentHash", label: "0G Storage Hash", placeholder: "0x..." },
            { key: "tags", label: "Tags (comma-separated)", placeholder: "defi, price" },
          ].map(field => (
            <div key={field.key}>
              <label className="publish-label">{field.label}</label>
              <input
                className="publish-input"
                placeholder={field.placeholder}
                value={publishForm[field.key]}
                onChange={e => setPublishForm(f => ({ ...f, [field.key]: e.target.value }))}
              />
            </div>
          ))}
          <div className="publish-actions">
            <button className="onchain-btn" onClick={() => setShowPublishForm(false)}>Cancel</button>
            <button className="onchain-btn primary" onClick={handlePublish} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish to Chain"}
            </button>
          </div>
        </div>
      )}

      <div className="onchain-skills-list">
        {skills.length === 0 && !loading && (
          <div className="onchain-empty">
            No skills on chain yet. Be the first to publish!
          </div>
        )}
        {skills.map(skill => (
          <div key={skill.key} className={`onchain-skill-card ${skill.deprecated ? "deprecated" : ""}`}>
            <div className="onchain-skill-top">
              <div>
                <code className="onchain-skill-id">{skill.id}</code>
                <div className="onchain-skill-name">{skill.name}</div>
              </div>
              <div className="onchain-skill-meta">
                <span className="onchain-version">v{skill.version}</span>
                <span className="onchain-endorsements">👍 {skill.endorsements}</span>
              </div>
            </div>

            {skill.description && (
              <div className="onchain-skill-desc">{skill.description.slice(0, 80)}</div>
            )}

            <div className="onchain-skill-footer">
              <div className="onchain-skill-tags">
                {skill.tags?.slice(0, 4).map(t => (
                  <span key={t} className="skill-tag">{t}</span>
                ))}
              </div>
              <div className="onchain-skill-actions">
                <a
                  href={`https://chainscan-newton.0g.ai/address/${skill.author}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="onchain-author-link"
                  title={skill.author}
                >
                  {skill.author.slice(0, 8)}…
                </a>
                {!skill.deprecated && walletAddress && skill.author.toLowerCase() !== walletAddress.toLowerCase() && (
                  <button
                    className="onchain-endorse-btn"
                    onClick={() => handleEndorse(skill.key)}
                    disabled={endorsing === skill.key}
                  >
                    {endorsing === skill.key ? "…" : "👍 Endorse"}
                  </button>
                )}
                {skill.deprecated && <span className="onchain-deprecated-badge">Deprecated</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

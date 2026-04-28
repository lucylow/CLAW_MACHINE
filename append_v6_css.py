css = r"""
/* ═══════════════════════════════════════════════════════════════════════════
   CLAW_MACHINE v6 — New Component Styles
   ═══════════════════════════════════════════════════════════════════════════ */

/* ── EvolvePanel ─────────────────────────────────────────────────────────── */
.evolve-panel { display: flex; flex-direction: column; gap: 12px; padding: 4px 0; }
.evolve-header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; color: var(--text-primary); }
.evolve-icon { font-size: 18px; }
.evolve-badge { margin-left: auto; font-size: 10px; background: rgba(239,68,68,0.15); color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 4px; padding: 2px 6px; font-weight: 600; }
.evolve-description-text { font-size: 12px; color: var(--text-muted); line-height: 1.5; }
.evolve-form { display: flex; flex-direction: column; gap: 8px; background: var(--bg-secondary); border-radius: 8px; padding: 12px; border: 1px solid var(--border-color); }
.evolve-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.evolve-textarea { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; padding: 8px; resize: vertical; font-family: inherit; }
.evolve-textarea:focus { outline: none; border-color: var(--accent-primary); }
.evolve-input { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; padding: 6px 8px; }
.evolve-input:focus { outline: none; border-color: var(--accent-primary); }
.evolve-range { width: 100%; accent-color: var(--accent-primary); }
.evolve-btn { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; border: none; border-radius: 6px; padding: 8px 16px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; transition: opacity 0.2s; }
.evolve-btn:hover:not(:disabled) { opacity: 0.9; }
.evolve-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.evolve-result { border-radius: 8px; padding: 10px 12px; font-size: 12px; border: 1px solid; }
.evolve-result.success { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); }
.evolve-result.failure { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); }
.evolve-result-header { display: flex; justify-content: space-between; font-weight: 600; margin-bottom: 4px; }
.evolve-result-id { color: var(--text-secondary); margin: 4px 0; }
.evolve-result-id code { color: var(--accent-primary); }
.evolve-result-error { color: #ef4444; margin: 4px 0; }
.evolve-result-meta { color: var(--text-muted); font-size: 11px; margin-top: 4px; }
.evolve-skills-header { display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; color: var(--text-secondary); padding: 4px 0; border-top: 1px solid var(--border-color); margin-top: 4px; }
.evolve-refresh { background: none; border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 14px; }
.evolve-refresh:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.evolve-skills-list { display: flex; flex-direction: column; gap: 6px; max-height: 300px; overflow-y: auto; }
.evolve-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 16px; }
.evolve-skill-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; cursor: pointer; transition: border-color 0.2s; }
.evolve-skill-card:hover { border-color: var(--accent-primary); }
.evolve-skill-card.expanded { border-color: rgba(239,68,68,0.5); }
.evolve-skill-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.evolve-skill-id { font-size: 11px; color: var(--accent-primary); }
.evolve-skill-desc { font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.evolve-skill-score { font-size: 14px; font-weight: 700; }
.evolve-skill-detail { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border-color); }
.evolve-skill-tags { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px; }
.evolve-skill-tests { display: flex; flex-direction: column; gap: 2px; }
.evolve-test { font-size: 11px; padding: 2px 4px; border-radius: 3px; }
.evolve-test.pass { color: #10b981; }
.evolve-test.fail { color: #ef4444; }
.evolve-test-error { color: var(--text-muted); }
.evolve-storage-hash { font-size: 10px; color: var(--text-muted); margin-top: 6px; }
.evolve-storage-hash code { color: var(--accent-secondary); }

/* ── OnChainPanel ────────────────────────────────────────────────────────── */
.onchain-panel { display: flex; flex-direction: column; gap: 10px; padding: 4px 0; }
.onchain-header { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 14px; }
.onchain-icon { font-size: 18px; }
.onchain-badge { margin-left: auto; font-size: 10px; background: rgba(99,102,241,0.15); color: #6366f1; border: 1px solid rgba(99,102,241,0.3); border-radius: 4px; padding: 2px 6px; font-weight: 600; }
.onchain-subtitle { font-size: 11px; color: var(--text-muted); }
.onchain-subtitle code { color: var(--accent-primary); }
.onchain-message { display: flex; align-items: center; justify-content: space-between; font-size: 12px; padding: 8px 10px; border-radius: 6px; border: 1px solid; }
.onchain-message.success { background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.3); color: #10b981; }
.onchain-message.error { background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.3); color: #ef4444; }
.onchain-message button { background: none; border: none; cursor: pointer; color: inherit; font-size: 16px; line-height: 1; }
.onchain-actions { display: flex; gap: 8px; }
.onchain-btn { background: var(--bg-secondary); border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 6px; padding: 6px 12px; font-size: 12px; cursor: pointer; transition: all 0.2s; }
.onchain-btn:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
.onchain-btn.primary { background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border-color: transparent; }
.onchain-btn.primary:hover:not(:disabled) { opacity: 0.9; }
.onchain-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.onchain-publish-form { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.publish-form-title { font-size: 13px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
.publish-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; }
.publish-input { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; padding: 6px 8px; width: 100%; box-sizing: border-box; }
.publish-input:focus { outline: none; border-color: var(--accent-primary); }
.publish-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
.onchain-skills-list { display: flex; flex-direction: column; gap: 8px; max-height: 400px; overflow-y: auto; }
.onchain-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px; }
.onchain-skill-card { background: var(--bg-secondary); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 12px; }
.onchain-skill-card.deprecated { opacity: 0.5; }
.onchain-skill-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
.onchain-skill-id { font-size: 11px; color: var(--accent-primary); display: block; }
.onchain-skill-name { font-size: 13px; font-weight: 600; color: var(--text-primary); }
.onchain-skill-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.onchain-version { font-size: 10px; color: var(--text-muted); }
.onchain-endorsements { font-size: 11px; color: var(--text-secondary); }
.onchain-skill-desc { font-size: 12px; color: var(--text-muted); margin: 4px 0; }
.onchain-skill-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.onchain-skill-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.onchain-skill-actions { display: flex; align-items: center; gap: 8px; }
.onchain-author-link { font-size: 10px; color: var(--text-muted); text-decoration: none; }
.onchain-author-link:hover { color: var(--accent-primary); }
.onchain-endorse-btn { background: none; border: 1px solid var(--border-color); color: var(--text-secondary); border-radius: 4px; padding: 2px 8px; font-size: 11px; cursor: pointer; }
.onchain-endorse-btn:hover:not(:disabled) { border-color: #10b981; color: #10b981; }
.onchain-deprecated-badge { font-size: 10px; color: #ef4444; border: 1px solid rgba(239,68,68,0.3); border-radius: 4px; padding: 2px 6px; }

/* ── Builder Page ────────────────────────────────────────────────────────── */
.builder-page { display: flex; flex-direction: column; height: 100%; background: var(--bg-primary); }
.builder-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); flex-shrink: 0; }
.builder-title { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 15px; color: var(--text-primary); }
.builder-title-icon { font-size: 20px; }
.builder-badge { font-size: 10px; background: rgba(16,185,129,0.15); color: #10b981; border: 1px solid rgba(16,185,129,0.3); border-radius: 4px; padding: 2px 6px; font-weight: 600; }
.builder-actions { display: flex; gap: 8px; }
.builder-btn { border-radius: 6px; padding: 6px 14px; font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; border: 1px solid; }
.builder-btn.secondary { background: var(--bg-primary); border-color: var(--border-color); color: var(--text-secondary); }
.builder-btn.secondary:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.builder-btn.primary { background: linear-gradient(135deg, #6366f1, #4f46e5); color: white; border-color: transparent; }
.builder-btn.primary:hover:not(:disabled) { opacity: 0.9; }
.builder-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.builder-deploy-result { display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; font-size: 13px; }
.builder-deploy-result.success { background: rgba(16,185,129,0.1); color: #10b981; border-bottom: 1px solid rgba(16,185,129,0.2); }
.builder-deploy-result.error { background: rgba(239,68,68,0.1); color: #ef4444; border-bottom: 1px solid rgba(239,68,68,0.2); }
.builder-deploy-result button { background: none; border: none; cursor: pointer; color: inherit; font-size: 18px; }
.builder-body { display: flex; flex: 1; overflow: hidden; }
.builder-palette { width: 180px; flex-shrink: 0; background: var(--bg-secondary); border-right: 1px solid var(--border-color); padding: 12px 8px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.palette-title { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; padding: 0 4px 8px; }
.palette-item { display: flex; align-items: flex-start; gap: 8px; padding: 8px; border-radius: 6px; border-left: 3px solid; background: var(--bg-primary); cursor: grab; transition: background 0.15s; }
.palette-item:hover { background: rgba(99,102,241,0.05); }
.palette-item:active { cursor: grabbing; }
.palette-icon { font-size: 16px; flex-shrink: 0; margin-top: 1px; }
.palette-label { font-size: 12px; font-weight: 600; color: var(--text-primary); }
.palette-desc { font-size: 10px; color: var(--text-muted); margin-top: 2px; }
.builder-canvas { flex: 1; position: relative; overflow: hidden; background: radial-gradient(circle at 1px 1px, rgba(99,102,241,0.08) 1px, transparent 0) 0 0 / 24px 24px; }
.builder-edges { overflow: visible; }
.builder-node { position: absolute; width: 120px; background: var(--bg-secondary); border: 2px solid; border-radius: 8px; cursor: move; user-select: none; transition: box-shadow 0.15s; box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
.builder-node:hover, .builder-node.selected { box-shadow: 0 4px 16px rgba(99,102,241,0.3); }
.builder-node.connecting { box-shadow: 0 0 0 3px rgba(99,102,241,0.4); }
.node-header { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 5px 5px 0 0; font-size: 11px; font-weight: 600; color: white; }
.node-body { padding: 4px 8px 6px; }
.node-type-label { font-size: 10px; color: var(--text-muted); }
.node-port { position: absolute; width: 12px; height: 12px; border-radius: 50%; background: var(--bg-secondary); border: 2px solid; cursor: pointer; top: 50%; transform: translateY(-50%); transition: background 0.15s; z-index: 10; }
.node-port:hover { background: var(--accent-primary); }
.node-port.in { left: -7px; }
.node-port.out { right: -7px; }
.node-delete { position: absolute; top: -8px; right: -8px; width: 18px; height: 18px; border-radius: 50%; background: #ef4444; border: none; color: white; font-size: 12px; line-height: 1; cursor: pointer; display: flex; align-items: center; justify-content: center; z-index: 20; }
.builder-connecting-hint { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); background: rgba(99,102,241,0.9); color: white; padding: 6px 14px; border-radius: 20px; font-size: 12px; pointer-events: none; }
.builder-config { width: 220px; flex-shrink: 0; background: var(--bg-secondary); border-left: 1px solid var(--border-color); padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.config-title { font-size: 13px; font-weight: 700; margin-bottom: 4px; }
.config-label { font-size: 11px; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.config-input { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; padding: 6px 8px; width: 100%; box-sizing: border-box; }
.config-input:focus { outline: none; border-color: var(--accent-primary); }
.config-textarea { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; padding: 8px; width: 100%; box-sizing: border-box; resize: vertical; font-family: inherit; }
.config-textarea:focus { outline: none; border-color: var(--accent-primary); }
.config-select { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; color: var(--text-primary); font-size: 12px; padding: 6px 8px; width: 100%; }
.config-empty { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 32px 16px; text-align: center; color: var(--text-muted); font-size: 12px; }
.config-empty-icon { font-size: 32px; }
.config-empty-hint { font-size: 11px; color: var(--text-muted); }
.builder-code-preview { background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; overflow: hidden; margin-top: 8px; }
.code-preview-title { font-size: 11px; font-weight: 600; color: var(--text-secondary); padding: 6px 10px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); }
.code-preview-body { font-size: 10px; color: var(--accent-primary); padding: 10px; margin: 0; overflow-x: auto; white-space: pre; font-family: 'JetBrains Mono', 'Fira Code', monospace; line-height: 1.6; }

/* ── Spinner small ───────────────────────────────────────────────────────── */
.spinner-sm { display: inline-block; width: 12px; height: 12px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.7s linear infinite; }
"""

with open("/home/ubuntu/claw-v4-work/CLAW_MACHINE-v6/frontend/src/App.css", "a") as f:
    f.write(css)
print("CSS appended successfully")

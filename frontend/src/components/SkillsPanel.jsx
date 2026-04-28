/**
 * SkillsPanel — displays registered skills with enable/disable toggles
 * and a quick-execute button that fires the skill directly.
 */
import { useState } from 'react';
import client from '../services/api';

const SKILL_ICONS = {
  'uniswap.swap':         '🔄',
  'og.storage':           '💾',
  'wallet.analysis':      '📊',
  'price.oracle':         '💹',
  'ens.lookup':           '🔍',
  'reflection.summarize': '🪞',
  'agent.swarm':          '🐝',
};

const TAG_COLORS = {
  defi:       '#f59e0b',
  swap:       '#f59e0b',
  chain:      '#3b82f6',
  storage:    '#10b981',
  memory:     '#10b981',
  wallet:     '#8b5cf6',
  analytics:  '#8b5cf6',
  oracle:     '#ec4899',
  market:     '#ec4899',
  ens:        '#06b6d4',
  identity:   '#06b6d4',
  reflection: '#a78bfa',
  learning:   '#a78bfa',
  swarm:      '#f97316',
  'multi-agent': '#f97316',
};

export function SkillsPanel({ skills = [], onSkillsChange }) {
  const [executing, setExecuting] = useState(null);
  const [results, setResults] = useState({});
  const [toggling, setToggling] = useState(null);

  const handleToggle = async (skill) => {
    setToggling(skill.id);
    try {
      const endpoint = skill.enabled
        ? `/agent/skills/${skill.id}/disable`
        : `/agent/skills/${skill.id}/enable`;
      await client.post(endpoint);
      onSkillsChange?.();
    } catch (e) {
      console.error('Toggle failed', e);
    } finally {
      setToggling(null);
    }
  };

  const handleExecute = async (skill) => {
    setExecuting(skill.id);
    setResults(prev => ({ ...prev, [skill.id]: null }));
    try {
      const res = await client.post('/agent/skills/execute', {
        skillId: skill.id,
        params: {},
      });
      setResults(prev => ({
        ...prev,
        [skill.id]: res?.result?.output || JSON.stringify(res?.result) || 'Done',
      }));
    } catch (e) {
      setResults(prev => ({
        ...prev,
        [skill.id]: `Error: ${e.response?.data?.error?.message || e.message}`,
      }));
    } finally {
      setExecuting(null);
    }
  };

  if (!skills.length) {
    return (
      <div className="status-panel">
        <h3>Skills</h3>
        <p className="wallet-hint">No skills registered.</p>
      </div>
    );
  }

  return (
    <div className="status-panel">
      <h3>
        Skills
        <span className="skill-count-badge">{skills.filter(s => s.enabled).length}/{skills.length}</span>
      </h3>
      <ul className="skills-list skills-list-full">
        {skills.map((skill) => (
          <li key={skill.id} className={`skill-item skill-card ${skill.enabled ? '' : 'skill-disabled'}`}>
            <div className="skill-card-header">
              <span className="skill-icon">{SKILL_ICONS[skill.id] ?? '🔧'}</span>
              <div className="skill-card-info">
                <span className="skill-name">{skill.name}</span>
                <span className="skill-desc">{skill.description}</span>
              </div>
              <label className="skill-toggle" title={skill.enabled ? 'Disable skill' : 'Enable skill'}>
                <input
                  type="checkbox"
                  checked={skill.enabled}
                  disabled={toggling === skill.id}
                  onChange={() => handleToggle(skill)}
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {skill.tags?.length > 0 && (
              <div className="skill-tags">
                {skill.tags.map(tag => (
                  <span
                    key={tag}
                    className="skill-tag"
                    style={{ borderColor: TAG_COLORS[tag] ?? '#4f6ef7', color: TAG_COLORS[tag] ?? '#4f6ef7' }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="skill-meta-row">
              {skill.requiresWallet && <span className="skill-meta-badge">🔑 wallet</span>}
              {skill.touchesChain   && <span className="skill-meta-badge">⛓ chain</span>}
              {skill.usesCompute    && <span className="skill-meta-badge">🖥 compute</span>}
              {skill.usesStorage    && <span className="skill-meta-badge">💾 storage</span>}
            </div>

            {skill.enabled && (
              <button
                className="skill-run-btn"
                onClick={() => handleExecute(skill)}
                disabled={executing === skill.id}
              >
                {executing === skill.id ? <span className="spinner-sm" /> : '▶ Run'}
              </button>
            )}

            {results[skill.id] && (
              <div className="skill-result">
                <span className="skill-result-label">Result:</span>
                <span className="skill-result-text">{results[skill.id]}</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

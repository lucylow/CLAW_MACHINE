/**
 * InsightsPanel — shows richer agent insights: memory stats, reflections,
 * recent events, and a mini bar chart of memory-by-type.
 */
import { useState } from 'react';

const TYPE_COLORS = {
  conversation_turn: '#4f6ef7',
  reflection:        '#a78bfa',
  artifact:          '#10b981',
  skill_result:      '#f59e0b',
};

function MiniBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="mini-bar-row">
      <span className="mini-bar-label">{label}</span>
      <div className="mini-bar-track">
        <div
          className="mini-bar-fill"
          style={{ width: `${pct}%`, background: color ?? 'var(--accent)' }}
        />
      </div>
      <span className="mini-bar-value">{value}</span>
    </div>
  );
}

export function InsightsPanel({ insights }) {
  const [tab, setTab] = useState('memory'); // 'memory' | 'reflections' | 'events'

  if (!insights) {
    return (
      <div className="status-panel">
        <h3>Insights</h3>
        <p className="wallet-hint">Run a few prompts to generate insights.</p>
      </div>
    );
  }

  const { stats, recentReflections = [], recentEvents = [], memorySummary } = insights;

  const byType = stats?.byType ?? {};
  const maxTypeCount = Math.max(...Object.values(byType), 1);

  return (
    <div className="status-panel">
      <div className="insights-header">
        <h3>Insights</h3>
        {stats && (
          <span className="insights-total-badge">{stats.totalMemories} memories</span>
        )}
      </div>

      {/* Tab bar */}
      <div className="insights-tabs">
        {['memory', 'reflections', 'events'].map(t => (
          <button
            key={t}
            className={`insights-tab ${tab === t ? 'active' : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'memory' ? '🧠' : t === 'reflections' ? '🪞' : '📡'} {t}
          </button>
        ))}
      </div>

      {/* Memory tab */}
      {tab === 'memory' && (
        <div className="insights-body">
          {stats ? (
            <>
              <div className="insights-stat-row">
                <span className="insights-stat-label">Avg Importance</span>
                <span className="insights-stat-value">{stats.avgImportance}</span>
              </div>
              <div className="insights-stat-row">
                <span className="insights-stat-label">Pinned</span>
                <span className="insights-stat-value">{stats.pinnedCount}</span>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                {Object.entries(byType).map(([type, count]) => (
                  <MiniBar
                    key={type}
                    label={type.replace('_', ' ')}
                    value={count}
                    max={maxTypeCount}
                    color={TYPE_COLORS[type]}
                  />
                ))}
              </div>
            </>
          ) : (
            <p className="wallet-hint">{memorySummary || 'No memory data.'}</p>
          )}
        </div>
      )}

      {/* Reflections tab */}
      {tab === 'reflections' && (
        <div className="insights-body">
          {recentReflections.length === 0 ? (
            <p className="wallet-hint">No reflections generated yet.</p>
          ) : (
            <ul className="skills-list">
              {recentReflections.slice(0, 6).map((r, i) => (
                <li key={r.reflectionId ?? i} className="skill-item reflection-item">
                  <div className="reflection-header">
                    <span
                      className="reflection-severity"
                      style={{
                        color: r.severity === 'high' ? 'var(--red)'
                             : r.severity === 'medium' ? 'var(--yellow)'
                             : 'var(--green)',
                      }}
                    >
                      {r.severity?.toUpperCase() ?? 'INFO'}
                    </span>
                    <span className="reflection-tags">
                      {(r.tags ?? []).map(tag => (
                        <span key={tag} className="skill-tag" style={{ fontSize: '0.6rem' }}>{tag}</span>
                      ))}
                    </span>
                  </div>
                  <p className="reflection-summary">{r.mistakeSummary}</p>
                  {r.correctiveAdvice && (
                    <p className="reflection-advice">💡 {r.correctiveAdvice}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Events tab */}
      {tab === 'events' && (
        <div className="insights-body">
          {recentEvents.length === 0 ? (
            <p className="wallet-hint">No events recorded.</p>
          ) : (
            <ul className="skills-list">
              {recentEvents.slice(0, 10).map((ev, i) => (
                <li key={i} className="skill-item event-item">
                  <span className="event-type">{ev.type}</span>
                  <span className="event-time">
                    {new Date(ev.timestamp).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

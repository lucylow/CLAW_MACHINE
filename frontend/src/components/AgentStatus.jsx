export function AgentStatus({ status, info, skills = [] }) {
  const statusConfig = {
    idle:       { color: '#10b981', label: 'Ready',      icon: '✅' },
    processing: { color: '#f59e0b', label: 'Processing', icon: '⚙️' },
    error:      { color: '#ef4444', label: 'Error',      icon: '❌' },
    online:     { color: '#10b981', label: 'Online',     icon: '🟢' },
  };

  const cfg = statusConfig[status] || { color: '#6b7280', label: status, icon: '❓' };

  return (
    <div className="status-panel">
      <h3>Agent Status</h3>

      <div className="status-badge" style={{ borderColor: cfg.color }}>
        <span className="status-icon">{cfg.icon}</span>
        <span className="status-label" style={{ color: cfg.color }}>{cfg.label}</span>
        {status === 'processing' && <span className="spinner-sm" />}
      </div>

      <div className="info-box">
        <InfoRow label="Agent"   value={info?.agent   || 'OpenAgents v2'} />
        <InfoRow label="Network" value={info?.network  || '0G Labs'} />
        <InfoRow label="Model"   value={info?.model    || 'Qwen 3.6+'} />
        <InfoRow label="Storage" value={info?.storage  || 'Decentralized'} />
        {info?.version && <InfoRow label="Version" value={info.version} />}
      </div>

      {skills.length > 0 && (
        <div className="skills-box">
          <h4>Available Skills</h4>
          <ul className="skills-list">
            {skills.map((s) => (
              <li key={s.name} className="skill-item" title={s.description}>
                <span className="skill-dot" />
                {s.name}
              </li>
            ))}
          </ul>
        </div>
      )}

      {status === 'error' && (
        <button
          onClick={() => window.location.reload()}
          className="retry-btn"
        >
          🔄 Retry Connection
        </button>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <p className="info-row">
      <span className="info-key">{label}</span>
      <span className="info-val">{value}</span>
    </p>
  );
}

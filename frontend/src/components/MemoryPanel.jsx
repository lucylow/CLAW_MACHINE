export function MemoryPanel({ history }) {
  const memories = history?.memories || [];
  const reflections = history?.recentReflections || [];

  return (
    <div className="status-panel">
      <h3>Memory & Reflections</h3>
      {memories.length === 0 ? (
        <p className="wallet-hint">No persistent memory yet. Run a few prompts to build context.</p>
      ) : (
        <ul className="skills-list">
          {memories.slice(-5).reverse().map((m) => (
            <li key={m.id} className="skill-item">
              <span className="skill-dot" />
              <span>{m.type}: {m.summary}</span>
            </li>
          ))}
        </ul>
      )}

      <h4 style={{ marginTop: "0.75rem" }}>Recent Lessons</h4>
      {reflections.length === 0 ? (
        <p className="wallet-hint">No reflection generated yet.</p>
      ) : (
        <ul className="skills-list">
          {reflections.slice(0, 4).map((r) => (
            <li key={r.reflectionId} className="skill-item" title={r.correctiveAdvice}>
              <span className="skill-dot" />
              <span>{r.severity.toUpperCase()}: {r.mistakeSummary}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

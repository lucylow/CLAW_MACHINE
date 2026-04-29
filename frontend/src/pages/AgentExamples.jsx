const examples = [
  { name: 'supportAgent', desc: '3-turn conversation, memory accumulation, hierarchical planning, full stats output' },
  { name: 'researchAgent', desc: 'Protocol research with semantic search and synthesis' },
  { name: 'plannerAgent', desc: 'Hierarchical plan graph with dependencies' },
  { name: 'opsAgent', desc: 'Incident triage with rollback and checkpoint awareness' },
  { name: 'marketAgent', desc: 'Marketplace pricing and listing optimization' },
  { name: 'coordinatorAgent', desc: 'Multi-agent delegation and merge logic' },
];

export default function AgentExamples() {
  return (
    <div className="status-panel agent-examples">
      <h2 className="agent-examples-title">Detailed agent examples</h2>
      <p className="agent-examples-lead">
        Runnable scripts live in <code className="agent-examples-code">backend/examples/</code>. From the repo root:
      </p>
      <pre className="agent-examples-pre">
        {`cd backend
npm run example:support
npm run examples:all`}
      </pre>
      <p className="agent-examples-hint">
        Or: <code className="agent-examples-code">npx ts-node --project examples/tsconfig.json examples/supportAgent.ts</code>
      </p>
      <div className="agent-examples-grid">
        {examples.map((e) => (
          <div key={e.name} className="agent-examples-card">
            <h3 className="agent-examples-card-title">{e.name}</h3>
            <p className="agent-examples-card-desc">{e.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

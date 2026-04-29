import { BaseAgent, AgentTurn } from './baseAgent';

class OpsAgent extends BaseAgent {
  constructor() {
    super('opsAgent');
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: 'user', content: 'Investigate a failed deployment and suggest a rollback.' },
      { role: 'assistant', content: 'I will inspect logs, compare checkpoints, and propose remediation.' },
      { role: 'user', content: 'Provide a full incident summary.' },
    ];

    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan('triage deployment incident and prepare rollback');
    this.toolCall('logReader', { source: 'deployment logs' });
    this.toolCall('checkpointDiff', { between: ['good', 'bad'] });
    this.toolCall('rollbackPlanner', { target: 'last-known-good' });

    this.failure();
    this.success();

    return {
      plan,
      incidentSummary: 'Detected config drift, rolled back safely, and scheduled postmortem.',
      stats: this.finalize(),
    };
  }
}

void (async () => {
  const agent = new OpsAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

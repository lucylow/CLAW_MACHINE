import { BaseAgent, AgentTurn } from './baseAgent';

class CoordinatorAgent extends BaseAgent {
  constructor() {
    super('coordinatorAgent');
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: 'user', content: 'Coordinate multiple agents to resolve a support issue.' },
      { role: 'assistant', content: 'I will delegate research, planning, and response drafting.' },
      { role: 'user', content: 'Keep the handoffs explicit.' },
    ];

    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan('orchestrate subagents for support resolution');
    this.toolCall('manifestLookup', { capabilities: ['support', 'research', 'planning'] });
    this.toolCall('handoffRouter', { strategy: 'best-fit' });
    this.toolCall('mergeResults', { policy: 'priority by confidence' });

    this.success();

    return {
      plan,
      delegationMap: [
        { task: 'fact finding', agent: 'researchAgent' },
        { task: 'plan drafting', agent: 'plannerAgent' },
        { task: 'customer reply', agent: 'supportAgent' },
      ],
      stats: this.finalize(),
    };
  }
}

void (async () => {
  const agent = new CoordinatorAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

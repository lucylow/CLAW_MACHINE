import { BaseAgent, AgentTurn } from './baseAgent';

class SupportAgent extends BaseAgent {
  constructor() {
    super('supportAgent');
  }

  async run() {
    const conversation: AgentTurn[] = [
      { role: 'user', content: 'A customer wants a refund after 45 days for a defective laptop.' },
      { role: 'assistant', content: 'I will check warranty and defect exceptions before responding.' },
      { role: 'user', content: 'Make it concise and polite.' },
    ];

    for (const turn of conversation) this.recordTurn(turn);

    const plan = this.plan('resolve customer refund issue for defective laptop');
    this.toolCall('policyLookup', { type: 'refund', product: 'laptop', defect: true });
    this.toolCall('toneAdapter', { tone: 'concise polite' });

    const reply = [
      'Acknowledged the defect report.',
      'Checked policy exception path for defective goods.',
      'Suggested escalation to warranty review if needed.',
    ];

    this.success();

    return { plan, reply, stats: this.finalize() };
  }
}

void (async () => {
  const agent = new SupportAgent();
  const result = await agent.run();
  console.log(JSON.stringify(result, null, 2));
})();

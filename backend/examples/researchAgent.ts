import { BaseAgent, AgentTurn } from './baseAgent';

class ResearchAgent extends BaseAgent {
  constructor() {
    super('researchAgent');
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: 'user', content: 'Research the best protocol for agent-to-agent messaging.' },
      { role: 'assistant', content: 'I will compare interoperability, envelopes, routing, and security.' },
      { role: 'user', content: 'Include implementation notes for TypeScript.' },
    ];

    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan('produce a technical synthesis on A2A protocol design');
    this.toolCall('semanticSearch', { query: 'agent communication protocols' });
    this.toolCall('noteSummarizer', { scope: 'multi-agent coordination' });
    this.toolCall('citationPlanner', { format: 'bullet list' });

    this.success();

    return {
      plan,
      findings: [
        'Use typed envelopes for compatibility.',
        'Add conversation IDs and correlation IDs.',
        'Persist trace hops for debugging and replay.',
      ],
      stats: this.finalize(),
    };
  }
}

void (async () => {
  const agent = new ResearchAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

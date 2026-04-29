import { BaseAgent, AgentTurn } from './baseAgent';

class MarketAgent extends BaseAgent {
  constructor() {
    super('marketAgent');
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: 'user', content: 'Analyze whether to list an agent for sale.' },
      { role: 'assistant', content: 'I will review scarcity, capability, and price elasticity.' },
      { role: 'user', content: 'Use a conservative pricing model.' },
    ];

    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan('price and list an agent in the marketplace');
    this.toolCall('marketComps', { segment: 'support agents' });
    this.toolCall('priceModel', { strategy: 'conservative' });
    this.toolCall('listingComposer', { fields: ['capabilities', 'level', 'reflections'] });

    this.success();

    return {
      plan,
      listingDraft: {
        title: 'Support Agent v3',
        price: '18.0 0G',
        rationale: 'moderate capability with strong reliability',
      },
      stats: this.finalize(),
    };
  }
}

void (async () => {
  const agent = new MarketAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

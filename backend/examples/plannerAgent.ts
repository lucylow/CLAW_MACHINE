import { BaseAgent, AgentTurn } from './baseAgent';

type PlanNode = {
  id: string;
  title: string;
  dependsOn?: string[];
  done?: boolean;
};

class PlannerAgent extends BaseAgent {
  private graph: PlanNode[] = [];

  constructor() {
    super('plannerAgent');
  }

  buildGraph(goal: string) {
    this.graph = [
      { id: 'n1', title: `Understand ${goal}` },
      { id: 'n2', title: 'Break into subgoals', dependsOn: ['n1'] },
      { id: 'n3', title: 'Validate dependencies', dependsOn: ['n2'] },
      { id: 'n4', title: 'Emit executable steps', dependsOn: ['n3'] },
    ];
    this.stats.plansBuilt += 1;
    return this.graph;
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: 'user', content: 'Plan an autonomous execution workflow for a software update.' },
      { role: 'assistant', content: 'I will create a hierarchical execution graph.' },
      { role: 'user', content: 'Prefer safe defaults.' },
    ];

    convo.forEach((t) => this.recordTurn(t));

    const graph = this.buildGraph('software update');
    this.toolCall('planner', { graph });
    this.toolCall('validator', { safety: 'safe defaults' });
    this.success();

    return { graph, stats: this.finalize() };
  }
}

void (async () => {
  const agent = new PlannerAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

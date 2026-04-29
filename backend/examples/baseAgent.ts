import { EventEmitter } from 'events';

export type AgentTurn = {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  meta?: Record<string, unknown>;
};

export type AgentStats = {
  name: string;
  turns: number;
  memoryItems: number;
  plansBuilt: number;
  toolCalls: number;
  successes: number;
  failures: number;
  lastGoal?: string;
  startTime: string;
  endTime?: string;
};

export abstract class BaseAgent extends EventEmitter {
  readonly name: string;
  protected memory: AgentTurn[] = [];
  protected stats: AgentStats;

  constructor(name: string) {
    super();
    this.name = name;
    this.stats = {
      name,
      turns: 0,
      memoryItems: 0,
      plansBuilt: 0,
      toolCalls: 0,
      successes: 0,
      failures: 0,
      startTime: new Date().toISOString(),
    };
  }

  protected remember(turn: AgentTurn) {
    this.memory.push(turn);
    this.stats.memoryItems = this.memory.length;
  }

  protected recordTurn(turn: AgentTurn) {
    this.stats.turns += 1;
    this.remember(turn);
  }

  protected plan(goal: string) {
    this.stats.plansBuilt += 1;
    this.stats.lastGoal = goal;
    return [
      `Clarify goal: ${goal}`,
      `Gather context from memory (${this.memory.length} items)`,
      `Execute focused action`,
      `Validate and summarize outcome`,
    ];
  }

  protected toolCall(name: string, input: unknown) {
    this.stats.toolCalls += 1;
    this.emit('tool', { name, input });
  }

  protected success() {
    this.stats.successes += 1;
  }

  protected failure() {
    this.stats.failures += 1;
  }

  finalize() {
    this.stats.endTime = new Date().toISOString();
    return { ...this.stats, memory: [...this.memory] };
  }
}

/**
 * CLAW MACHINE — BaseAgent
 *
 * Foundation class for all example agents. Provides:
 *   - Typed conversation memory with timestamps
 *   - Hierarchical planning stub
 *   - Tool call tracking with retry + timeout helpers
 *   - Success/failure counters
 *   - Memory search by tag
 *   - Memory summarization
 *   - Graceful reset
 *   - Typed EventEmitter overloads
 */

import { EventEmitter } from "events";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentTurn {
  role: "user" | "assistant" | "system";
  content: string;
  /** ISO timestamp — set automatically by recordTurn() */
  timestamp: string;
  /** Optional tags for memory search */
  tags?: string[];
}

export interface AgentStats {
  name: string;
  turns: number;
  memoryItems: number;
  plansBuilt: number;
  toolCalls: number;
  toolRetries: number;
  successes: number;
  failures: number;
  startTime: string;
  endTime?: string;
  lastGoal?: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  attempt: number;
  durationMs: number;
  timestamp: string;
}

// ── Typed event map ───────────────────────────────────────────────────────────

interface AgentEvents {
  tool: [ToolCallRecord];
  "reflection.needed": [{ error: string; task: string }];
  "incident.detected": [{ id: string; severity: string }];
  "turn.complete": [{ turnNumber: number; success: boolean; error?: string }];
  reset: [];
}

// ── BaseAgent ─────────────────────────────────────────────────────────────────

export class BaseAgent extends EventEmitter {
  protected memory: AgentTurn[] = [];
  protected toolLog: ToolCallRecord[] = [];
  protected stats: AgentStats;

  constructor(protected readonly name: string) {
    super();
    this.stats = this.freshStats();
  }

  // ── Memory ──────────────────────────────────────────────────────────────────

  protected remember(turn: AgentTurn): void {
    this.memory.push(turn);
    this.stats.memoryItems = this.memory.length;
  }

  protected recordTurn(turn: Omit<AgentTurn, "timestamp"> & { timestamp?: string }): void {
    const full: AgentTurn = { ...turn, timestamp: turn.timestamp ?? new Date().toISOString() };
    this.stats.turns += 1;
    this.remember(full);
  }

  /** Return all memory turns that include at least one of the given tags. */
  protected getMemoryByTag(...tags: string[]): AgentTurn[] {
    return this.memory.filter((t) => t.tags?.some((tag) => tags.includes(tag)));
  }

  /** Return a compact prose summary of the most recent N memory items. */
  protected summarizeMemory(topN = 5): string {
    if (this.memory.length === 0) return "No prior memory.";
    return this.memory
      .slice(-topN)
      .map((t) => `[${t.role}] ${t.content.slice(0, 80)}`)
      .join(" → ");
  }

  // ── Planning ─────────────────────────────────────────────────────────────────

  protected plan(goal: string): string[] {
    this.stats.plansBuilt += 1;
    this.stats.lastGoal = goal;
    return [
      `Clarify goal: ${goal}`,
      `Gather context from memory (${this.memory.length} items)`,
      `Execute focused action`,
      `Validate and summarize outcome`,
    ];
  }

  // ── Tool calls ───────────────────────────────────────────────────────────────

  protected toolCall(name: string, input: unknown, output?: unknown): ToolCallRecord {
    const record: ToolCallRecord = {
      name, input, output,
      attempt: 1,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
    this.stats.toolCalls += 1;
    this.toolLog.push(record);
    this.emit("tool", record);
    return record;
  }

  /**
   * Call an async tool function with automatic retry and exponential backoff.
   * @param name   Tool name for logging
   * @param fn     Async function to call
   * @param opts   maxAttempts (default 3), baseMs (default 150), retryIf predicate
   */
  protected async retryTool<T>(
    name: string,
    fn: () => Promise<T>,
    opts: { maxAttempts?: number; baseMs?: number; retryIf?: (err: unknown) => boolean } = {},
  ): Promise<T> {
    const { maxAttempts = 3, baseMs = 150, retryIf = () => true } = opts;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const result = await fn();
        const record: ToolCallRecord = { name, input: null, output: result, attempt, durationMs: Date.now() - t0, timestamp: new Date().toISOString() };
        if (attempt > 1) this.stats.toolRetries += attempt - 1;
        this.stats.toolCalls += 1;
        this.toolLog.push(record);
        this.emit("tool", record);
        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts && retryIf(err)) {
          const backoff = baseMs * Math.pow(2, attempt - 1) + Math.random() * 50;
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          const record: ToolCallRecord = { name, input: null, error: err instanceof Error ? err.message : String(err), attempt, durationMs: Date.now() - t0, timestamp: new Date().toISOString() };
          this.toolLog.push(record);
          break;
        }
      }
    }
    throw lastErr;
  }

  /**
   * Run an async function with a timeout. Throws if it exceeds timeoutMs.
   */
  protected async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label = "operation"): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ── Outcome tracking ─────────────────────────────────────────────────────────

  protected success(): void { this.stats.successes += 1; }
  protected failure(): void { this.stats.failures += 1; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /** Reset all state — useful for running the same agent instance multiple times in tests. */
  reset(): void {
    this.memory = [];
    this.toolLog = [];
    this.stats = this.freshStats();
    this.emit("reset");
  }

  finalize(): AgentStats & { memory: AgentTurn[]; toolLog: ToolCallRecord[] } {
    this.stats.endTime = new Date().toISOString();
    return { ...this.stats, memory: [...this.memory], toolLog: [...this.toolLog] };
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private freshStats(): AgentStats {
    return {
      name: this.name,
      turns: 0, memoryItems: 0, plansBuilt: 0,
      toolCalls: 0, toolRetries: 0, successes: 0, failures: 0,
      startTime: new Date().toISOString(),
    };
  }
}

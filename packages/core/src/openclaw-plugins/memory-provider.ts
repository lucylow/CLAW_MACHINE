/**
 * OpenClaw-compatible memory surface for CLAW_MACHINE (0G-backed implementations plug in here).
 */
export interface OpenClawMemory {
  save(key: string, value: unknown, metadata?: unknown): Promise<void>;
  recall(query: string, limit?: number): Promise<unknown[]>;
  reflect(outcome: "success" | "failure", trace: unknown[]): Promise<void>;
}

export interface ClawMachineMemoryConfig {
  ogStorageRpc?: string;
  autoRecall?: boolean;
  [key: string]: unknown;
}

/** Default in-process stub; swap for 0G KV/log clients in production. */
export class ClawMachineMemory implements OpenClawMemory {
  private readonly kv = new Map<string, { value: unknown; metadata?: unknown }>();

  constructor(readonly config: ClawMachineMemoryConfig = {}) {}

  async save(key: string, value: unknown, metadata?: unknown): Promise<void> {
    this.kv.set(key, { value, metadata });
  }

  async recall(query: string, limit = 10): Promise<unknown[]> {
    const q = query.toLowerCase();
    const hits: unknown[] = [];
    for (const [, entry] of this.kv) {
      if (hits.length >= limit) break;
      const blob = JSON.stringify(entry.value).toLowerCase();
      if (blob.includes(q)) hits.push(entry.value);
    }
    return hits;
  }

  async reflect(outcome: "success" | "failure", trace: unknown[]): Promise<void> {
    await this.save(
      `reflect:${Date.now()}`,
      { outcome, traceLength: trace.length },
      { type: "reflection" }
    );
  }
}

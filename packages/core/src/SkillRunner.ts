/**
 * SkillRunner
 *
 * Internal skill registry and executor used by createAgent.
 * Manages skill registration, enable/disable, and execution with
 * proper SkillContext injection.
 */
import { randomUUID } from "crypto";
import type {
  SkillDefinition,
  SkillManifest,
  SkillContext,
  SkillId,
  ComputeAdapter,
  StorageAdapter,
  MemoryAdapter,
  TurnContext,
} from "./types.js";

interface SkillEntry {
  manifest: SkillManifest;
  execute: SkillDefinition["execute"];
  callCount: number;
  errorCount: number;
  totalDurationMs: number;
  lastCalledAt?: number;
}

interface SkillRunnerDeps {
  compute: ComputeAdapter;
  storage: StorageAdapter;
  memory: MemoryAdapter;
}

export interface SkillStats {
  id: SkillId;
  callCount: number;
  errorCount: number;
  successRate: number;
  avgDurationMs: number;
  lastCalledAt?: number;
  enabled: boolean;
}

export class SkillRunner {
  private readonly skills: Map<SkillId, SkillEntry> = new Map();
  private readonly deps: SkillRunnerDeps;

  constructor(deps: SkillRunnerDeps) {
    this.deps = deps;
  }

  // ── Registration ──────────────────────────────────────────────────────────

  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.manifest.id)) {
      throw new Error(`[SkillRunner] Duplicate skill id: "${skill.manifest.id}"`);
    }
    this.skills.set(skill.manifest.id, {
      manifest: { ...skill.manifest, enabled: true },
      execute: skill.execute,
      callCount: 0,
      errorCount: 0,
      totalDurationMs: 0,
    });
  }

  has(id: SkillId): boolean {
    return this.skills.has(id);
  }

  // ── Listing ───────────────────────────────────────────────────────────────

  list(): SkillManifest[] {
    return [...this.skills.values()].map((e) => ({ ...e.manifest }));
  }

  listEnabled(): SkillManifest[] {
    return this.list().filter((m) => m.enabled);
  }

  /** Return all skill entries (manifests + metadata). */
  getAll(): Array<{ manifest: SkillManifest; stats: SkillStats }> {
    return [...this.skills.entries()].map(([id, entry]) => ({
      manifest: { ...entry.manifest },
      stats: this.buildStats(id, entry),
    }));
  }

  // ── Enable / Disable ──────────────────────────────────────────────────────

  setEnabled(id: SkillId, enabled: boolean): void {
    const entry = this.skills.get(id);
    if (!entry) throw new Error(`[SkillRunner] Unknown skill: "${id}"`);
    entry.manifest.enabled = enabled;
  }

  /** Disable all registered skills at once. */
  disableAll(): void {
    for (const entry of this.skills.values()) entry.manifest.enabled = false;
  }

  /** Enable all registered skills at once. */
  enableAll(): void {
    for (const entry of this.skills.values()) entry.manifest.enabled = true;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  async execute(
    id: SkillId,
    input: Record<string, unknown>,
    turnCtx?: TurnContext,
  ): Promise<Record<string, unknown>> {
    const entry = this.skills.get(id);
    if (!entry) throw new Error(`[SkillRunner] Unknown skill: "${id}"`);
    if (!entry.manifest.enabled) throw new Error(`[SkillRunner] Skill "${id}" is disabled`);

    const ctx: SkillContext = {
      walletAddress: (input.walletAddress as `0x${string}` | undefined) ?? turnCtx?.walletAddress,
      requestId: turnCtx?.requestId ?? randomUUID(),
      memory: this.deps.memory,
      compute: this.deps.compute,
      storage: this.deps.storage,
      emit: (event, payload) => {
        if (process.env.CLAW_DEBUG) {
          console.debug(`[claw:skill:${id}] ${event}`, payload ?? "");
        }
      },
    };

    const t0 = Date.now();
    entry.callCount += 1;
    entry.lastCalledAt = t0;

    try {
      const result = await entry.execute(input, ctx);
      entry.totalDurationMs += Date.now() - t0;
      return result;
    } catch (err) {
      entry.errorCount += 1;
      entry.totalDurationMs += Date.now() - t0;
      throw err;
    }
  }

  /**
   * Execute a skill with a per-call timeout.
   * Throws a TimeoutError if the skill exceeds timeoutMs.
   */
  async executeWithTimeout(
    id: SkillId,
    input: Record<string, unknown>,
    timeoutMs: number,
    turnCtx?: TurnContext,
  ): Promise<Record<string, unknown>> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[SkillRunner] Skill "${id}" timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    try {
      const result = await Promise.race([this.execute(id, input, turnCtx), timeoutPromise]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  /** Return per-skill execution statistics. */
  getStats(): SkillStats[] {
    return [...this.skills.entries()].map(([id, entry]) => this.buildStats(id, entry));
  }

  /** Return stats for a single skill. */
  getSkillStats(id: SkillId): SkillStats | undefined {
    const entry = this.skills.get(id);
    return entry ? this.buildStats(id, entry) : undefined;
  }

  private buildStats(id: SkillId, entry: SkillEntry): SkillStats {
    return {
      id,
      callCount: entry.callCount,
      errorCount: entry.errorCount,
      successRate: entry.callCount > 0 ? (entry.callCount - entry.errorCount) / entry.callCount : 1,
      avgDurationMs: entry.callCount > 0 ? entry.totalDurationMs / entry.callCount : 0,
      lastCalledAt: entry.lastCalledAt,
      enabled: entry.manifest.enabled ?? true,
    };
  }
}

"""
CLAW_MACHINE — framework refactor batch v3
Writes all improved/refactored files. Run: python3 refactor_v3.py
"""
import os

BASE = os.path.dirname(os.path.abspath(__file__))

def w(rel, content):
    full = os.path.join(BASE, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content)
    print(f"  wrote {rel}")

def patch(rel, old, new, label=""):
    full = os.path.join(BASE, rel)
    with open(full) as f:
        content = f.read()
    if old in content:
        with open(full, "w") as f:
            f.write(content.replace(old, new, 1))
        print(f"  patched {rel}" + (f" ({label})" if label else ""))
    else:
        print(f"  WARN: marker not found in {rel}" + (f" ({label})" if label else ""))

# ─────────────────────────────────────────────────────────────────────────────
# 1. packages/core/src/AgentBuilder.ts
#    Add: clone(), validate(), describe(), withTimeout(), withTags(), withVersion()
# ─────────────────────────────────────────────────────────────────────────────
w("packages/core/src/AgentBuilder.ts", r'''/**
 * AgentBuilder
 *
 * Fluent builder for constructing agent instances. Provides a clean,
 * discoverable API that guides developers through the configuration
 * process with full TypeScript inference.
 *
 * @example
 * ```ts
 * import { AgentBuilder } from "@claw/core";
 * import { zeroGPlugin } from "@claw/plugin-0g";
 * import { weatherSkill } from "./skills/weather.js";
 *
 * const agent = await new AgentBuilder()
 *   .setName("MyAgent")
 *   .setVersion("1.0.0")
 *   .setSystemPrompt("You are a helpful DeFi assistant on 0G.")
 *   .use(zeroGPlugin({ rpc: process.env.EVM_RPC! }))
 *   .skill(weatherSkill)
 *   .enableReflection()
 *   .withTimeout(30_000)
 *   .build();
 *
 * const result = await agent.run({ message: "What is the weather in Tokyo?" });
 * console.log(result.output);
 * ```
 */

import type {
  AgentConfig,
  AgentInstance,
  ComputeAdapter,
  StorageAdapter,
  MemoryAdapter,
  PluginDefinition,
  SkillDefinition,
} from "./types.js";
import { createAgent } from "./createAgent.js";

/** Validation result returned by AgentBuilder.validate(). */
export interface BuilderValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Human-readable descriptor returned by AgentBuilder.describe(). */
export interface BuilderDescriptor {
  name: string;
  version: string;
  skillCount: number;
  pluginCount: number;
  skillIds: string[];
  pluginIds: string[];
  hasCompute: boolean;
  hasStorage: boolean;
  hasMemory: boolean;
  reflectionEnabled: boolean;
  pruningEnabled: boolean;
  maxPlanParallelism: number;
  turnTimeoutMs: number | undefined;
  tags: string[];
}

export class AgentBuilder {
  private config: AgentConfig = {
    name: "ClawAgent",
    version: "0.1.0",
    plugins: [],
    skills: [],
    enableReflection: true,
    enablePruning: true,
    maxPlanParallelism: 3,
    pruningIntervalMs: 300_000,
    tags: [],
  };

  // ── Identity ──────────────────────────────────────────────────────────────

  /** Set the agent's display name. */
  setName(name: string): this {
    if (!name?.trim()) throw new Error("[AgentBuilder] name must be a non-empty string");
    this.config.name = name.trim();
    return this;
  }

  /** Set the semantic version string (e.g. "1.2.3"). */
  setVersion(version: string): this {
    this.config.version = version;
    return this;
  }

  /** Add searchable tags to the agent (used by the on-chain registry). */
  withTags(...tags: string[]): this {
    this.config.tags = [...(this.config.tags ?? []), ...tags];
    return this;
  }

  /** Set the system prompt injected before every turn. */
  setSystemPrompt(prompt: string): this {
    this.config.systemPrompt = prompt;
    return this;
  }

  // ── Adapters ──────────────────────────────────────────────────────────────

  /** Set the LLM / compute adapter. */
  withCompute(adapter: ComputeAdapter): this {
    this.config.compute = adapter;
    return this;
  }

  /** Set the storage adapter. */
  withStorage(adapter: StorageAdapter): this {
    this.config.storage = adapter;
    return this;
  }

  /** Set the memory adapter. */
  withMemory(adapter: MemoryAdapter): this {
    this.config.memory = adapter;
    return this;
  }

  // ── Plugins & Skills ──────────────────────────────────────────────────────

  /** Register a plugin. Can be called multiple times. */
  use(plugin: PluginDefinition): this {
    const existing = (this.config.plugins ?? []).find((p) => p.id === plugin.id);
    if (existing) throw new Error(`[AgentBuilder] Duplicate plugin id: "${plugin.id}"`);
    this.config.plugins = [...(this.config.plugins ?? []), plugin];
    return this;
  }

  /** Register a skill. Can be called multiple times. */
  skill(skill: SkillDefinition): this {
    const existing = (this.config.skills ?? []).find((s) => s.manifest.id === skill.manifest.id);
    if (existing) throw new Error(`[AgentBuilder] Duplicate skill id: "${skill.manifest.id}"`);
    this.config.skills = [...(this.config.skills ?? []), skill];
    return this;
  }

  /** Register multiple skills at once. */
  skills(skills: SkillDefinition[]): this {
    for (const s of skills) this.skill(s);
    return this;
  }

  // ── Behaviour ─────────────────────────────────────────────────────────────

  /** Enable the reflection loop (default: true). */
  enableReflection(enabled = true): this {
    this.config.enableReflection = enabled;
    return this;
  }

  /** Enable memory pruning (default: true). */
  enablePruning(enabled = true, intervalMs?: number): this {
    this.config.enablePruning = enabled;
    if (intervalMs !== undefined) this.config.pruningIntervalMs = intervalMs;
    return this;
  }

  /** Set maximum parallel tasks in the hierarchical planner. */
  setMaxPlanParallelism(n: number): this {
    if (n < 1) throw new Error("[AgentBuilder] maxPlanParallelism must be >= 1");
    this.config.maxPlanParallelism = n;
    return this;
  }

  /**
   * Set a per-turn execution timeout in milliseconds.
   * Turns that exceed this limit will throw a TimeoutError.
   * Default: no timeout.
   */
  withTimeout(ms: number): this {
    if (ms <= 0) throw new Error("[AgentBuilder] timeout must be > 0");
    this.config.turnTimeoutMs = ms;
    return this;
  }

  /** Merge arbitrary config overrides. */
  configure(overrides: Partial<AgentConfig>): this {
    this.config = { ...this.config, ...overrides };
    return this;
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  /**
   * Validate the current builder configuration.
   * Returns errors (blocking) and warnings (non-blocking).
   * `build()` calls this automatically and throws on errors.
   */
  validate(): BuilderValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!this.config.name?.trim()) errors.push("name is required");
    if (!this.config.compute) warnings.push("no compute adapter set — MockComputeAdapter will be used");
    if (!this.config.storage) warnings.push("no storage adapter set — InMemoryStorageAdapter will be used");
    if (!this.config.memory)  warnings.push("no memory adapter set — InMemoryMemoryAdapter will be used");

    const skillIds = (this.config.skills ?? []).map((s) => s.manifest.id);
    const dupSkills = skillIds.filter((id, i) => skillIds.indexOf(id) !== i);
    if (dupSkills.length > 0) errors.push(`duplicate skill ids: ${dupSkills.join(", ")}`);

    const pluginIds = (this.config.plugins ?? []).map((p) => p.id);
    const dupPlugins = pluginIds.filter((id, i) => pluginIds.indexOf(id) !== i);
    if (dupPlugins.length > 0) errors.push(`duplicate plugin ids: ${dupPlugins.join(", ")}`);

    if ((this.config.maxPlanParallelism ?? 3) < 1) errors.push("maxPlanParallelism must be >= 1");
    if (this.config.turnTimeoutMs !== undefined && this.config.turnTimeoutMs <= 0) {
      errors.push("turnTimeoutMs must be > 0");
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  /**
   * Return a human-readable descriptor of the current builder state.
   * Useful for logging, debugging, and the on-chain registry.
   */
  describe(): BuilderDescriptor {
    return {
      name: this.config.name,
      version: this.config.version ?? "0.1.0",
      skillCount: (this.config.skills ?? []).length,
      pluginCount: (this.config.plugins ?? []).length,
      skillIds: (this.config.skills ?? []).map((s) => s.manifest.id),
      pluginIds: (this.config.plugins ?? []).map((p) => p.id),
      hasCompute: !!this.config.compute,
      hasStorage: !!this.config.storage,
      hasMemory: !!this.config.memory,
      reflectionEnabled: this.config.enableReflection ?? true,
      pruningEnabled: this.config.enablePruning ?? true,
      maxPlanParallelism: this.config.maxPlanParallelism ?? 3,
      turnTimeoutMs: this.config.turnTimeoutMs,
      tags: this.config.tags ?? [],
    };
  }

  /**
   * Clone this builder, producing an independent copy.
   * Useful for creating agent variants from a shared base configuration.
   *
   * @example
   * ```ts
   * const base = new AgentBuilder().setName("Base").use(zeroGPlugin(cfg));
   * const agentA = await base.clone().skill(skillA).build();
   * const agentB = await base.clone().skill(skillB).build();
   * ```
   */
  clone(): AgentBuilder {
    const copy = new AgentBuilder();
    copy.config = {
      ...this.config,
      plugins: [...(this.config.plugins ?? [])],
      skills: [...(this.config.skills ?? [])],
      tags: [...(this.config.tags ?? [])],
    };
    return copy;
  }

  /** Return the current config snapshot (useful for debugging). */
  toConfig(): Readonly<AgentConfig> {
    return Object.freeze({ ...this.config });
  }

  // ── Build ─────────────────────────────────────────────────────────────────

  /**
   * Validate and build the agent.
   * Throws a descriptive error if validation fails.
   * Returns a ready-to-use AgentInstance.
   */
  async build(): Promise<AgentInstance> {
    const { valid, errors, warnings } = this.validate();
    if (warnings.length > 0 && process.env.CLAW_DEBUG) {
      for (const w of warnings) console.warn(`[AgentBuilder] warning: ${w}`);
    }
    if (!valid) {
      throw new Error(`[AgentBuilder] Invalid configuration:\n  - ${errors.join("\n  - ")}`);
    }
    return createAgent(this.config);
  }
}
''')

# ─────────────────────────────────────────────────────────────────────────────
# 2. packages/core/src/SkillRunner.ts
#    Add: getAll(), disableAll(), enableAll(), executeWithTimeout(), getStats()
# ─────────────────────────────────────────────────────────────────────────────
w("packages/core/src/SkillRunner.ts", r'''/**
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
''')

# ─────────────────────────────────────────────────────────────────────────────
# 3. packages/core/src/PlanExecutor.ts
#    Add: cancel(), getActivePlans(), plan timeout, per-task timeout
# ─────────────────────────────────────────────────────────────────────────────
w("packages/core/src/PlanExecutor.ts", r'''/**
 * PlanExecutor
 *
 * Executes hierarchical plans produced by the LLM planner.
 * Tasks with no unresolved dependencies run in parallel up to
 * the configured maxParallelism limit.
 *
 * New in v3:
 *   - cancel(planId) — abort an in-flight plan
 *   - getActivePlans() — list currently executing plans
 *   - per-plan and per-task timeouts
 */

import { randomUUID } from "crypto";
import type {
  Plan,
  PlanTask,
  WalletAddress,
  ComputeAdapter,
} from "./types.js";
import type { SkillRunner } from "./SkillRunner.js";

interface PlanExecutorDeps {
  compute: ComputeAdapter;
  skillRunner: SkillRunner;
  maxParallelism: number;
  /** Optional per-plan timeout in ms. Default: no timeout. */
  planTimeoutMs?: number;
  /** Optional per-task timeout in ms. Default: no timeout. */
  taskTimeoutMs?: number;
}

export class PlanExecutor {
  private readonly deps: PlanExecutorDeps;
  /** Plans currently executing, keyed by plan id. */
  private readonly activePlans: Map<string, { plan: Plan; abortController: AbortController }> = new Map();

  constructor(deps: PlanExecutorDeps) {
    this.deps = deps;
  }

  /** Return a snapshot of all currently executing plans. */
  getActivePlans(): Plan[] {
    return [...this.activePlans.values()].map((e) => ({ ...e.plan }));
  }

  /**
   * Cancel an in-flight plan by id.
   * All pending tasks are immediately marked as "skipped".
   * Returns true if the plan was found and cancelled.
   */
  cancel(planId: string): boolean {
    const entry = this.activePlans.get(planId);
    if (!entry) return false;
    entry.abortController.abort();
    for (const task of entry.plan.tasks) {
      if (task.status === "pending" || task.status === "running") {
        task.status = "skipped";
        task.error = "Cancelled by caller";
      }
    }
    entry.plan.status = "failed";
    entry.plan.completedAt = Date.now();
    this.activePlans.delete(planId);
    return true;
  }

  async execute(goal: string, walletAddress?: WalletAddress): Promise<Plan> {
    const planId = randomUUID();
    const createdAt = Date.now();
    const abortController = new AbortController();

    // Step 1: LLM decomposes the goal into tasks
    let tasks: PlanTask[] = [];
    try {
      const skills = this.deps.skillRunner.listEnabled();
      const skillList = skills.map((s) => `${s.id}: ${s.description}`).join("\n");
      const resp = await this.deps.compute.complete({
        messages: [
          {
            role: "system",
            content: `You are a planning agent. Decompose the given goal into 2-5 concrete tasks.
Return ONLY a JSON array of task objects with this shape:
[{ "id": "t1", "goal": "...", "dependsOn": [], "skillHint": "skill.id or null" }]
Rules:
  - Each task must have a unique id (t1, t2, ...).
  - dependsOn lists ids of tasks that must complete before this one starts.
  - skillHint is the id of the most relevant skill, or null.
  - Do not include explanation text outside the JSON array.
Available skills:\n${skillList || "none"}`,
          },
          { role: "user", content: goal },
        ],
        temperature: 0.3,
        maxTokens: 600,
      });

      const raw = resp.content.trim();
      const jsonStr = raw.startsWith("[") ? raw : raw.slice(raw.indexOf("["));
      const parsed = JSON.parse(jsonStr) as Array<{
        id: string;
        goal: string;
        dependsOn?: string[];
        skillHint?: string;
      }>;
      tasks = parsed.map((t) => ({
        id: t.id,
        goal: t.goal,
        dependsOn: t.dependsOn ?? [],
        skillHint: t.skillHint ?? undefined,
        status: "pending" as const,
      }));
    } catch {
      // Fallback: single task
      tasks = [{ id: "t1", goal, dependsOn: [], status: "pending" }];
    }

    const plan: Plan = {
      id: planId,
      goal,
      tasks,
      status: "running",
      walletAddress,
      createdAt,
      schemaVersion: "1.1",
    };

    this.activePlans.set(planId, { plan, abortController });

    // Optional plan-level timeout
    let planTimer: ReturnType<typeof setTimeout> | undefined;
    if (this.deps.planTimeoutMs) {
      planTimer = setTimeout(() => {
        if (this.activePlans.has(planId)) {
          this.cancel(planId);
        }
      }, this.deps.planTimeoutMs);
    }

    try {
      await this.executeTasks(plan, abortController.signal);
    } finally {
      clearTimeout(planTimer);
      this.activePlans.delete(planId);
    }

    return plan;
  }

  private async executeTasks(plan: Plan, signal: AbortSignal): Promise<void> {
    const results: Map<string, string> = new Map();

    const isReady = (task: PlanTask) =>
      task.status === "pending" &&
      task.dependsOn.every((dep) => {
        const depTask = plan.tasks.find((t) => t.id === dep);
        return depTask?.status === "completed";
      });

    let iterations = 0;
    while (plan.tasks.some((t) => t.status === "pending" || t.status === "running")) {
      if (signal.aborted) break;
      if (++iterations > 20) break; // safety

      const ready = plan.tasks.filter(isReady).slice(0, this.deps.maxParallelism);
      if (ready.length === 0) {
        const pending = plan.tasks.filter((t) => t.status === "pending");
        if (pending.length > 0) {
          for (const t of pending) { t.status = "skipped"; t.error = "Dependency deadlock"; }
        }
        break;
      }

      for (const task of ready) task.status = "running";

      await Promise.allSettled(
        ready.map(async (task) => {
          if (signal.aborted) { task.status = "skipped"; task.error = "Cancelled"; return; }
          task.startedAt = Date.now();
          try {
            const depContext = task.dependsOn
              .map((dep) => results.get(dep))
              .filter(Boolean)
              .join("\n");

            let result: string;

            // Try skill execution first
            if (task.skillHint && this.deps.skillRunner.has(task.skillHint)) {
              const skillResult = this.deps.taskTimeoutMs
                ? await this.deps.skillRunner.executeWithTimeout(
                    task.skillHint,
                    { goal: task.goal, context: depContext },
                    this.deps.taskTimeoutMs,
                  )
                : await this.deps.skillRunner.execute(
                    task.skillHint,
                    { goal: task.goal, context: depContext },
                  );
              result = typeof skillResult.output === "string"
                ? skillResult.output
                : JSON.stringify(skillResult);
            } else {
              // Fall back to LLM
              const llmResp = await this.deps.compute.complete({
                messages: [
                  { role: "system", content: "Complete the given sub-task concisely. Return only the result." },
                  {
                    role: "user",
                    content: depContext
                      ? `Context:\n${depContext}\n\nTask: ${task.goal}`
                      : task.goal,
                  },
                ],
                temperature: 0.4,
              });
              result = llmResp.content;
            }

            task.result = result;
            task.status = "completed";
            task.completedAt = Date.now();
            results.set(task.id, result);
          } catch (err) {
            task.error = err instanceof Error ? err.message : String(err);
            task.status = "failed";
            task.completedAt = Date.now();
          }
        }),
      );
    }

    // Synthesis
    const completedResults = plan.tasks
      .filter((t) => t.status === "completed" && t.result)
      .map((t) => `[${t.id}] ${t.goal}:\n${t.result}`)
      .join("\n\n");

    if (completedResults && !signal.aborted) {
      try {
        const synthResp = await this.deps.compute.complete({
          messages: [
            {
              role: "system",
              content: "Synthesize the following task results into a single coherent answer for the original goal.",
            },
            {
              role: "user",
              content: `Goal: ${plan.goal}\n\nResults:\n${completedResults}`,
            },
          ],
        });
        plan.synthesisResult = synthResp.content;
      } catch {
        plan.synthesisResult = completedResults;
      }
    }

    const allOk = plan.tasks.every((t) => t.status === "completed" || t.status === "skipped");
    plan.status = signal.aborted ? "failed" : allOk ? "completed" : "failed";
    plan.completedAt = Date.now();
  }
}
''')

# ─────────────────────────────────────────────────────────────────────────────
# 4. packages/core/src/PluginManager.ts
#    Replace console.error with a configurable logger interface
# ─────────────────────────────────────────────────────────────────────────────
w("packages/core/src/PluginManager.ts", r'''/**
 * PluginManager
 *
 * Manages the lifecycle of all registered plugins. Plugins are executed
 * in registration order for before-hooks and in reverse order for
 * after-hooks (middleware stack pattern).
 *
 * v3: configurable logger, has(), count(), describe()
 */

import type {
  PluginDefinition,
  PluginId,
  AgentInstance,
  AgentTurnInput,
  AgentTurnResult,
  MemoryRecord,
  SkillId,
  TurnContext,
} from "./types.js";

export interface PluginManagerLogger {
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

const defaultLogger: PluginManagerLogger = {
  warn: (msg, meta) => console.warn(`[PluginManager] ${msg}`, meta ?? ""),
  error: (msg, meta) => console.error(`[PluginManager] ${msg}`, meta ?? ""),
};

export interface PluginDescriptor {
  id: PluginId;
  name: string;
  version?: string;
  hooks: string[];
}

export class PluginManager {
  private readonly plugins: Map<PluginId, PluginDefinition> = new Map();
  private readonly order: PluginId[] = [];
  private readonly logger: PluginManagerLogger;

  constructor(logger?: PluginManagerLogger) {
    this.logger = logger ?? defaultLogger;
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /** Register a plugin. Throws if a plugin with the same id is already registered. */
  register(plugin: PluginDefinition): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`[PluginManager] Duplicate plugin id: "${plugin.id}"`);
    }
    this.plugins.set(plugin.id, plugin);
    this.order.push(plugin.id);
  }

  /** Register multiple plugins in order. */
  registerAll(plugins: PluginDefinition[]): void {
    for (const p of plugins) this.register(p);
  }

  /** Unregister a plugin by id. Returns true if it was found and removed. */
  unregister(id: PluginId): boolean {
    const idx = this.order.indexOf(id);
    if (idx === -1) return false;
    this.plugins.delete(id);
    this.order.splice(idx, 1);
    return true;
  }

  // ── Introspection ─────────────────────────────────────────────────────────

  list(): PluginDefinition[] {
    return this.order.map((id) => this.plugins.get(id)!);
  }

  get(id: PluginId): PluginDefinition | undefined {
    return this.plugins.get(id);
  }

  has(id: PluginId): boolean {
    return this.plugins.has(id);
  }

  count(): number {
    return this.plugins.size;
  }

  /** Return human-readable descriptors for all registered plugins. */
  describe(): PluginDescriptor[] {
    return this.order.map((id) => {
      const p = this.plugins.get(id)!;
      const hooks = Object.keys(p.hooks ?? {}).filter(
        (k) => typeof (p.hooks as Record<string, unknown>)[k] === "function",
      );
      return { id, name: p.name ?? id, version: p.version, hooks };
    });
  }

  // ── Lifecycle hooks ───────────────────────────────────────────────────────

  async runOnAgentInit(agent: AgentInstance): Promise<void> {
    for (const id of this.order) {
      const p = this.plugins.get(id)!;
      try {
        await p.hooks.onAgentInit?.(agent);
      } catch (err) {
        this.logger.error(`onAgentInit error in plugin "${id}"`, { error: String(err) });
      }
    }
  }

  async runOnBeforeTurn(
    input: AgentTurnInput,
    ctx: TurnContext,
  ): Promise<AgentTurnInput> {
    let current = input;
    for (const id of this.order) {
      const p = this.plugins.get(id)!;
      try {
        current = (await p.hooks.onBeforeTurn?.(current, ctx)) ?? current;
      } catch (err) {
        this.logger.error(`onBeforeTurn error in plugin "${id}"`, { error: String(err) });
      }
    }
    return current;
  }

  async runOnAfterTurn(
    result: AgentTurnResult,
    ctx: TurnContext,
  ): Promise<AgentTurnResult> {
    let current = result;
    // Reverse order — last registered plugin runs first on the way out
    for (const id of [...this.order].reverse()) {
      const p = this.plugins.get(id)!;
      try {
        current = (await p.hooks.onAfterTurn?.(current, ctx)) ?? current;
      } catch (err) {
        this.logger.error(`onAfterTurn error in plugin "${id}"`, { error: String(err) });
      }
    }
    return current;
  }

  async runOnMemorySave(record: MemoryRecord): Promise<MemoryRecord> {
    let current = record;
    for (const id of this.order) {
      const p = this.plugins.get(id)!;
      try {
        current = (await p.hooks.onMemorySave?.(current)) ?? current;
      } catch (err) {
        this.logger.error(`onMemorySave error in plugin "${id}"`, { error: String(err) });
      }
    }
    return current;
  }

  async runOnSkillExecute(
    skillId: SkillId,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
  ): Promise<void> {
    for (const id of this.order) {
      const p = this.plugins.get(id)!;
      try {
        await p.hooks.onSkillExecute?.(skillId, input, output);
      } catch (err) {
        this.logger.error(`onSkillExecute error in plugin "${id}"`, { error: String(err) });
      }
    }
  }

  async runOnError(error: Error, phase: string): Promise<void> {
    for (const id of this.order) {
      const p = this.plugins.get(id)!;
      try {
        await p.hooks.onError?.(error, phase);
      } catch (innerErr) {
        this.logger.error(`onError error in plugin "${id}"`, { error: String(innerErr) });
      }
    }
  }

  async runOnAgentDestroy(agent: AgentInstance): Promise<void> {
    for (const id of [...this.order].reverse()) {
      const p = this.plugins.get(id)!;
      try {
        await p.hooks.onAgentDestroy?.(agent);
      } catch (err) {
        this.logger.error(`onAgentDestroy error in plugin "${id}"`, { error: String(err) });
      }
    }
  }
}
''')

# ─────────────────────────────────────────────────────────────────────────────
# 5. backend/src/framework/factory.ts
#    Add graceful shutdown (SIGTERM/SIGINT) to bootstrapFrameworkFromEnv
# ─────────────────────────────────────────────────────────────────────────────
patch(
    "backend/src/framework/factory.ts",
    "  const kernel = createFrameworkKernel(config);\n  await kernel.start();\n  return kernel;\n}",
    """  const kernel = createFrameworkKernel(config);
  await kernel.start();

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  // Register SIGTERM and SIGINT handlers so the kernel stops cleanly when the
  // process is terminated (e.g. by Docker, Kubernetes, or Ctrl-C).
  const shutdown = async (signal: string) => {
    kernel.logger.info(`Received ${signal} — shutting down gracefully`);
    try {
      await kernel.stop();
      process.exit(0);
    } catch (err) {
      kernel.logger.error("Error during graceful shutdown", { error: String(err) });
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT",  () => shutdown("SIGINT"));

  return kernel;
}
""",
    "graceful shutdown"
)

# ─────────────────────────────────────────────────────────────────────────────
# 6. packages/core/src/index.ts
#    Add SkillStats, BuilderValidationResult, BuilderDescriptor, PluginDescriptor exports
# ─────────────────────────────────────────────────────────────────────────────
patch(
    "packages/core/src/index.ts",
    "export { PluginManager } from \"./PluginManager.js\";",
    """export { PluginManager } from \"./PluginManager.js\";
export type { PluginManagerLogger, PluginDescriptor } from \"./PluginManager.js\";""",
    "PluginManager types"
)
patch(
    "packages/core/src/index.ts",
    "export { SkillRunner } from \"./SkillRunner.js\";",
    """export { SkillRunner } from \"./SkillRunner.js\";
export type { SkillStats } from \"./SkillRunner.js\";""",
    "SkillStats type"
)
patch(
    "packages/core/src/index.ts",
    "export { AgentBuilder } from \"./AgentBuilder.js\";",
    """export { AgentBuilder } from \"./AgentBuilder.js\";
export type { BuilderValidationResult, BuilderDescriptor } from \"./AgentBuilder.js\";""",
    "AgentBuilder types"
)

# ─────────────────────────────────────────────────────────────────────────────
# 7. packages/core/src/types.ts
#    Add turnTimeoutMs and tags to AgentConfig
# ─────────────────────────────────────────────────────────────────────────────
patch(
    "packages/core/src/types.ts",
    "  maxPlanParallelism?: number;",
    """  maxPlanParallelism?: number;
  /** Per-turn execution timeout in ms. Turns exceeding this limit throw a TimeoutError. */
  turnTimeoutMs?: number;
  /** Searchable tags for the on-chain skill registry. */
  tags?: string[];""",
    "AgentConfig turnTimeoutMs + tags"
)

# ─────────────────────────────────────────────────────────────────────────────
# 8. packages/core/src/createAgent.ts — add turnTimeoutMs enforcement
# ─────────────────────────────────────────────────────────────────────────────
# Read current createAgent.ts to find the run() method
ca_path = os.path.join(BASE, "packages/core/src/createAgent.ts")
with open(ca_path) as f:
    ca = f.read()

# Find the run() method and add timeout wrapping
OLD_RUN = "    async run(input: AgentTurnInput): Promise<AgentTurnResult> {"
NEW_RUN = """    async run(input: AgentTurnInput): Promise<AgentTurnResult> {
      // Per-turn timeout enforcement
      if (config.turnTimeoutMs) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`[ClawAgent] Turn timed out after ${config.turnTimeoutMs}ms`)),
            config.turnTimeoutMs,
          );
        });
        const runPromise = this._runTurn(input);
        try {
          const result = await Promise.race([runPromise, timeoutPromise]);
          clearTimeout(timer);
          return result;
        } catch (err) {
          clearTimeout(timer);
          throw err;
        }
      }
      return this._runTurn(input);
    },

    async _runTurn(input: AgentTurnInput): Promise<AgentTurnResult> {"""

if OLD_RUN in ca and "_runTurn" not in ca:
    # Also need to close the _runTurn method — find the closing brace of run()
    # Strategy: insert _runTurn wrapper and find the end of the original run body
    # Find the end of the run method body by locating the next top-level `},` after OLD_RUN
    idx = ca.index(OLD_RUN)
    # Find the matching closing `},` for the run method
    # We'll do a simple brace-counting approach
    start = idx + len(OLD_RUN)
    depth = 1
    pos = start
    while pos < len(ca) and depth > 0:
        if ca[pos] == '{':
            depth += 1
        elif ca[pos] == '}':
            depth -= 1
        pos += 1
    # pos is now just after the closing `}` of the run method body
    # Insert `},` to close _runTurn before the outer `},`
    # Find the `},` right after pos
    closing_idx = ca.index("},", pos - 2)
    new_ca = ca[:closing_idx] + "\n    }," + ca[closing_idx:]
    new_ca = new_ca.replace(OLD_RUN, NEW_RUN, 1)
    with open(ca_path, "w") as f:
        f.write(new_ca)
    print("  patched packages/core/src/createAgent.ts (turnTimeoutMs)")
else:
    print("  skip createAgent.ts (already patched or marker not found)")

# ─────────────────────────────────────────────────────────────────────────────
# 9. New tests for AgentBuilder and SkillRunner
# ─────────────────────────────────────────────────────────────────────────────
w("packages/core/test/unit/agent-builder.test.ts", r'''/**
 * Unit tests for AgentBuilder refactor (v3).
 */
import { describe, it, expect } from "vitest";
import { AgentBuilder } from "../../src/AgentBuilder.js";
import { defineSkill } from "../../src/defineSkill.js";
import { definePlugin } from "../../src/definePlugin.js";
import { MockComputeAdapter } from "../../src/adapters/MockComputeAdapter.js";

const dummySkill = defineSkill({
  manifest: { id: "test.skill", name: "Test Skill", description: "A test skill", capabilities: [], version: "1.0.0" },
  execute: async () => ({ ok: true }),
});

const dummyPlugin = definePlugin({
  id: "test.plugin",
  name: "Test Plugin",
  hooks: {},
});

describe("AgentBuilder", () => {
  it("setName rejects empty string", () => {
    expect(() => new AgentBuilder().setName("")).toThrow("name must be a non-empty string");
    expect(() => new AgentBuilder().setName("  ")).toThrow("name must be a non-empty string");
  });

  it("setName trims whitespace", () => {
    const b = new AgentBuilder().setName("  MyAgent  ");
    expect(b.toConfig().name).toBe("MyAgent");
  });

  it("setVersion sets version", () => {
    const b = new AgentBuilder().setVersion("2.3.4");
    expect(b.toConfig().version).toBe("2.3.4");
  });

  it("withTags accumulates tags", () => {
    const b = new AgentBuilder().withTags("defi", "0g").withTags("support");
    expect(b.toConfig().tags).toEqual(["defi", "0g", "support"]);
  });

  it("skill() rejects duplicate ids", () => {
    expect(() =>
      new AgentBuilder().skill(dummySkill).skill(dummySkill),
    ).toThrow(`Duplicate skill id: "test.skill"`);
  });

  it("use() rejects duplicate plugin ids", () => {
    expect(() =>
      new AgentBuilder().use(dummyPlugin).use(dummyPlugin),
    ).toThrow(`Duplicate plugin id: "test.plugin"`);
  });

  it("setMaxPlanParallelism rejects < 1", () => {
    expect(() => new AgentBuilder().setMaxPlanParallelism(0)).toThrow("maxPlanParallelism must be >= 1");
  });

  it("withTimeout rejects <= 0", () => {
    expect(() => new AgentBuilder().withTimeout(0)).toThrow("timeout must be > 0");
    expect(() => new AgentBuilder().withTimeout(-1)).toThrow("timeout must be > 0");
  });

  it("validate() returns warnings when adapters are missing", () => {
    const result = new AgentBuilder().setName("X").validate();
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("compute"))).toBe(true);
  });

  it("validate() returns errors for duplicate skills", () => {
    // Bypass the skill() guard by using configure()
    const b = new AgentBuilder().setName("X").configure({
      skills: [dummySkill, dummySkill],
    });
    const result = b.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate skill"))).toBe(true);
  });

  it("describe() returns correct descriptor", () => {
    const b = new AgentBuilder()
      .setName("TestAgent")
      .setVersion("1.2.3")
      .withTags("test")
      .skill(dummySkill)
      .use(dummyPlugin)
      .withTimeout(5000)
      .enableReflection(false);
    const d = b.describe();
    expect(d.name).toBe("TestAgent");
    expect(d.version).toBe("1.2.3");
    expect(d.skillCount).toBe(1);
    expect(d.pluginCount).toBe(1);
    expect(d.skillIds).toContain("test.skill");
    expect(d.pluginIds).toContain("test.plugin");
    expect(d.reflectionEnabled).toBe(false);
    expect(d.turnTimeoutMs).toBe(5000);
    expect(d.tags).toContain("test");
  });

  it("clone() produces an independent copy", () => {
    const base = new AgentBuilder().setName("Base").skill(dummySkill);
    const clone = base.clone();
    clone.setName("Clone");
    expect(base.toConfig().name).toBe("Base");
    expect(clone.toConfig().name).toBe("Clone");
    // Adding a skill to clone should not affect base
    const anotherSkill = defineSkill({
      manifest: { id: "other.skill", name: "Other", description: "", capabilities: [], version: "1.0.0" },
      execute: async () => ({}),
    });
    clone.skill(anotherSkill);
    expect(base.toConfig().skills?.length).toBe(1);
    expect(clone.toConfig().skills?.length).toBe(2);
  });

  it("build() throws when validation fails", async () => {
    const b = new AgentBuilder().configure({ name: "" });
    await expect(b.build()).rejects.toThrow("Invalid configuration");
  });

  it("build() succeeds with minimal valid config", async () => {
    const agent = await new AgentBuilder()
      .setName("MinimalAgent")
      .withCompute(new MockComputeAdapter())
      .build();
    expect(agent).toBeDefined();
    expect(typeof agent.run).toBe("function");
    await agent.destroy();
  });
});
''')

w("packages/core/test/unit/skill-runner.test.ts", r'''/**
 * Unit tests for SkillRunner refactor (v3).
 */
import { describe, it, expect, vi } from "vitest";
import { SkillRunner } from "../../src/SkillRunner.js";
import { MockComputeAdapter } from "../../src/adapters/MockComputeAdapter.js";
import { InMemoryStorageAdapter } from "../../src/adapters/InMemoryStorageAdapter.js";
import { InMemoryMemoryAdapter } from "../../src/adapters/InMemoryMemoryAdapter.js";
import { defineSkill } from "../../src/defineSkill.js";

function makeRunner() {
  return new SkillRunner({
    compute: new MockComputeAdapter(),
    storage: new InMemoryStorageAdapter(),
    memory: new InMemoryMemoryAdapter(),
  });
}

const echoSkill = defineSkill({
  manifest: { id: "echo", name: "Echo", description: "Echoes input", capabilities: [], version: "1.0.0" },
  execute: async (input) => ({ echoed: input.message }),
});

const slowSkill = defineSkill({
  manifest: { id: "slow", name: "Slow", description: "Slow skill", capabilities: [], version: "1.0.0" },
  execute: async () => {
    await new Promise((r) => setTimeout(r, 500));
    return { done: true };
  },
});

const errorSkill = defineSkill({
  manifest: { id: "error", name: "Error", description: "Always errors", capabilities: [], version: "1.0.0" },
  execute: async () => { throw new Error("skill error"); },
});

describe("SkillRunner", () => {
  it("register and list", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    expect(runner.list().length).toBe(1);
    expect(runner.list()[0].id).toBe("echo");
  });

  it("register rejects duplicate ids", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    expect(() => runner.register(echoSkill)).toThrow(`Duplicate skill id: "echo"`);
  });

  it("execute returns correct output", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    const result = await runner.execute("echo", { message: "hello" });
    expect(result.echoed).toBe("hello");
  });

  it("execute throws for unknown skill", async () => {
    const runner = makeRunner();
    await expect(runner.execute("nonexistent", {})).rejects.toThrow("Unknown skill");
  });

  it("execute throws for disabled skill", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    runner.setEnabled("echo", false);
    await expect(runner.execute("echo", {})).rejects.toThrow("is disabled");
  });

  it("disableAll and enableAll", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    runner.register(errorSkill);
    runner.disableAll();
    expect(runner.listEnabled().length).toBe(0);
    runner.enableAll();
    expect(runner.listEnabled().length).toBe(2);
  });

  it("getAll returns manifests and stats", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    const all = runner.getAll();
    expect(all.length).toBe(1);
    expect(all[0].manifest.id).toBe("echo");
    expect(all[0].stats.callCount).toBe(0);
  });

  it("getStats tracks call counts and errors", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    runner.register(errorSkill);
    await runner.execute("echo", { message: "test" });
    await runner.execute("echo", { message: "test2" });
    try { await runner.execute("error", {}); } catch {}
    const stats = runner.getStats();
    const echoStats = stats.find((s) => s.id === "echo")!;
    const errStats = stats.find((s) => s.id === "error")!;
    expect(echoStats.callCount).toBe(2);
    expect(echoStats.errorCount).toBe(0);
    expect(echoStats.successRate).toBe(1);
    expect(errStats.callCount).toBe(1);
    expect(errStats.errorCount).toBe(1);
    expect(errStats.successRate).toBe(0);
  });

  it("executeWithTimeout resolves fast skills", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    const result = await runner.executeWithTimeout("echo", { message: "hi" }, 2000);
    expect(result.echoed).toBe("hi");
  });

  it("executeWithTimeout throws on slow skills", async () => {
    const runner = makeRunner();
    runner.register(slowSkill);
    await expect(
      runner.executeWithTimeout("slow", {}, 50),
    ).rejects.toThrow("timed out");
  });
});
''')

w("packages/core/test/unit/plugin-manager.test.ts", r'''/**
 * Unit tests for PluginManager refactor (v3).
 */
import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../../src/PluginManager.js";
import { definePlugin } from "../../src/definePlugin.js";

const p1 = definePlugin({ id: "p1", name: "Plugin 1", hooks: {} });
const p2 = definePlugin({ id: "p2", name: "Plugin 2", hooks: {} });

describe("PluginManager", () => {
  it("register and list", () => {
    const pm = new PluginManager();
    pm.register(p1);
    pm.register(p2);
    expect(pm.list().length).toBe(2);
    expect(pm.count()).toBe(2);
  });

  it("has() returns correct boolean", () => {
    const pm = new PluginManager();
    pm.register(p1);
    expect(pm.has("p1")).toBe(true);
    expect(pm.has("p2")).toBe(false);
  });

  it("register rejects duplicates", () => {
    const pm = new PluginManager();
    pm.register(p1);
    expect(() => pm.register(p1)).toThrow(`Duplicate plugin id: "p1"`);
  });

  it("unregister removes plugin", () => {
    const pm = new PluginManager();
    pm.register(p1);
    pm.register(p2);
    expect(pm.unregister("p1")).toBe(true);
    expect(pm.count()).toBe(1);
    expect(pm.has("p1")).toBe(false);
  });

  it("unregister returns false for unknown id", () => {
    const pm = new PluginManager();
    expect(pm.unregister("nonexistent")).toBe(false);
  });

  it("describe() returns hook names", () => {
    const hookPlugin = definePlugin({
      id: "hook.plugin",
      name: "Hook Plugin",
      hooks: {
        onAgentInit: async () => {},
        onBeforeTurn: async (input) => input,
      },
    });
    const pm = new PluginManager();
    pm.register(hookPlugin);
    const desc = pm.describe();
    expect(desc[0].id).toBe("hook.plugin");
    expect(desc[0].hooks).toContain("onAgentInit");
    expect(desc[0].hooks).toContain("onBeforeTurn");
  });

  it("uses custom logger instead of console.error", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const throwPlugin = definePlugin({
      id: "throw.plugin",
      name: "Throw Plugin",
      hooks: {
        onAgentInit: async () => { throw new Error("init error"); },
      },
    });
    const pm = new PluginManager(logger);
    pm.register(throwPlugin);
    await pm.runOnAgentInit({} as any);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("onAgentInit error"),
      expect.objectContaining({ error: expect.stringContaining("init error") }),
    );
    expect(logger.error).not.toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it("after-hooks run in reverse order", async () => {
    const order: string[] = [];
    const a = definePlugin({ id: "a", name: "A", hooks: { onAfterTurn: async (r) => { order.push("a"); return r; } } });
    const b = definePlugin({ id: "b", name: "B", hooks: { onAfterTurn: async (r) => { order.push("b"); return r; } } });
    const pm = new PluginManager();
    pm.register(a);
    pm.register(b);
    const mockResult = { output: "", success: true, reflections: [], memoryIds: [], metadata: {} };
    await pm.runOnAfterTurn(mockResult, {} as any);
    expect(order).toEqual(["b", "a"]); // reverse registration order
  });
});
''')

print("\nAll v3 refactoring files written successfully.")

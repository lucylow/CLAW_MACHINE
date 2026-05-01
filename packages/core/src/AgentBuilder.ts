/**
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

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
 *   .setSystemPrompt("You are a helpful DeFi assistant on 0G.")
 *   .use(zeroGPlugin({ rpc: process.env.EVM_RPC! }))
 *   .skill(weatherSkill)
 *   .enableReflection()
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

export class AgentBuilder {
  private config: AgentConfig = {
    name: "ClawAgent",
    plugins: [],
    skills: [],
    enableReflection: true,
    enablePruning: true,
    maxPlanParallelism: 3,
    pruningIntervalMs: 300_000,
  };

  /** Set the agent's display name. */
  setName(name: string): this {
    this.config.name = name;
    return this;
  }

  /** Set the system prompt injected before every turn. */
  setSystemPrompt(prompt: string): this {
    this.config.systemPrompt = prompt;
    return this;
  }

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

  /** Register a plugin. Can be called multiple times. */
  use(plugin: PluginDefinition): this {
    this.config.plugins = [...(this.config.plugins ?? []), plugin];
    return this;
  }

  /** Register a skill. Can be called multiple times. */
  skill(skill: SkillDefinition): this {
    this.config.skills = [...(this.config.skills ?? []), skill];
    return this;
  }

  /** Register multiple skills at once. */
  skills(skills: SkillDefinition[]): this {
    this.config.skills = [...(this.config.skills ?? []), ...skills];
    return this;
  }

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
    this.config.maxPlanParallelism = n;
    return this;
  }

  /** Merge arbitrary config overrides. */
  configure(overrides: Partial<AgentConfig>): this {
    this.config = { ...this.config, ...overrides };
    return this;
  }

  /** Build and initialize the agent. Returns a ready-to-use AgentInstance. */
  async build(): Promise<AgentInstance> {
    return createAgent(this.config);
  }

  /** Return the current config snapshot (useful for debugging). */
  toConfig(): Readonly<AgentConfig> {
    return Object.freeze({ ...this.config });
  }
}

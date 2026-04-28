/**
 * PluginManager
 *
 * Manages the lifecycle of all registered plugins. Plugins are executed
 * in registration order for before-hooks and in reverse order for
 * after-hooks (middleware stack pattern).
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

export class PluginManager {
  private readonly plugins: Map<PluginId, PluginDefinition> = new Map();
  private readonly order: PluginId[] = [];

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

  /** Unregister a plugin by id. */
  unregister(id: PluginId): boolean {
    const idx = this.order.indexOf(id);
    if (idx === -1) return false;
    this.plugins.delete(id);
    this.order.splice(idx, 1);
    return true;
  }

  list(): PluginDefinition[] {
    return this.order.map((id) => this.plugins.get(id)!);
  }

  get(id: PluginId): PluginDefinition | undefined {
    return this.plugins.get(id);
  }

  // ── Lifecycle hooks ──────────────────────────────────────────────────────────

  async runOnAgentInit(agent: AgentInstance): Promise<void> {
    for (const id of this.order) {
      const p = this.plugins.get(id)!;
      try {
        await p.hooks.onAgentInit?.(agent);
      } catch (err) {
        console.error(`[PluginManager] onAgentInit error in plugin "${id}":`, err);
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
        console.error(`[PluginManager] onBeforeTurn error in plugin "${id}":`, err);
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
        console.error(`[PluginManager] onAfterTurn error in plugin "${id}":`, err);
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
        console.error(`[PluginManager] onMemorySave error in plugin "${id}":`, err);
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
        console.error(`[PluginManager] onSkillExecute error in plugin "${id}":`, err);
      }
    }
  }

  async runOnError(error: Error, phase: string): Promise<void> {
    for (const id of this.order) {
      const p = this.plugins.get(id)!;
      try {
        await p.hooks.onError?.(error, phase);
      } catch (innerErr) {
        console.error(`[PluginManager] onError error in plugin "${id}":`, innerErr);
      }
    }
  }

  async runOnAgentDestroy(agent: AgentInstance): Promise<void> {
    for (const id of [...this.order].reverse()) {
      const p = this.plugins.get(id)!;
      try {
        await p.hooks.onAgentDestroy?.(agent);
      } catch (err) {
        console.error(`[PluginManager] onAgentDestroy error in plugin "${id}":`, err);
      }
    }
  }
}

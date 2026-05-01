/**
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

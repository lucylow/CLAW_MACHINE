import type {
  AgentBusLike,
  AgentRunMode,
  FrameworkMemoryLike,
  FrameworkMode,
  FrameworkPlugin,
  FrameworkStorageLike,
  SkillDefinition,
} from "./types.js";
import { AgentRuntime, type RuntimeServices } from "./runtime.js";
import { definePlugin } from "./plugin.js";
import { defineSkill } from "./skill.js";

export interface AgentBuilderOptions {
  mode?: FrameworkMode;
  services?: RuntimeServices;
}

export class AgentBuilder {
  private readonly skills: SkillDefinition[] = [];
  private readonly plugins: FrameworkPlugin[] = [];
  private readonly settings: Record<string, unknown> = {};
  private name = "UnnamedAgent";
  private systemPrompt = "You are a helpful agent.";
  private version = "1.0.0";
  private description?: string;
  private tags: string[] = [];
  private id?: string;
  private mode: FrameworkMode = "hybrid";
  private services: RuntimeServices = {};

  constructor(opts: AgentBuilderOptions = {}) {
    this.mode = opts.mode ?? "hybrid";
    this.services = opts.services ?? {};
  }

  setId(id: string): this {
    this.id = id;
    return this;
  }
  setName(name: string): this {
    this.name = name;
    return this;
  }
  setSystemPrompt(prompt: string): this {
    this.systemPrompt = prompt;
    return this;
  }
  setVersion(version: string): this {
    this.version = version;
    return this;
  }
  setDescription(description: string): this {
    this.description = description;
    return this;
  }
  setMode(mode: FrameworkMode): this {
    this.mode = mode;
    return this;
  }
  setTags(tags: string[]): this {
    this.tags = tags;
    return this;
  }
  setSetting(key: string, value: unknown): this {
    this.settings[key] = value;
    return this;
  }
  setServices(services: Partial<RuntimeServices>): this {
    this.services = { ...this.services, ...services };
    return this;
  }

  use(plugin: FrameworkPlugin): this {
    this.plugins.push(definePlugin(plugin));
    return this;
  }
  plugin(plugin: FrameworkPlugin): this {
    return this.use(plugin);
  }

  skill(skill: SkillDefinition): this {
    this.skills.push(defineSkill(skill));
    return this;
  }

  skillsMany(skills: SkillDefinition[]): this {
    for (const skill of skills) this.skill(skill);
    return this;
  }

  memory(memory: FrameworkMemoryLike): this {
    this.services.memory = memory;
    return this;
  }
  storage(storage: FrameworkStorageLike): this {
    this.services.storage = storage;
    return this;
  }
  bus(bus: AgentBusLike): this {
    this.services.bus = bus;
    return this;
  }

  build(): AgentRuntime {
    return new AgentRuntime({
      id: this.id,
      name: this.name,
      systemPrompt: this.systemPrompt,
      version: this.version,
      description: this.description,
      mode: this.mode,
      services: this.services,
      skills: this.skills,
      plugins: this.plugins,
      settings: this.settings,
      tags: this.tags,
    });
  }

  async buildAndInitialize(input: {
    sessionId: string;
    walletAddress?: string;
    requestId?: string;
    runMode?: AgentRunMode;
  }): Promise<AgentRuntime> {
    const runtime = this.build();
    await runtime.initialize({
      requestId: input.requestId ?? `req_${Date.now()}`,
      sessionId: input.sessionId,
      walletAddress: input.walletAddress,
      runMode: input.runMode ?? "chat",
      frameworkMode: this.mode,
      timestamp: Date.now(),
      metadata: { builder: "AgentBuilder" },
    });
    return runtime;
  }
}

import type { AgentRuntimeLike, SkillDefinition, SkillExecutionContext } from "./types.js";

export interface OpenClawToolLike {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
  execute(input: unknown, ctx: SkillExecutionContext): Promise<unknown> | unknown;
}

export interface OpenClawPluginManifest {
  name: string;
  description: string;
  version: string;
  tools: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  }>;
}

export class OpenClawBridge {
  constructor(private readonly runtime: AgentRuntimeLike) {}

  registerTool(
    tool: OpenClawToolLike,
    opts: { id?: string; kind?: SkillDefinition["kind"]; tags?: string[] } = {}
  ): SkillDefinition {
    const skill: SkillDefinition = {
      id: opts.id ?? `openclaw_${tool.name.replace(/[^a-z0-9]+/gi, "_").toLowerCase()}`,
      name: tool.name,
      description: tool.description,
      kind: opts.kind ?? "execution",
      tags: [...(opts.tags ?? []), "openclaw"],
      version: "1.0.0",
      source: "openclaw",
      async run(ctx) {
        return tool.execute(ctx.input, ctx);
      },
      async canHandle(input) {
        const text = `${tool.name} ${tool.description} ${(opts.tags ?? []).join(" ")}`.toLowerCase();
        const tokens = input.toLowerCase().split(/\s+/).filter(Boolean);
        if (!tokens.length) return 0.1;
        const hits = tokens.filter((token) => text.includes(token)).length;
        return Math.min(1, 0.25 + hits / tokens.length);
      },
    };

    void this.runtime.registerSkill(skill);
    return skill;
  }

  exportTool(skill: SkillDefinition): OpenClawToolLike {
    return {
      name: skill.name,
      description: skill.description,
      parameters: {
        skillId: skill.id,
        tags: skill.tags ?? [],
        version: skill.version ?? "1.0.0",
      },
      execute: async (_input, ctx) => skill.run(ctx),
    };
  }

  async exportAllAsOpenClawTools(): Promise<OpenClawToolLike[]> {
    const skills = await Promise.resolve(this.runtime.listSkills());
    return skills.map((skill) => this.exportTool(skill));
  }

  async exportManifest(): Promise<OpenClawPluginManifest> {
    const tools = (await this.exportAllAsOpenClawTools()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    }));

    return {
      name: "claw-machine-openclaw",
      description: "OpenClaw bridge manifest for CLAW_MACHINE",
      version: "1.0.0",
      tools,
    };
  }
}

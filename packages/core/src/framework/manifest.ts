import crypto from "crypto";
import type { AgentManifest, FrameworkPlugin, SkillDefinition } from "./types.js";

export function buildAgentManifest(input: {
  id?: string;
  name: string;
  systemPrompt: string;
  version?: string;
  description?: string;
  skills?: SkillDefinition[];
  plugins?: FrameworkPlugin[];
  settings?: Record<string, unknown>;
  tags?: string[];
}): AgentManifest {
  const now = Date.now();
  return {
    id: input.id ?? `agent_${crypto.randomUUID()}`,
    name: input.name.trim(),
    systemPrompt: input.systemPrompt.trim(),
    version: input.version ?? "1.0.0",
    description: input.description,
    createdAt: now,
    updatedAt: now,
    skills: input.skills ?? [],
    plugins: (input.plugins ?? []).map((p) => p.manifest),
    settings: input.settings ?? {},
    tags: input.tags ?? [],
  };
}

export function manifestHash(manifest: AgentManifest): string {
  return crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

export function updateManifest(manifest: AgentManifest, patch: Partial<AgentManifest>): AgentManifest {
  return {
    ...manifest,
    ...patch,
    updatedAt: Date.now(),
    skills: patch.skills ?? manifest.skills,
    plugins: patch.plugins ?? manifest.plugins,
    settings: patch.settings ?? manifest.settings,
    tags: patch.tags ?? manifest.tags,
  };
}

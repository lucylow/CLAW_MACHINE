import crypto from "crypto";
import type { SkillDefinition, SkillExecutionContext, SkillKind } from "./types.js";

export interface SkillMetadata {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  tags: string[];
  version: string;
  enabled: boolean;
  source?: string;
  manifestHash: string;
}

export function defineSkill(skill: SkillDefinition): SkillDefinition {
  return {
    ...skill,
    id: skill.id.trim(),
    name: skill.name.trim(),
    description: skill.description.trim(),
    kind: skill.kind ?? "general",
    tags: skill.tags ?? [],
    version: skill.version ?? "1.0.0",
    enabled: skill.enabled !== false,
  };
}

export function createSkillMetadata(skill: SkillDefinition): SkillMetadata {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    kind: skill.kind ?? "general",
    tags: skill.tags ?? [],
    version: skill.version ?? "1.0.0",
    enabled: skill.enabled !== false,
    source: skill.source,
    manifestHash: crypto
      .createHash("sha256")
      .update(
        JSON.stringify({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          kind: skill.kind,
          tags: skill.tags ?? [],
          version: skill.version,
          enabled: skill.enabled !== false,
        })
      )
      .digest("hex"),
  };
}

export async function canHandleSkill(
  skill: SkillDefinition,
  input: string,
  ctx: SkillExecutionContext
): Promise<number> {
  if (!skill.canHandle) return 1;
  const score = await Promise.resolve(skill.canHandle(input, ctx));
  if (typeof score !== "number" || !Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, score));
}

export async function executeSkill(skill: SkillDefinition, ctx: SkillExecutionContext): Promise<unknown> {
  return Promise.resolve(skill.run(ctx));
}

export function scoreSkillCoverage(skill: SkillDefinition, input: string): number {
  const text = `${skill.name} ${skill.description} ${(skill.tags ?? []).join(" ")}`.toLowerCase();
  const tokens = input.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return 0;
  let hits = 0;
  for (const token of tokens) {
    if (text.includes(token)) hits++;
  }
  return hits / tokens.length;
}

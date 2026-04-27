import { SkillManifest } from "../types/runtime";
import { SkillExecutionError, SkillNotFoundError, ValidationError } from "../errors/AppError";

export interface SkillExecutor {
  execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface RegisteredSkill {
  manifest: SkillManifest;
  executor: SkillExecutor;
}

export class SkillRegistry {
  private readonly skills = new Map<string, RegisteredSkill>();

  register(manifest: SkillManifest, executor: SkillExecutor): void {
    if (!manifest.id || !manifest.name || !manifest.description) {
      throw new ValidationError("Skill manifest is missing required fields", "SKILL_003_REGISTRATION_INVALID", { manifest });
    }
    if (this.skills.has(manifest.id)) {
      throw new ValidationError(`Duplicate skill id "${manifest.id}"`, "SKILL_004_DUPLICATE", { skillId: manifest.id });
    }
    this.skills.set(manifest.id, { manifest, executor });
  }

  list(): SkillManifest[] {
    return [...this.skills.values()].map((s) => s.manifest);
  }

  getManifest(id: string): SkillManifest | undefined {
    return this.skills.get(id)?.manifest;
  }

  async execute(id: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const skill = this.skills.get(id);
    if (!skill) {
      throw new SkillNotFoundError(id);
    }
    if (!skill.manifest.enabled) {
      throw new SkillExecutionError(id, `Skill "${id}" is disabled`, { operation: "skill.execute" });
    }
    try {
      return await skill.executor.execute(input);
    } catch (error) {
      throw new SkillExecutionError(id, `Skill "${id}" failed to execute`, { operation: "skill.execute", inputSummary: Object.keys(input) }, error);
    }
  }
}

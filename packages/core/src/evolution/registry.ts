import type { SkillDefinitionLike } from "./types.js";

export interface LiveSkillRunnerLike {
  register(skill: SkillDefinitionLike): Promise<void> | void;
  replace?(skill: SkillDefinitionLike): Promise<void> | void;
  unregister?(skillId: string): Promise<void> | void;
  get?(skillId: string): Promise<SkillDefinitionLike | undefined> | SkillDefinitionLike | undefined;
  list?(): Promise<SkillDefinitionLike[]> | SkillDefinitionLike[];
}

export interface HotRegisterOptions {
  replace?: boolean;
  skipIfExists?: boolean;
}

export async function hotRegisterSkill(
  runner: LiveSkillRunnerLike,
  skill: SkillDefinitionLike,
  options: HotRegisterOptions = {}
): Promise<{
  ok: boolean;
  replaced: boolean;
  registered: SkillDefinitionLike;
}> {
  const existing = runner.get ? await runner.get(skill.id) : undefined;

  if (existing && options.skipIfExists && !options.replace) {
    return {
      ok: true,
      replaced: false,
      registered: existing,
    };
  }

  if (existing && options.replace && runner.replace) {
    await runner.replace(skill);
    return {
      ok: true,
      replaced: true,
      registered: skill,
    };
  }

  if (existing && runner.unregister) {
    await runner.unregister(skill.id);
  }

  await runner.register(skill);
  return {
    ok: true,
    replaced: Boolean(existing),
    registered: skill,
  };
}

export function listSkillIds(runner: LiveSkillRunnerLike): string[] {
  const raw = runner.list ? runner.list() : [];
  if (raw instanceof Promise) return [];
  return Array.isArray(raw) ? raw.map((s) => s.id) : [];
}

/**
 * SkillRunner
 *
 * Internal skill registry and executor used by createAgent.
 * Manages skill registration, enable/disable, and execution with
 * proper SkillContext injection.
 */

import { randomUUID } from "crypto";
import type {
  SkillDefinition,
  SkillManifest,
  SkillContext,
  SkillId,
  ComputeAdapter,
  StorageAdapter,
  MemoryAdapter,
  TurnContext,
} from "./types.js";

interface SkillEntry {
  manifest: SkillManifest;
  execute: SkillDefinition["execute"];
}

interface SkillRunnerDeps {
  compute: ComputeAdapter;
  storage: StorageAdapter;
  memory: MemoryAdapter;
}

export class SkillRunner {
  private readonly skills: Map<SkillId, SkillEntry> = new Map();
  private readonly deps: SkillRunnerDeps;

  constructor(deps: SkillRunnerDeps) {
    this.deps = deps;
  }

  register(skill: SkillDefinition): void {
    if (this.skills.has(skill.manifest.id)) {
      throw new Error(`[SkillRunner] Duplicate skill id: "${skill.manifest.id}"`);
    }
    this.skills.set(skill.manifest.id, {
      manifest: { ...skill.manifest, enabled: true },
      execute: skill.execute,
    });
  }

  has(id: SkillId): boolean {
    return this.skills.has(id);
  }

  list(): SkillManifest[] {
    return [...this.skills.values()].map((e) => ({ ...e.manifest }));
  }

  listEnabled(): SkillManifest[] {
    return this.list().filter((m) => m.enabled);
  }

  setEnabled(id: SkillId, enabled: boolean): void {
    const entry = this.skills.get(id);
    if (!entry) throw new Error(`[SkillRunner] Unknown skill: "${id}"`);
    entry.manifest.enabled = enabled;
  }

  async execute(
    id: SkillId,
    input: Record<string, unknown>,
    turnCtx?: TurnContext,
  ): Promise<Record<string, unknown>> {
    const entry = this.skills.get(id);
    if (!entry) throw new Error(`[SkillRunner] Unknown skill: "${id}"`);
    if (!entry.manifest.enabled) throw new Error(`[SkillRunner] Skill "${id}" is disabled`);

    const ctx: SkillContext = {
      walletAddress: (input.walletAddress as `0x${string}` | undefined) ?? turnCtx?.walletAddress,
      requestId: turnCtx?.requestId ?? randomUUID(),
      memory: this.deps.memory,
      compute: this.deps.compute,
      storage: this.deps.storage,
      emit: (event, payload) => {
        if (process.env.CLAW_DEBUG) {
          console.debug(`[claw:skill:${id}] ${event}`, payload ?? "");
        }
      },
    };

    return entry.execute(input, ctx);
  }
}

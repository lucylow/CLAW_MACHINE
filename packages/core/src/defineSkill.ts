/**
 * defineSkill
 *
 * Factory function for creating type-safe skill definitions.
 * Skills are the atomic units of agent capability — they receive
 * structured input, have access to memory/compute/storage via context,
 * and return structured output.
 *
 * @example
 * ```ts
 * import { defineSkill } from "@claw/core";
 *
 * export const weatherSkill = defineSkill({
 *   manifest: {
 *     id: "weather.fetch",
 *     name: "Weather Fetcher",
 *     description: "Fetches current weather for a given city",
 *     tags: ["weather", "external-api"],
 *     requiresWallet: false,
 *     touchesChain: false,
 *     usesCompute: false,
 *     usesStorage: false,
 *   },
 *   async execute({ city }, ctx) {
 *     const result = await fetch(`https://wttr.in/${city}?format=j1`);
 *     const data = await result.json();
 *     await ctx.memory.save({
 *       type: "task_result",
 *       content: `Weather for ${city}: ${data.current_condition[0].temp_C}°C`,
 *       importance: 0.4,
 *       tags: ["weather"],
 *       pinned: false,
 *     });
 *     return { city, tempC: data.current_condition[0].temp_C };
 *   },
 * });
 * ```
 */

import type { SkillDefinition, SkillContext } from "./types.js";

export function defineSkill(
  definition: SkillDefinition,
): SkillDefinition {
  if (!definition.manifest.id) {
    throw new Error("[defineSkill] manifest.id is required");
  }
  if (!definition.manifest.name) {
    throw new Error("[defineSkill] manifest.name is required");
  }
  if (typeof definition.execute !== "function") {
    throw new Error(`[defineSkill] execute must be a function (skill: ${definition.manifest.id})`);
  }
  return definition;
}

/**
 * Typed helper for skills that need wallet context.
 * Throws at runtime if walletAddress is missing.
 */
export function defineWalletSkill(
  definition: SkillDefinition & {
    execute(
      input: Record<string, unknown>,
      ctx: SkillContext & { walletAddress: `0x${string}` },
    ): Promise<Record<string, unknown>>;
  },
): SkillDefinition {
  const originalExecute = definition.execute;
  return defineSkill({
    ...definition,
    manifest: { ...definition.manifest, requiresWallet: true },
    async execute(input, ctx) {
      if (!ctx.walletAddress) {
        throw new Error(
          `[${definition.manifest.id}] This skill requires a connected wallet.`,
        );
      }
      return originalExecute(input, ctx as SkillContext & { walletAddress: `0x${string}` });
    },
  });
}

/**
 * definePlugin
 *
 * Factory function for creating framework plugins. Plugins extend agent
 * behaviour through lifecycle hooks without modifying core internals.
 *
 * Hook execution order per turn:
 *   onBeforeTurn → [agent executes] → onAfterTurn
 *   onMemorySave (called for each record)
 *   onSkillExecute (called after each skill)
 *   onError (called on any unhandled error)
 *
 * @example
 * ```ts
 * import { definePlugin } from "@claw/core";
 *
 * export const loggingPlugin = definePlugin({
 *   id: "logging",
 *   name: "Logging Plugin",
 *   version: "1.0.0",
 *   description: "Logs every agent turn to console",
 *   hooks: {
 *     onBeforeTurn(input) {
 *       console.log("[agent] turn start:", input.message.slice(0, 60));
 *       return input;
 *     },
 *     onAfterTurn(result) {
 *       console.log("[agent] turn done in", result.durationMs, "ms");
 *       return result;
 *     },
 *     onError(error, phase) {
 *       console.error("[agent] error in", phase, ":", error.message);
 *     },
 *   },
 * });
 * ```
 */

import type { PluginDefinition } from "./types.js";

export function definePlugin(definition: PluginDefinition): PluginDefinition {
  if (!definition.id) {
    throw new Error("[definePlugin] id is required");
  }
  if (!definition.name) {
    throw new Error("[definePlugin] name is required");
  }
  if (!definition.version) {
    throw new Error("[definePlugin] version is required");
  }
  if (!definition.hooks || typeof definition.hooks !== "object") {
    throw new Error(`[definePlugin] hooks object is required (plugin: ${definition.id})`);
  }
  return definition;
}

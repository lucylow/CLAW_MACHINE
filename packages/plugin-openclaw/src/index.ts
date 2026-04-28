/**
 * @claw/plugin-openclaw
 *
 * First-party OpenClaw compatibility plugin. Automatically registers
 * all OpenClaw AnyAgentTool instances as @claw/core skills, and
 * exposes all @claw/core skills as OpenClaw-compatible tools.
 *
 * @example
 * ```ts
 * import { AgentBuilder } from "@claw/core";
 * import { openClawPlugin } from "@claw/plugin-openclaw";
 * import type { AnyAgentToolCompat } from "@claw/plugin-openclaw";
 *
 * const myOpenClawTool: AnyAgentToolCompat = {
 *   name: "defi.swap",
 *   description: "Execute a token swap on a DEX",
 *   inputSchema: { type: "object", properties: { tokenIn: { type: "string" }, tokenOut: { type: "string" }, amount: { type: "string" } }, required: ["tokenIn", "tokenOut", "amount"] },
 *   async execute(toolCallId, params) {
 *     return { type: "tool_result", content: `Swapped ${params.amount} ${params.tokenIn} → ${params.tokenOut}` };
 *   },
 * };
 *
 * const agent = await new AgentBuilder()
 *   .setName("DeFiAgent")
 *   .use(openClawPlugin({ tools: [myOpenClawTool] }))
 *   .build();
 * ```
 */

import { randomUUID } from "crypto";
import type { PluginDefinition, SkillDefinition, AgentInstance } from "../../core/src/types.js";

// ── Minimal OpenClaw AnyAgentTool interface ───────────────────────────────────
// Replicated here so this package compiles without the full openclaw dependency.

export interface OpenClawToolSchema {
  type: "object";
  properties?: Record<string, { type: string; description?: string }>;
  required?: string[];
}

export interface OpenClawToolResult {
  type: "tool_result";
  content: string | Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface AnyAgentToolCompat {
  name: string;
  description: string;
  inputSchema: OpenClawToolSchema;
  execute(toolCallId: string, params: unknown, signal?: AbortSignal): Promise<OpenClawToolResult>;
  ownerOnly?: boolean;
}

// ── Plugin config ─────────────────────────────────────────────────────────────

export interface OpenClawPluginConfig {
  /** OpenClaw tools to register as @claw/core skills */
  tools?: AnyAgentToolCompat[];
  /** Optional tag overrides for all registered tools */
  extraTags?: string[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toolToSkill(tool: AnyAgentToolCompat, extraTags: string[] = []): SkillDefinition {
  return {
    manifest: {
      id: tool.name,
      name: tool.name,
      description: tool.description,
      tags: ["openclaw", "tool", ...extraTags],
      requiresWallet: tool.ownerOnly ?? false,
      touchesChain: false,
      usesCompute: false,
      usesStorage: false,
    },
    async execute(input) {
      const toolCallId = randomUUID();
      const result = await tool.execute(toolCallId, input);
      const text =
        typeof result.content === "string"
          ? result.content
          : result.content
              .filter((c) => c.type === "text")
              .map((c) => c.text ?? "")
              .join("\n");
      if (result.isError) {
        throw new Error(`OpenClaw tool "${tool.name}" error: ${text}`);
      }
      return { output: text, toolCallId, source: "openclaw" };
    },
  };
}

/** Convert a @claw/core skill manifest back to an OpenClaw-compatible tool */
export function skillToOpenClawTool(
  skillId: string,
  description: string,
  executeSkill: (input: Record<string, unknown>) => Promise<Record<string, unknown>>,
): AnyAgentToolCompat {
  return {
    name: skillId,
    description,
    inputSchema: {
      type: "object",
      properties: {
        input: { type: "string", description: "Natural language instruction" },
        walletAddress: { type: "string", description: "Optional wallet address" },
      },
      required: ["input"],
    },
    async execute(_toolCallId, params) {
      const result = await executeSkill(params as Record<string, unknown>);
      return {
        type: "tool_result" as const,
        content: typeof result.output === "string" ? result.output : JSON.stringify(result),
        isError: false,
      };
    },
  };
}

// ── Plugin factory ────────────────────────────────────────────────────────────

export function openClawPlugin(config: OpenClawPluginConfig = {}): PluginDefinition {
  const tools = config.tools ?? [];
  const extraTags = config.extraTags ?? [];

  return {
    id: "plugin-openclaw",
    name: "OpenClaw Compatibility Plugin",
    version: "0.1.0",
    description: "Bridges OpenClaw AnyAgentTool ↔ @claw/core SkillDefinition",
    // Pre-convert tools to skills so they are registered at agent init
    skills: tools.map((t) => toolToSkill(t, extraTags)),
    hooks: {
      onAgentInit(agent: AgentInstance) {
        const count = tools.length;
        console.log(`[plugin-openclaw] Registered ${count} OpenClaw tool(s) as skills`);
        agent.emit("plugin:openclaw:ready", { toolCount: count });
      },

      onAfterTurn(result) {
        // Tag results from OpenClaw-sourced skills
        if (result.selectedSkill && tools.some((t) => t.name === result.selectedSkill)) {
          return {
            ...result,
            trace: [
              ...result.trace,
              {
                phase: "openclaw.bridge",
                label: `Executed via OpenClaw tool: ${result.selectedSkill}`,
                durationMs: 0,
                ok: true,
              },
            ],
          };
        }
        return result;
      },
    },
  };
}

/** Export all @claw/core skills as OpenClaw-compatible tools for use in an OpenClaw agent */
export function exportSkillsAsOpenClawTools(
  skills: Array<{ id: string; description: string; execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>> }>,
): AnyAgentToolCompat[] {
  return skills.map((s) => skillToOpenClawTool(s.id, s.description, s.execute));
}

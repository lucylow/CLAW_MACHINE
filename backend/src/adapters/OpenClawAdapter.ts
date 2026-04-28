/**
 * OpenClawAdapter
 *
 * Bridges the OpenClaw plugin-sdk `AnyAgentTool` interface to the Claw Machine
 * `SkillRegistry`. This lets any OpenClaw extension (memory plugins, channel
 * tools, provider tools) be registered as a first-class Claw Machine skill
 * without rewriting the tool.
 *
 * Integration pattern (from the Claw Machine design doc):
 *   1. Instantiate an OpenClaw agent normally.
 *   2. Replace in-memory state with a ClawMachineMemory adapter.
 *   3. Route save, recall, and reflect operations to the storage layer.
 *   4. Inject retrieved lessons into the system prompt or task context.
 *
 * @see https://github.com/openclaw/openclaw/packages/plugin-sdk/src/plugin-entry.ts
 */

import { randomUUID } from "crypto";
import type { SkillRegistry } from "../skills/SkillRegistry";
import type { SkillManifest } from "../types/runtime";

// ── Minimal OpenClaw AnyAgentTool shape ──────────────────────────────────────
// We replicate only the fields we need so this adapter compiles without
// importing the full openclaw package (which is a peer dependency).
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
  /** Unique tool name — maps to skill id */
  name: string;
  /** Human-readable description */
  description: string;
  /** JSON Schema for input parameters */
  inputSchema: OpenClawToolSchema;
  /** Execute the tool */
  execute(
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
  ): Promise<OpenClawToolResult>;
  /** Optional: restrict to owner/wallet */
  ownerOnly?: boolean;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class OpenClawAdapter {
  private readonly registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * Register one OpenClaw tool as a Claw Machine skill.
   * The tool's `name` becomes the skill `id`.
   */
  registerTool(tool: AnyAgentToolCompat, overrides: Partial<SkillManifest> = {}): void {
    const manifest: SkillManifest = {
      id: tool.name,
      name: tool.name,
      description: tool.description,
      tags: ["openclaw", "tool"],
      requiresWallet: tool.ownerOnly ?? false,
      touchesChain: false,
      usesCompute: false,
      usesStorage: false,
      enabled: true,
      ...overrides,
    };

    const executor = {
      execute: async (input: Record<string, unknown>): Promise<Record<string, unknown>> => {
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
          throw new Error(`OpenClaw tool "${tool.name}" returned error: ${text}`);
        }

        return { output: text, toolCallId, source: "openclaw" };
      },
    };

    this.registry.register(manifest, executor);
  }

  /**
   * Register multiple OpenClaw tools at once.
   */
  registerTools(tools: AnyAgentToolCompat[], overrides: Partial<SkillManifest> = {}): void {
    for (const tool of tools) {
      try {
        this.registerTool(tool, overrides);
      } catch (err) {
        // Skip duplicate registrations gracefully
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes("Duplicate skill")) throw err;
      }
    }
  }

  /**
   * Convert a Claw Machine SkillManifest back to an OpenClaw-compatible tool
   * shape, so Claw Machine skills can be exposed to OpenClaw's routing layer.
   */
  toOpenClawTool(skillId: string): AnyAgentToolCompat | null {
    const manifest = this.registry.getManifest(skillId);
    if (!manifest) return null;

    return {
      name: manifest.id,
      description: manifest.description,
      inputSchema: {
        type: "object",
        properties: {
          input: { type: "string", description: "Natural language instruction for this skill" },
          walletAddress: { type: "string", description: "Optional wallet address for on-chain skills" },
        },
        required: ["input"],
      },
      execute: async (_toolCallId: string, params: unknown) => {
        const p = (params ?? {}) as Record<string, unknown>;
        const result = await this.registry.execute(skillId, p);
        return {
          type: "tool_result" as const,
          content: typeof result.output === "string" ? result.output : JSON.stringify(result),
          isError: false,
        };
      },
    };
  }

  /**
   * Export all registered skills as OpenClaw-compatible tools.
   * Useful for feeding the full skill set into an OpenClaw agent's tool list.
   */
  exportAllAsOpenClawTools(): AnyAgentToolCompat[] {
    return this.registry
      .list()
      .filter((m) => m.enabled)
      .map((m) => this.toOpenClawTool(m.id))
      .filter((t): t is AnyAgentToolCompat => t !== null);
  }
}

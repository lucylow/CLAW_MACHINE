import type { AgentRuntimeLike, FrameworkContext, FrameworkPlugin, FrameworkStorageLike } from "../types.js";

export interface ZeroGPluginOptions {
  storage?: FrameworkStorageLike;
  compute?: {
    generate(
      prompt: string,
      opts?: {
        temperature?: number;
        maxTokens?: number;
        json?: boolean;
        systemPrompt?: string;
        modelHint?: string;
      }
    ): Promise<{ text: string; confidence?: number; model?: string; raw?: unknown }>;
  };
  mode?: "mock" | "default" | "production" | "hybrid";
}

export function zeroGPlugin(opts: ZeroGPluginOptions): FrameworkPlugin {
  return {
    manifest: {
      id: "zero-g",
      name: "0G Plugin",
      version: "1.0.0",
      description: "Framework plugin for 0G storage and compute services",
      capabilities: ["storage", "compute", "reflection", "memory"],
      tags: ["0g", "storage", "compute"],
    },
    async setup(runtime: AgentRuntimeLike, ctx: FrameworkContext) {
      if (!opts.storage) return;
      await opts.storage.put(
        `framework/${runtime.id ?? "agent"}/boot.json`,
        {
          agentId: runtime.id,
          agentName: runtime.name,
          sessionId: ctx.sessionId,
          startedAt: Date.now(),
          mode: opts.mode ?? "hybrid",
        },
        {
          contentType: "application/json",
          compress: true,
          metadata: { kind: "framework_boot" },
        }
      );
    },
    async teardown(runtime: AgentRuntimeLike, ctx: FrameworkContext) {
      if (!opts.storage) return;
      await opts.storage.put(
        `framework/${runtime.id ?? "agent"}/shutdown.json`,
        {
          agentId: runtime.id,
          agentName: runtime.name,
          sessionId: ctx.sessionId,
          endedAt: Date.now(),
        },
        {
          contentType: "application/json",
          compress: true,
          metadata: { kind: "framework_shutdown" },
        }
      );
    },
  };
}

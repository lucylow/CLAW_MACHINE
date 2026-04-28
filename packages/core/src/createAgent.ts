/**
 * createAgent
 *
 * The primary factory function for the @claw/core framework.
 * Wires together adapters, plugins, skills, and the runtime into
 * a fully initialized AgentInstance.
 *
 * Prefer using AgentBuilder for a more ergonomic API.
 */

import { randomUUID } from "crypto";
import type {
  AgentConfig,
  AgentInstance,
  AgentTurnInput,
  AgentTurnResult,
  ComputeAdapter,
  StorageAdapter,
  MemoryAdapter,
  MemoryRecord,
  SkillManifest,
  SkillId,
  Plan,
  WalletAddress,
  TurnContext,
  TurnTraceEntry,
} from "./types.js";
import { PluginManager } from "./PluginManager.js";
import { MockComputeAdapter } from "./adapters/MockComputeAdapter.js";
import { InMemoryStorageAdapter } from "./adapters/InMemoryStorageAdapter.js";
import { InMemoryMemoryAdapter } from "./adapters/InMemoryMemoryAdapter.js";
import { SkillRunner } from "./SkillRunner.js";
import { PlanExecutor } from "./PlanExecutor.js";

export async function createAgent(config: AgentConfig): Promise<AgentInstance> {
  const compute: ComputeAdapter = config.compute ?? new MockComputeAdapter();
  const storage: StorageAdapter = config.storage ?? new InMemoryStorageAdapter();
  const memory: MemoryAdapter  = config.memory  ?? new InMemoryMemoryAdapter();

  const plugins = new PluginManager();
  if (config.plugins) plugins.registerAll(config.plugins);

  // Register skills from plugins first, then explicit skills
  const skillRunner = new SkillRunner({ compute, storage, memory });
  for (const plugin of plugins.list()) {
    for (const skill of plugin.skills ?? []) {
      skillRunner.register(skill);
    }
  }
  for (const skill of config.skills ?? []) {
    skillRunner.register(skill);
  }

  const planExecutor = new PlanExecutor({
    compute,
    skillRunner,
    maxParallelism: config.maxPlanParallelism ?? 3,
  });

  // Pruning interval
  let pruneTimer: ReturnType<typeof setInterval> | null = null;
  if (config.enablePruning) {
    const intervalMs = config.pruningIntervalMs ?? 300_000;
    pruneTimer = setInterval(async () => {
      try {
        const stats = await memory.stats();
        if (stats.total > 500) {
          // Summarize oldest low-importance records
          const old = await memory.search({ minImportance: 0, limit: 50 });
          const toRemove = old
            .filter((r) => !r.record.pinned && r.record.importance < 0.3)
            .slice(0, 20);
          for (const { record } of toRemove) {
            await memory.delete(record.id);
          }
        }
      } catch {
        // Pruning failures are non-fatal
      }
    }, intervalMs);
  }

  const instance: AgentInstance = {
    memory,
    compute,
    storage,

    async run(input: AgentTurnInput): Promise<AgentTurnResult> {
      const requestId = input.requestId ?? randomUUID();
      const startedAt = Date.now();
      const ctx: TurnContext = {
        requestId,
        walletAddress: input.walletAddress,
        sessionId: input.sessionId,
        startedAt,
      };
      const trace: TurnTraceEntry[] = [];

      // Plugin: before turn
      let processedInput = await plugins.runOnBeforeTurn(input, ctx);

      // Build messages
      const systemPrompt = config.systemPrompt ?? "You are a helpful AI agent.";
      const memoryContext = await (async () => {
        try {
          const t0 = Date.now();
          const results = await memory.search({
            text: processedInput.message,
            limit: 5,
            walletAddress: processedInput.walletAddress,
          });
          trace.push({ phase: "memory.retrieve", label: "Memory retrieval", durationMs: Date.now() - t0, ok: true });
          if (results.length === 0) return "";
          return "\n\nRelevant context from memory:\n" +
            results.map((r) => `- [${r.record.type}] ${r.record.content}`).join("\n");
        } catch {
          return "";
        }
      })();

      // Skill selection
      let selectedSkill: SkillId | undefined;
      const availableSkills = skillRunner.listEnabled();
      if (availableSkills.length > 0) {
        try {
          const t0 = Date.now();
          const skillList = availableSkills
            .map((s) => `${s.id}: ${s.description}`)
            .join("\n");
          const selResp = await compute.complete({
            messages: [
              { role: "system", content: `You are a skill selector. Given a user message, return ONLY the skill id that best matches, or "none" if no skill applies.\n\nAvailable skills:\n${skillList}` },
              { role: "user", content: processedInput.message },
            ],
            temperature: 0,
            maxTokens: 20,
          });
          const chosen = selResp.content.trim().toLowerCase();
          if (chosen !== "none" && skillRunner.has(chosen)) {
            selectedSkill = chosen;
          }
          trace.push({ phase: "skill.select", label: `Skill selected: ${selectedSkill ?? "none"}`, durationMs: Date.now() - t0, ok: true });
        } catch {
          // Skill selection failure is non-fatal
        }
      }

      // Execute skill or LLM
      let output = "";
      let txHash: `0x${string}` | undefined;
      if (selectedSkill) {
        try {
          const t0 = Date.now();
          const skillResult = await skillRunner.execute(selectedSkill, {
            input: processedInput.message,
            walletAddress: processedInput.walletAddress,
            context: processedInput.context,
          }, ctx);
          output = typeof skillResult.output === "string"
            ? skillResult.output
            : JSON.stringify(skillResult, null, 2);
          txHash = skillResult.txHash as `0x${string}` | undefined;
          trace.push({ phase: "skill.execute", label: `Skill executed: ${selectedSkill}`, durationMs: Date.now() - t0, ok: true });
          await plugins.runOnSkillExecute(selectedSkill, { input: processedInput.message }, skillResult);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          trace.push({ phase: "skill.execute", label: `Skill failed: ${selectedSkill}`, durationMs: 0, ok: false, detail: msg });
          selectedSkill = undefined;
        }
      }

      if (!output) {
        try {
          const t0 = Date.now();
          const resp = await compute.complete({
            messages: [
              { role: "system", content: systemPrompt + memoryContext },
              { role: "user", content: processedInput.message },
            ],
          });
          output = resp.content;
          trace.push({ phase: "llm.complete", label: "LLM completion", durationMs: Date.now() - t0, ok: true });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          output = `I encountered an error: ${msg}`;
          trace.push({ phase: "llm.complete", label: "LLM failed", durationMs: 0, ok: false, detail: msg });
          await plugins.runOnError(err instanceof Error ? err : new Error(msg), "llm.complete");
        }
      }

      // Save turn to memory
      const memoryIds: string[] = [];
      try {
        const userRecord = await memory.save({
          type: "conversation_turn",
          content: `User: ${processedInput.message}`,
          walletAddress: processedInput.walletAddress,
          sessionId: processedInput.sessionId,
          importance: 0.5,
          tags: ["conversation"],
          pinned: false,
        });
        const agentRecord = await memory.save({
          type: "conversation_turn",
          content: `Agent: ${output}`,
          walletAddress: processedInput.walletAddress,
          sessionId: processedInput.sessionId,
          importance: 0.5,
          tags: ["conversation"],
          pinned: false,
        });
        memoryIds.push(userRecord.id, agentRecord.id);
      } catch { /* non-fatal */ }

      // Reflection
      let reflectionId: string | undefined;
      if (config.enableReflection) {
        const failed = trace.some((t) => !t.ok);
        if (failed) {
          try {
            const failedPhases = trace.filter((t) => !t.ok).map((t) => t.phase).join(", ");
            const reflResp = await compute.complete({
              messages: [
                { role: "system", content: "Generate a structured JSON reflection with fields: rootCause, correctiveAdvice, severity (info|warning|error), tags (string[]). Return only valid JSON." },
                { role: "user", content: `Turn failed in phases: ${failedPhases}\nUser message: ${processedInput.message}` },
              ],
              temperature: 0.2,
            });
            const reflection = await memory.save({
              type: "reflection",
              content: reflResp.content,
              walletAddress: processedInput.walletAddress,
              importance: 0.8,
              tags: ["reflection", "failure"],
              pinned: false,
            });
            reflectionId = reflection.id;
          } catch { /* non-fatal */ }
        }
      }

      const result: AgentTurnResult = {
        output,
        selectedSkill,
        txHash,
        trace,
        memoryIds,
        reflectionId,
        requestId,
        durationMs: Date.now() - startedAt,
      };

      // Plugin: after turn
      const finalResult = await plugins.runOnAfterTurn(result, ctx);
      return finalResult;
    },

    async plan(goal: string, walletAddress?: WalletAddress): Promise<Plan> {
      return planExecutor.execute(goal, walletAddress);
    },

    listSkills(): SkillManifest[] {
      return skillRunner.list();
    },

    setSkillEnabled(id: SkillId, enabled: boolean): void {
      skillRunner.setEnabled(id, enabled);
    },

    emit(event: string, payload?: unknown): void {
      // Lightweight event emission — plugins can subscribe via onAgentInit
      if (process.env.CLAW_DEBUG) {
        console.debug(`[claw:event] ${event}`, payload ?? "");
      }
    },

    async destroy(): Promise<void> {
      if (pruneTimer) clearInterval(pruneTimer);
      await plugins.runOnAgentDestroy(instance);
    },
  };

  // Initialize plugins
  await plugins.runOnAgentInit(instance);

  return instance;
}

/**
 * @claw/core
 *
 * Public API for the CLAW_MACHINE self-improving agent framework.
 *
 * @example
 * ```ts
 * import { AgentBuilder, defineSkill, definePlugin } from "@claw/core";
 *
 * const agent = await new AgentBuilder()
 *   .setName("MyAgent")
 *   .skill(mySkill)
 *   .use(myPlugin)
 *   .build();
 *
 * const result = await agent.run({ message: "Hello!" });
 * ```
 */

// ── Core factory functions ────────────────────────────────────────────────────
export { createAgent } from "./createAgent.js";
export { AgentBuilder } from "./AgentBuilder.js";
export { defineSkill, defineWalletSkill } from "./defineSkill.js";
export { definePlugin } from "./definePlugin.js";

// ── Internal classes (advanced use) ──────────────────────────────────────────
export { PluginManager } from "./PluginManager.js";
export { SkillRunner } from "./SkillRunner.js";
export { PlanExecutor } from "./PlanExecutor.js";

// ── Built-in adapters ─────────────────────────────────────────────────────────
export { MockComputeAdapter } from "./adapters/MockComputeAdapter.js";
export { InMemoryStorageAdapter } from "./adapters/InMemoryStorageAdapter.js";
export { InMemoryMemoryAdapter } from "./adapters/InMemoryMemoryAdapter.js";

// ── All public types ──────────────────────────────────────────────────────────
export type {
  // Primitives
  WalletAddress,
  TxHash,
  ContentHash,
  SkillId,
  PluginId,
  MemoryId,
  RequestId,
  PlanId,

  // LLM / Compute
  LLMMessage,
  LLMRequest,
  LLMResponse,
  EmbeddingRequest,
  EmbeddingResponse,

  // Storage
  StorageTier,
  StorageWriteOptions,
  StorageReadResult,

  // Memory
  MemoryType,
  MemorySeverity,
  MemoryRecord,
  MemorySearchQuery,
  MemorySearchResult,
  MemoryStats,

  // Skills
  SkillManifest,
  SkillExecutor,
  SkillContext,
  SkillDefinition,
  SkillDef,

  // Plugins
  PluginHooks,
  PluginDefinition,
  PluginDef,

  // Adapters
  ComputeAdapter,
  StorageAdapter,
  MemoryAdapter,

  // Agent turn
  AgentTurnInput,
  AgentTurnResult,
  TurnTraceEntry,
  TurnContext,

  // Plan
  PlanStatus,
  TaskStatus,
  PlanTask,
  Plan,

  // Agent
  AgentInstance,
  AgentConfig,
} from "./types.js";

/** Framework version */
export const VERSION = "0.1.0";

// ── v6: Multi-modal processing ────────────────────────────────────────────
export { MultiModalProcessor } from "./multimodal/MultiModalProcessor.js";
export type {
  MultiModalInput,
  ImageInput,
  AudioInput,
  ProcessedInput,
  ModalityType,
} from "./multimodal/MultiModalProcessor.js";
export * from "./multimodal/index.js";

// ── v6: Agent-to-agent messaging ──────────────────────────────────────────
export { AgentBus } from "./agentbus/AgentBus.js";
export type {
  AgentMessage,
  MessageType,
  SendOptions,
  AgentBusConfig,
} from "./agentbus/AgentBus.js";

// ── v6: Self-evolving skill engine ────────────────────────────────────────
export { SkillEvolutionEngine } from "./evolution/SkillEvolutionEngine.js";
export type {
  EvolutionRequest,
  EvolutionResult,
  EvolvedSkillRecord,
} from "./evolution/SkillEvolutionEngine.js";
export * as evolution from "./evolution/index.js";

/** Framework version */
export const FRAMEWORK_VERSION = "0.6.0";

// ── v6: Framework runtime layer ─────────────────────────────────────────────
export * as framework from "./framework/index.js";

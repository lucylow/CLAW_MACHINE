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
export type { BuilderValidationResult, BuilderDescriptor } from "./AgentBuilder.js";
export type { BuilderValidationResult, BuilderDescriptor } from "./AgentBuilder.js";
export { defineSkill, defineWalletSkill } from "./defineSkill.js";
export { definePlugin } from "./definePlugin.js";

// ── Internal classes (advanced use) ──────────────────────────────────────────
export { PluginManager } from "./PluginManager.js";
export type { PluginManagerLogger, PluginDescriptor } from "./PluginManager.js";
export type { PluginManagerLogger, PluginDescriptor } from "./PluginManager.js";
export { SkillRunner } from "./SkillRunner.js";
export type { SkillStats } from "./SkillRunner.js";
export type { SkillStats } from "./SkillRunner.js";
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

/** OpenClaw-aligned manifest discovery, slots, validation, CLI helpers */
export * as openclawPlugins from "./openclaw-plugins/index.js";

// ── Episode + reflection memory (durable failure → reflection → recall) ─────
export type {
  MemoryTier,
  AgentEpisode,
  ReflectionRecord,
  MemoryQuery,
  MemoryRecallResult,
  MemoryWriteResult,
} from "./memory/types.js";
export type { MemoryProvider } from "./memory/provider.js";
export { MemoryOrchestrator } from "./memory/orchestrator.js";
export type { PrunePolicy } from "./memory/pruner.js";
export { MemoryPruner } from "./memory/pruner.js";
export { MemoryHealthMonitor } from "./memory/health.js";
export { SimpleVectorIndex } from "./memory/vector-index.js";
export type { IndexedItem } from "./memory/vector-index.js";
export { VectorIndex } from "./memory/vector/index.js";
export { PrunerWorker } from "./memory/worker/pruner.js";

export type { ReflectionPromptInput, ReflectionOutput } from "./reflection/schema.js";
export type { LlmClient } from "./reflection/engine.js";
export { ReflectionEngine } from "./reflection/engine.js";

export { ZeroGClient } from "./adapters/zero-g/client.js";
export type { ZeroGClientConfig } from "./adapters/zero-g/client.js";
export { ZeroGAuth } from "./adapters/zero-g/auth.js";
export { ZeroGComputeAdapter } from "./adapters/zero-g/compute.js";
export type { ZeroGComputeAdapterConfig } from "./adapters/zero-g/compute.js";
export { ZeroGStorageAdapter } from "./adapters/zero-g/storage.js";
export type { ZeroGClientLike } from "./adapters/zero-g/memory-adapter.js";
export { ZeroGMemoryAdapter } from "./adapters/zero-g/memory-adapter.js";
export { InMemoryMemoryProvider } from "./adapters/mock/in-memory-memory.js";

export type { TraceEvent } from "./session/tracer.js";
export { SessionTracer } from "./session/tracer.js";

export { AgentRuntime } from "./agent/runtime.js";
export type { AgentRuntimeDeps } from "./agent/runtime.js";
export { LessonInjector } from "./agent/lesson-injector.js";

export type { OpenClawLikeAgent } from "./integration/openclaw-hook.js";
export { wrapOpenClawAgent } from "./integration/openclaw-hook.js";

export type { AppConfig } from "./config.js";
export { loadConfig } from "./config.js";

/**
 * @claw/core — Public Type Definitions
 *
 * All types exported from this file form the stable public API surface
 * of the CLAW_MACHINE framework. Downstream plugins and skills should
 * import exclusively from here rather than from internal modules.
 */

// ── Primitive scalars ─────────────────────────────────────────────────────────

export type WalletAddress = `0x${string}`;
export type TxHash = `0x${string}`;
export type ContentHash = string;          // SHA-256 hex or 0G root hash
export type SkillId = string;
export type PluginId = string;
export type MemoryId = string;
export type RequestId = string;
export type PlanId = string;

// ── LLM / Compute ─────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  /** Present when inference ran inside a TEE */
  teeProof?: string;
}

export interface EmbeddingRequest {
  texts: string[];
  model?: string;
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
}

// ── Storage ───────────────────────────────────────────────────────────────────

export type StorageTier = "hot" | "warm" | "cold";

export interface StorageWriteOptions {
  tier?: StorageTier;
  ttlSeconds?: number;
  tags?: string[];
}

export interface StorageReadResult<T = unknown> {
  data: T;
  hash: ContentHash;
  tier: StorageTier;
  retrievedAt: number;
}

// ── Memory ────────────────────────────────────────────────────────────────────

export type MemoryType =
  | "session_state"
  | "conversation_turn"
  | "task_result"
  | "reflection"
  | "skill_execution"
  | "wallet_profile"
  | "artifact"
  | "error_event"
  | "summary";

export type MemorySeverity = "info" | "warning" | "error" | "critical";

export interface MemoryRecord {
  id: MemoryId;
  type: MemoryType;
  content: string;
  walletAddress?: WalletAddress;
  sessionId?: string;
  importance: number;           // 0–1
  embedding?: number[];
  tags: string[];
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchQuery {
  text?: string;
  types?: MemoryType[];
  walletAddress?: WalletAddress;
  minImportance?: number;
  limit?: number;
  tags?: string[];
}

export interface MemorySearchResult {
  record: MemoryRecord;
  score: number;
}

// ── Skills ────────────────────────────────────────────────────────────────────

export interface SkillManifest {
  id: SkillId;
  name: string;
  description: string;
  version?: string;
  tags: string[];
  requiresWallet: boolean;
  touchesChain: boolean;
  usesCompute: boolean;
  usesStorage: boolean;
  enabled: boolean;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface SkillExecutor {
  execute(
    input: Record<string, unknown>,
    ctx: SkillContext,
  ): Promise<Record<string, unknown>>;
}

export interface SkillContext {
  walletAddress?: WalletAddress;
  requestId: RequestId;
  memory: MemoryAdapter;
  compute: ComputeAdapter;
  storage: StorageAdapter;
  emit: (event: string, payload?: unknown) => void;
}

export interface SkillDefinition {
  manifest: Omit<SkillManifest, "enabled">;
  execute(
    input: Record<string, unknown>,
    ctx: SkillContext,
  ): Promise<Record<string, unknown>>;
}

// ── Plugins ───────────────────────────────────────────────────────────────────

export interface PluginHooks {
  /** Called once when the agent is fully initialized */
  onAgentInit?(agent: AgentInstance): Promise<void> | void;
  /** Called before every agent turn; can mutate input */
  onBeforeTurn?(input: AgentTurnInput, ctx: TurnContext): Promise<AgentTurnInput> | AgentTurnInput;
  /** Called after every agent turn; can mutate result */
  onAfterTurn?(result: AgentTurnResult, ctx: TurnContext): Promise<AgentTurnResult> | AgentTurnResult;
  /** Called before a memory record is persisted */
  onMemorySave?(record: MemoryRecord): Promise<MemoryRecord> | MemoryRecord;
  /** Called after a skill executes successfully */
  onSkillExecute?(skillId: SkillId, input: Record<string, unknown>, output: Record<string, unknown>): Promise<void> | void;
  /** Called when an error occurs in any phase */
  onError?(error: Error, phase: string): Promise<void> | void;
  /** Called on agent shutdown */
  onAgentDestroy?(agent: AgentInstance): Promise<void> | void;
}

export interface PluginDefinition {
  id: PluginId;
  name: string;
  version: string;
  description?: string;
  hooks: PluginHooks;
  /** Skills automatically registered when this plugin is loaded */
  skills?: SkillDefinition[];
}

// ── Adapters (interfaces that plugins/adapters must implement) ─────────────────

export interface ComputeAdapter {
  complete(request: LLMRequest): Promise<LLMResponse>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  isAvailable(): boolean;
  mode: "production" | "mock";
}

export interface StorageAdapter {
  write<T>(key: string, value: T, options?: StorageWriteOptions): Promise<ContentHash>;
  read<T>(key: string): Promise<StorageReadResult<T> | null>;
  append(streamId: string, entry: unknown): Promise<void>;
  readLog(streamId: string, limit?: number): Promise<unknown[]>;
  isAvailable(): boolean;
  mode: "production" | "mock";
}

export interface MemoryAdapter {
  save(record: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">): Promise<MemoryRecord>;
  search(query: MemorySearchQuery): Promise<MemorySearchResult[]>;
  get(id: MemoryId): Promise<MemoryRecord | null>;
  pin(id: MemoryId): Promise<void>;
  delete(id: MemoryId): Promise<void>;
  stats(): Promise<MemoryStats>;
}

export interface MemoryStats {
  total: number;
  byType: Partial<Record<MemoryType, number>>;
  pinned: number;
  avgImportance: number;
}

// ── Agent turn ────────────────────────────────────────────────────────────────

export interface AgentTurnInput {
  message: string;
  walletAddress?: WalletAddress;
  sessionId?: string;
  requestId?: RequestId;
  context?: Record<string, unknown>;
}

export interface AgentTurnResult {
  output: string;
  selectedSkill?: SkillId;
  txHash?: TxHash;
  trace: TurnTraceEntry[];
  memoryIds: MemoryId[];
  reflectionId?: MemoryId;
  requestId: RequestId;
  durationMs: number;
}

export interface TurnTraceEntry {
  phase: string;
  label: string;
  durationMs: number;
  ok: boolean;
  detail?: string;
}

export interface TurnContext {
  requestId: RequestId;
  walletAddress?: WalletAddress;
  sessionId?: string;
  startedAt: number;
}

// ── Plan ──────────────────────────────────────────────────────────────────────

export type PlanStatus = "pending" | "running" | "completed" | "failed";
export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PlanTask {
  id: string;
  goal: string;
  dependsOn: string[];
  status: TaskStatus;
  skillHint?: SkillId;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface Plan {
  id: PlanId;
  goal: string;
  tasks: PlanTask[];
  status: PlanStatus;
  synthesisResult?: string;
  walletAddress?: WalletAddress;
  createdAt: number;
  completedAt?: number;
  schemaVersion: "1.0";
}

// ── Agent instance (public surface) ──────────────────────────────────────────

export interface AgentInstance {
  /** Run a single conversational turn */
  run(input: AgentTurnInput): Promise<AgentTurnResult>;
  /** Create and execute a hierarchical plan */
  plan(goal: string, walletAddress?: WalletAddress): Promise<Plan>;
  /** Access the memory adapter */
  readonly memory: MemoryAdapter;
  /** Access the compute adapter */
  readonly compute: ComputeAdapter;
  /** Access the storage adapter */
  readonly storage: StorageAdapter;
  /** List all registered skills */
  listSkills(): SkillManifest[];
  /** Enable or disable a skill at runtime */
  setSkillEnabled(id: SkillId, enabled: boolean): void;
  /** Emit a framework event */
  emit(event: string, payload?: unknown): void;
  /** Gracefully shut down the agent */
  destroy(): Promise<void>;
}

// ── Agent config ──────────────────────────────────────────────────────────────

export interface AgentConfig {
  /** Human-readable agent name */
  name: string;
  /** System prompt injected before every turn */
  systemPrompt?: string;
  /** Compute adapter — defaults to mock */
  compute?: ComputeAdapter;
  /** Storage adapter — defaults to in-memory */
  storage?: StorageAdapter;
  /** Memory adapter — defaults to in-process store */
  memory?: MemoryAdapter;
  /** Plugins to load (order matters for hook execution) */
  plugins?: PluginDefinition[];
  /** Skills to register at startup */
  skills?: SkillDefinition[];
  /** Maximum parallel tasks in hierarchical planner */
  maxPlanParallelism?: number;
  /** Per-turn execution timeout in ms. Turns exceeding this limit throw a TimeoutError. */
  turnTimeoutMs?: number;
  /** Searchable tags for the on-chain skill registry. */
  tags?: string[];
  /** Per-turn execution timeout in ms. Turns exceeding this limit throw a TimeoutError. */
  turnTimeoutMs?: number;
  /** Searchable tags for the on-chain skill registry. */
  tags?: string[];
  /** Enable reflection loop after each turn */
  enableReflection?: boolean;
  /** Enable memory pruning */
  enablePruning?: boolean;
  /** Pruning interval in ms (default: 300_000) */
  pruningIntervalMs?: number;
}

// ── Framework factory functions ───────────────────────────────────────────────

/** Convenience type for defineSkill return value */
export type SkillDef = SkillDefinition;
/** Convenience type for definePlugin return value */
export type PluginDef = PluginDefinition;

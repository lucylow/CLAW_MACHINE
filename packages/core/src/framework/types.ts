export type FrameworkMode = "mock" | "default" | "production" | "hybrid";
export type AgentRunMode = "chat" | "task" | "tool" | "plan" | "reflect" | "batch";

export type SkillKind =
  | "analysis"
  | "execution"
  | "memory"
  | "reflection"
  | "storage"
  | "wallet"
  | "planner"
  | "safety"
  | "multimodal"
  | "message_bus"
  | "general";

export type AgentStatus = "idle" | "running" | "paused" | "failed" | "stopped";

export type HookPhase =
  | "beforeBuild"
  | "afterBuild"
  | "beforeRun"
  | "afterRun"
  | "beforeSkill"
  | "afterSkill"
  | "beforeReflect"
  | "afterReflect"
  | "beforePersist"
  | "afterPersist"
  | "error";

export interface FrameworkContext {
  requestId: string;
  sessionId: string;
  walletAddress?: string;
  runMode: AgentRunMode;
  frameworkMode: FrameworkMode;
  timestamp: number;
  userInput?: string;
  metadata?: Record<string, unknown>;
}

export interface FrameworkEvent<T = unknown> {
  id: string;
  type: string;
  phase?: HookPhase;
  sessionId?: string;
  requestId?: string;
  createdAt: number;
  payload?: T;
  tags?: string[];
}

export interface AgentMessage<T = unknown> {
  id: string;
  topic: string;
  sessionId: string;
  requestId?: string;
  from: string;
  to?: string;
  createdAt: number;
  payload: T;
  tags?: string[];
  replyTo?: string;
  correlationId?: string;
  priority?: "low" | "normal" | "high" | "critical";
  status?: "queued" | "delivered" | "acked" | "failed";
}

export interface SkillExecutionContext {
  requestId: string;
  sessionId: string;
  walletAddress?: string;
  input: string;
  normalizedInput?: string;
  userInput?: string;
  systemPrompt?: string;
  runMode?: AgentRunMode;
  frameworkMode?: FrameworkMode;
  metadata?: Record<string, unknown>;
  trace?: FrameworkEvent[];
  memoryHits?: Array<{
    id: string;
    kind?: string;
    title?: string;
    summary?: string;
    tags?: string[];
    importance?: number;
    metadata?: Record<string, unknown>;
  }>;
  bus?: AgentBusLike;
  runtime?: AgentRuntimeLike;
}

export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  kind?: SkillKind;
  tags?: string[];
  version?: string;
  enabled?: boolean;
  source?: string;
  canHandle?(input: string, ctx: SkillExecutionContext): Promise<number> | number;
  run(ctx: SkillExecutionContext): Promise<unknown> | unknown;
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  capabilities: string[];
  tags?: string[];
  author?: string;
  homepage?: string;
  repository?: string;
}

export interface FrameworkPlugin {
  manifest: PluginManifest;
  setup?(runtime: AgentRuntimeLike, ctx: FrameworkContext): Promise<void> | void;
  teardown?(runtime: AgentRuntimeLike, ctx: FrameworkContext): Promise<void> | void;
  middleware?: FrameworkMiddleware[];
}

export interface FrameworkMiddlewareArgs {
  runtime: AgentRuntimeLike;
  ctx: FrameworkContext;
  input?: unknown;
  output?: unknown;
  error?: unknown;
  event?: FrameworkEvent;
}

export type FrameworkMiddleware = (
  phase: HookPhase,
  args: FrameworkMiddlewareArgs
) => Promise<void> | void;

export interface AgentRunInput {
  sessionId: string;
  walletAddress?: string;
  message: string;
  runMode?: AgentRunMode;
  metadata?: Record<string, unknown>;
  attachments?: Array<{
    id: string;
    kind: "image" | "audio" | "video" | "text" | "blob";
    mimeType?: string;
    filename?: string;
    data?: unknown;
    metadata?: Record<string, unknown>;
  }>;
}

export interface AgentRunResult {
  ok: boolean;
  requestId: string;
  sessionId: string;
  output: string;
  status: AgentStatus;
  trace: FrameworkEvent[];
  memoryIds: string[];
  skillResults: Array<{
    skillId: string;
    status: "passed" | "failed" | "skipped";
    score: number;
    output?: unknown;
    error?: string;
  }>;
  reflection?: unknown;
  metadata?: Record<string, unknown>;
}

export interface AgentManifest {
  id: string;
  name: string;
  systemPrompt: string;
  version: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  skills: SkillDefinition[];
  plugins: PluginManifest[];
  settings: Record<string, unknown>;
  tags: string[];
}

export interface RuntimeStats {
  sessions: number;
  runs: number;
  activeSkills: number;
  plugins: number;
  errors: number;
  reflections: number;
  memoryWrites: number;
  busMessages: number;
  lastRunAt?: number;
  mode: FrameworkMode;
}

export interface FrameworkStorageLike {
  put(
    key: string,
    value: unknown,
    opts?: {
      contentType?: string;
      compress?: boolean;
      encrypt?: boolean;
      ttlMs?: number;
      metadata?: Record<string, unknown>;
    }
  ): Promise<{
    key: string;
    checksum: string;
    createdAt: number;
    updatedAt: number;
    ttlMs?: number;
    contentType?: string;
    metadata?: Record<string, unknown>;
    bytes: number;
  }>;
  get<T = unknown>(key: string): Promise<T | undefined>;
  list(prefix?: string): Promise<
    Array<{
      key: string;
      checksum: string;
      createdAt: number;
      updatedAt: number;
      ttlMs?: number;
      contentType?: string;
      metadata?: Record<string, unknown>;
      bytes: number;
    }>
  >;
  del(key: string): Promise<boolean>;
}

export interface FrameworkMemoryLike {
  store(record: {
    sessionId: string;
    walletAddress?: string;
    kind: string;
    scope?: "session" | "wallet" | "global";
    title: string;
    summary: string;
    tags?: string[];
    importance?: number;
    pinned?: boolean;
    expiresAt?: number;
    payload: unknown;
    relatedIds?: string[];
    metadata?: Record<string, unknown>;
    searchText?: string;
  }): Promise<unknown> | unknown;
  search?(query: {
    sessionId?: string;
    walletAddress?: string;
    kind?: string;
    tags?: string[];
    q?: string;
    limit?: number;
    pinnedOnly?: boolean;
    minImportance?: number;
  }): Promise<
    Array<{
      id: string;
      kind?: string;
      title?: string;
      summary?: string;
      tags?: string[];
      importance?: number;
      metadata?: Record<string, unknown>;
    }>
  > | Array<{
    id: string;
    kind?: string;
    title?: string;
    summary?: string;
    tags?: string[];
    importance?: number;
    metadata?: Record<string, unknown>;
  }>;
}

export interface AgentBusLike {
  send?<T = unknown>(input: {
    topic: string;
    fromAgent: string;
    toAgent?: string;
    sessionId: string;
    requestId?: string;
    walletAddress?: string;
    priority?: "low" | "normal" | "high" | "critical";
    deliveryMode?: "at_most_once" | "at_least_once" | "exactly_once_best_effort";
    availableAt?: number;
    expiresAt?: number;
    maxAttempts?: number;
    correlationId?: string;
    replyTo?: string;
    dedupeKey?: string;
    tags?: string[];
    payload: T;
    metadata?: Record<string, unknown>;
  }): Promise<AgentMessage<T>> | AgentMessage<T>;
  receive?<T = unknown>(options: {
    topic?: string;
    agent?: string;
    sessionId?: string;
    limit?: number;
    leaseMs?: number;
    includeExpired?: boolean;
    tags?: string[];
  }): Promise<AgentMessage<T>[]> | AgentMessage<T>[];
  ack?(input: {
    id: string;
    agent: string;
    topic?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> | boolean;
  nack?(input: {
    id: string;
    agent: string;
    topic?: string;
    retryDelayMs?: number;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> | boolean;
  stats?(): Promise<Record<string, unknown>> | Record<string, unknown>;
}

export interface AgentRuntimeLike {
  readonly id?: string;
  readonly name?: string;
  readonly status?: AgentStatus;
  skills?: SkillDefinition[];
  plugins?: FrameworkPlugin[];
  readonly memory?: FrameworkMemoryLike;
  readonly storage?: FrameworkStorageLike;
  readonly bus?: AgentBusLike;
  readonly stats?: RuntimeStats;
  registerSkill(skill: SkillDefinition): Promise<void> | void;
  unregisterSkill(skillId: string): Promise<void> | void;
  getSkill(skillId: string): Promise<SkillDefinition | undefined> | SkillDefinition | undefined;
  listSkills(): Promise<SkillDefinition[]> | SkillDefinition[];
}

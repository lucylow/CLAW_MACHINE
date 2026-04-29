export type MultimodalInputKind = "text" | "image" | "audio" | "video" | "mixed";
export type MediaKind = "image" | "audio" | "video" | "text";
export type ProcessingMode = "mock" | "default" | "production" | "hybrid";
export type AgentBusDeliveryMode = "at_most_once" | "at_least_once" | "exactly_once_best_effort";
export type AgentBusMessageStatus = "queued" | "leased" | "acked" | "nacked" | "dead_lettered" | "expired";
export type AgentBusPriority = "critical" | "high" | "normal" | "low";
export type AgentBusTopic = string;

export interface MultimodalAsset {
  id: string;
  kind: MediaKind;
  mimeType: string;
  filename?: string;
  data: ArrayBuffer | Uint8Array | Buffer | string;
  width?: number;
  height?: number;
  durationMs?: number;
  sampleRateHz?: number;
  channels?: number;
  sizeBytes?: number;
  sha256?: string;
  metadata?: Record<string, unknown>;
}

export interface MultimodalInput {
  sessionId: string;
  walletAddress?: string;
  requestId?: string;
  userText?: string;
  assets?: MultimodalAsset[];
  context?: Record<string, unknown>;
  preferredLanguage?: string;
}

export interface MultimodalArtifact {
  id: string;
  kind: MediaKind | "description" | "transcript" | "scene_graph" | "summary";
  title: string;
  summary: string;
  text?: string;
  data?: unknown;
  mimeType?: string;
  sha256?: string;
  sourceAssetIds: string[];
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface MultimodalAnalysisResult {
  requestId: string;
  sessionId: string;
  walletAddress?: string;
  kind: MultimodalInputKind;
  summary: string;
  normalizedText: string;
  descriptions: string[];
  transcript?: string;
  sceneGraph?: Record<string, unknown>;
  confidence: number;
  artifacts: MultimodalArtifact[];
  warnings: string[];
  raw?: unknown;
}

export interface MultimodalPreprocessOptions {
  maxImageChars?: number;
  maxAudioChars?: number;
  maxAssets?: number;
  imageDetailLevel?: "low" | "medium" | "high";
  audioDetailLevel?: "low" | "medium" | "high";
  allowMockFallback?: boolean;
  useStructuredVision?: boolean;
  useStructuredAudio?: boolean;
  cacheTtlMs?: number;
}

export interface MultimodalComputeClient {
  mode?: ProcessingMode;
  generate(
    prompt: string,
    opts?: {
      temperature?: number;
      maxTokens?: number;
      json?: boolean;
      systemPrompt?: string;
      modelHint?: string;
    },
  ): Promise<{
    text: string;
    confidence?: number;
    model?: string;
    tokensUsed?: number;
    raw?: unknown;
  }>;
  summarize?(text: string, opts?: { maxWords?: number }): Promise<string>;
}

export interface MultimodalStorageClient {
  put(
    key: string,
    value: unknown,
    opts?: {
      contentType?: string;
      compress?: boolean;
      encrypt?: boolean;
      ttlMs?: number;
      metadata?: Record<string, unknown>;
    },
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

export interface AgentBusEnvelope<T = unknown> {
  id: string;
  topic: AgentBusTopic;
  fromAgent: string;
  toAgent?: string;
  sessionId: string;
  requestId?: string;
  walletAddress?: string;
  priority: AgentBusPriority;
  deliveryMode: AgentBusDeliveryMode;
  status: AgentBusMessageStatus;
  createdAt: number;
  updatedAt: number;
  availableAt: number;
  expiresAt?: number;
  leaseUntil?: number;
  attempts: number;
  maxAttempts: number;
  correlationId?: string;
  replyTo?: string;
  dedupeKey?: string;
  tags: string[];
  payload: T;
  metadata?: Record<string, unknown>;
}

export interface AgentBusSendInput<T = unknown> {
  topic: AgentBusTopic;
  fromAgent: string;
  toAgent?: string;
  sessionId: string;
  requestId?: string;
  walletAddress?: string;
  priority?: AgentBusPriority;
  deliveryMode?: AgentBusDeliveryMode;
  availableAt?: number;
  expiresAt?: number;
  maxAttempts?: number;
  correlationId?: string;
  replyTo?: string;
  dedupeKey?: string;
  tags?: string[];
  payload: T;
  metadata?: Record<string, unknown>;
}

export interface AgentBusReceiveOptions {
  topic?: AgentBusTopic;
  agent?: string;
  sessionId?: string;
  limit?: number;
  leaseMs?: number;
  includeExpired?: boolean;
  tags?: string[];
}

export interface AgentBusListOptions {
  topic?: AgentBusTopic;
  agent?: string;
  sessionId?: string;
  status?: AgentBusMessageStatus;
  limit?: number;
  offset?: number;
  tags?: string[];
}

export interface AgentBusAckInput {
  id: string;
  agent: string;
  topic?: AgentBusTopic;
  metadata?: Record<string, unknown>;
}

export interface AgentBusNackInput {
  id: string;
  agent: string;
  topic?: AgentBusTopic;
  retryDelayMs?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentBusStats {
  topics: number;
  messages: number;
  queued: number;
  leased: number;
  acked: number;
  nacked: number;
  deadLettered: number;
  expired: number;
  deduped: number;
  byTopic: Record<string, number>;
  lastUpdatedAt?: number;
}

export interface AgentBusSnapshot {
  version: string;
  createdAt: number;
  updatedAt: number;
  messages: AgentBusEnvelope[];
  stats: AgentBusStats;
}

export interface MultimodalProcessContext {
  sessionId: string;
  walletAddress?: string;
  requestId: string;
  userText?: string;
  normalizedText?: string;
  descriptions: string[];
  transcript?: string;
  summary?: string;
  assets: MultimodalAsset[];
  artifacts: MultimodalArtifact[];
  context?: Record<string, unknown>;
}

export interface ReasoningLoopResult {
  ok: boolean;
  sessionId: string;
  requestId: string;
  answer: string;
  reflection?: unknown;
  multimodal: MultimodalAnalysisResult;
  busMessages?: AgentBusEnvelope[];
  warnings: string[];
}

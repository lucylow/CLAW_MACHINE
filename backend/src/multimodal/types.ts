/**
 * Multimodal reasoning types — shared contracts for 0G Compute, memory, and API layers.
 */

export type MultimodalInputKind = "image" | "audio" | "text" | "mixed";

export type MultimodalTaskType =
  | "describe"
  | "transcribe"
  | "summarize"
  | "compare"
  | "extract"
  | "classify"
  | "reason"
  | "answer"
  | "debug"
  | "plan"
  | "refine";

export type ReasoningConfidence = "low" | "medium" | "high";

export type EvidenceSource = "user-upload" | "0g-compute" | "memory" | "tool" | "reflection";

export interface MultimodalAsset {
  id: string;
  kind: "image" | "audio";
  mimeType: string;
  filename: string;
  sizeBytes: number;
  sha256: string;
  base64?: string;
  uri?: string;
  durationMs?: number;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
}

export interface MultimodalConversationContext {
  sessionId: string;
  turnId?: string;
  walletAddress?: string | null;
  userId?: string | null;
  requestId?: string | null;
  traceId?: string | null;
  locale?: string;
  timezone?: string;
  appVersion?: string;
}

export interface MultimodalRequest {
  context: MultimodalConversationContext;
  taskType: MultimodalTaskType;
  prompt?: string;
  question?: string;
  text?: string;
  image?: MultimodalAsset | null;
  audio?: MultimodalAsset | null;
  images?: MultimodalAsset[];
  audios?: MultimodalAsset[];
  attachments?: MultimodalAsset[];
  hints?: {
    preferTranscription?: boolean;
    preferDescription?: boolean;
    preferStructuredOutput?: boolean;
    preserveVerbatim?: boolean;
    detectObjects?: boolean;
    detectText?: boolean;
    detectSpeakers?: boolean;
    detectTone?: boolean;
    compareAssets?: boolean;
  };
  outputSchema?: Record<string, unknown>;
}

export interface MultimodalObservation {
  source: EvidenceSource;
  modality: MultimodalInputKind;
  assetId?: string;
  title: string;
  summary: string;
  rawText?: string;
  confidence: number;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface MultimodalFusionPlan {
  intent: MultimodalTaskType;
  modalities: MultimodalInputKind[];
  steps: Array<{
    stepId: string;
    kind: "transcribe" | "describe" | "extract" | "reason" | "fuse" | "answer";
    description: string;
    inputRefs: string[];
    outputRef?: string;
  }>;
  expectedOutput: "text" | "json" | "markdown" | "structured";
  needsReflection: boolean;
}

export interface MultimodalReasoningResult {
  ok: boolean;
  requestId: string;
  sessionId: string;
  turnId: string;
  taskType: MultimodalTaskType;
  summary: string;
  answer: string;
  confidence: ReasoningConfidence;
  observations: MultimodalObservation[];
  assets: MultimodalAsset[];
  plan: MultimodalFusionPlan;
  languageModel?: string;
  computeMode?: "sealed" | "mock" | "fallback";
  outputFormat: "text" | "json" | "markdown" | "structured";
  structuredOutput?: Record<string, unknown> | null;
  warnings: string[];
  reflection?: MultimodalReflection | null;
  memoryRefs: string[];
  toolRefs: string[];
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    audioSeconds?: number;
    imageCount?: number;
  };
  error?: MultimodalErrorShape | null;
}

export interface MultimodalReflection {
  reflectionId: string;
  sourceTurnId: string;
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  nextBestAction: string;
  severity: "low" | "medium" | "high";
  tags: string[];
  createdAt: string;
}

export interface MultimodalErrorShape {
  code: string;
  message: string;
  category:
    | "validation"
    | "storage"
    | "compute"
    | "multimodal"
    | "reflection"
    | "parse"
    | "security"
    | "internal";
  recoverable: boolean;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface ZeroGMultimodalAnalysisResponse {
  text: string;
  model?: string;
  requestId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    audioSeconds?: number;
    imageCount?: number;
  };
  structured?: Record<string, unknown> | null;
  warnings?: string[];
}

export interface ZeroGComputeMultimodalClient {
  analyzeImage(input: {
    prompt: string;
    image: MultimodalAsset;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse>;

  analyzeAudio(input: {
    prompt: string;
    audio: MultimodalAsset;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse>;

  fuse(input: {
    prompt: string;
    observations: MultimodalObservation[];
    question?: string;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse>;

  reflect(input: {
    prompt: string;
    answer: string;
    observations: MultimodalObservation[];
    request: MultimodalRequest;
    context: MultimodalConversationContext;
  }): Promise<MultimodalReflection>;
}

export interface MultimodalMemoryStore {
  saveObservation(input: {
    sessionId: string;
    turnId: string;
    requestId?: string | null;
    observation: MultimodalObservation;
  }): Promise<string>;

  saveTurn(input: {
    sessionId: string;
    turnId: string;
    requestId?: string | null;
    taskType: MultimodalTaskType;
    summary: string;
    answer: string;
    assets: MultimodalAsset[];
    observations: MultimodalObservation[];
    reflection?: MultimodalReflection | null;
    warnings?: string[];
  }): Promise<string>;

  saveReflection(input: {
    sessionId: string;
    turnId: string;
    requestId?: string | null;
    reflection: MultimodalReflection;
  }): Promise<string>;

  searchSimilar(input: {
    sessionId: string;
    query: string;
    limit?: number;
  }): Promise<Array<{ id: string; text: string; kind: string; score: number }>>;
}

export interface MultimodalAgentEventBus {
  emit(eventName: string, payload: Record<string, unknown>): void;
}

export type MultimodalLogger = {
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
};

export interface MultimodalPipelineOptions {
  compute: ZeroGComputeMultimodalClient;
  memory: MultimodalMemoryStore;
  events?: MultimodalAgentEventBus;
  logger?: MultimodalLogger;
  fallbackMode?: "mock" | "disabled";
  maxImageAssets?: number;
  maxAudioAssets?: number;
  maxTotalAssets?: number;
  maxAudioDurationMs?: number;
  maxImageSizeBytes?: number;
  maxAudioSizeBytes?: number;
}

export interface UploadedAssetInput {
  kind: "image" | "audio";
  filename: string;
  mimeType: string;
  buffer: Buffer;
  metadata?: Record<string, unknown>;
}

export interface NormalizedAssetResult {
  asset: MultimodalAsset;
  warnings: string[];
}

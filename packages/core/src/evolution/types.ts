export type EvolutionMode = "mock" | "default" | "production" | "hybrid";
export type EvolutionStage =
  | "describe"
  | "generate"
  | "sandbox"
  | "test"
  | "score"
  | "promote"
  | "persist"
  | "done"
  | "failed";
export type EvolutionResultStatus = "passed" | "failed" | "repaired" | "rejected" | "promoted" | "skipped";
export type SkillKind =
  | "retrieval"
  | "analysis"
  | "execution"
  | "utility"
  | "reflection"
  | "storage"
  | "wallet"
  | "planner"
  | "safety"
  | "general";

export interface SkillExecutionContextLike {
  requestId: string;
  sessionId: string;
  walletAddress?: string;
  input: string;
  normalizedInput?: string;
  systemPrompt?: string;
  recentMemories?: Array<{
    id: string;
    kind?: string;
    title?: string;
    summary?: string;
    tags?: string[];
    importance?: number;
    createdAt?: number;
    updatedAt?: number;
    metadata?: Record<string, unknown>;
  }>;
  trace?: Array<{
    id: string;
    sessionId: string;
    type: string;
    message: string;
    createdAt: number;
    data?: Record<string, unknown>;
  }>;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
  memory?: unknown;
  storage?: unknown;
  compute?: unknown;
}

export interface SkillDefinitionLike {
  id: string;
  name: string;
  description: string;
  tags?: string[];
  kind?: SkillKind;
  version?: string;
  enabled?: boolean;
  source?: string;
  canHandle?(input: string, ctx: SkillExecutionContextLike): Promise<number> | number;
  run(ctx: SkillExecutionContextLike): Promise<unknown> | unknown;
}

export interface GeneratedSkillSpec {
  id: string;
  name: string;
  description: string;
  kind: SkillKind;
  tags: string[];
  version: string;
  goal: string;
  inputs: string[];
  outputs: string[];
  constraints: string[];
  acceptanceCriteria: string[];
  examples: Array<{
    input: string;
    expectedBehavior: string;
  }>;
}

export interface GeneratedSkillArtifact {
  skill: SkillDefinitionLike;
  sourceType: "typescript";
  source: string;
  transpiledJs: string;
  spec: GeneratedSkillSpec;
}

export interface SkillTestCase {
  id: string;
  name: string;
  input: string;
  ctx: Partial<SkillExecutionContextLike>;
  expect: {
    shouldHandle?: boolean;
    minHandleScore?: number;
    maxHandleScore?: number;
    outputIncludes?: string[];
    outputExcludes?: string[];
    outputJsonFields?: string[];
    minConfidence?: number;
    maxConfidence?: number;
  };
  weight?: number;
}

export interface SkillTestResult {
  id: string;
  name: string;
  passed: boolean;
  score: number;
  output?: unknown;
  outputText?: string;
  handleScore?: number;
  error?: string;
  durationMs: number;
  details: string[];
}

export interface EvolutionScore {
  total: number;
  testPassRate: number;
  averageTestScore: number;
  handleQuality: number;
  safetyQuality: number;
  codeQuality: number;
  repairQuality: number;
  performanceQuality: number;
  note: string;
}

export interface EvolutionAttempt {
  id: string;
  createdAt: number;
  updatedAt: number;
  stage: EvolutionStage;
  status: EvolutionResultStatus;
  task: string;
  spec: GeneratedSkillSpec;
  source?: string;
  sourceHash?: string;
  generatedSource?: string;
  transpiledJs?: string;
  tests?: SkillTestCase[];
  results?: SkillTestResult[];
  score?: EvolutionScore;
  error?: string;
  prompt?: string;
  repairRounds: number;
  promotedSkillId?: string;
  persistedArtifactKey?: string;
  metadata?: Record<string, unknown>;
}

export interface EvolutionHistoryQuery {
  status?: EvolutionResultStatus;
  stage?: EvolutionStage;
  taskContains?: string;
  skillId?: string;
  limit?: number;
  offset?: number;
}

export interface EvolutionHistorySnapshot {
  version: string;
  createdAt: number;
  attempts: EvolutionAttempt[];
}

export interface EvolutionPromptContext {
  task: string;
  domainHint?: string;
  currentSkills: Array<Pick<SkillDefinitionLike, "id" | "name" | "description" | "tags" | "kind" | "version">>;
  recentReflections?: Array<{
    sourceTurnId: string;
    taskType: string;
    outcome: string;
    rootCause: string;
    mistakeSummary: string;
    correctiveAdvice: string;
    confidence: number;
    severity: string;
    tags: string[];
    relatedMemoryIds: string[];
    nextBestAction: string;
  }>;
  examples?: string[];
  constraints?: string[];
}

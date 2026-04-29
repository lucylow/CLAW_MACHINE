export type MemoryTier = "hot" | "warm" | "cold";

export interface AgentEpisode {
  id: string;
  streamId: string;
  task: string;
  outcome: "success" | "failure";
  startedAt: string;
  endedAt: string;
  trace: string[];
  metadata?: Record<string, string | number | boolean>;
}

export interface ReflectionRecord {
  id: string;
  streamId: string;
  episodeId: string;
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  severity: "low" | "medium" | "high";
  embedding: number[];
  createdAt: string;
}

export interface MemoryQuery {
  streamId?: string;
  text: string;
  topK?: number;
  minSimilarity?: number;
}

export interface MemoryRecallResult {
  id: string;
  score: number;
  reflection: ReflectionRecord;
}

export interface MemoryWriteResult {
  ok: boolean;
  id: string;
  version?: string;
}

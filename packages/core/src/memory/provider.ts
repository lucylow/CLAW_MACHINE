import type {
  AgentEpisode,
  MemoryQuery,
  MemoryRecallResult,
  MemoryWriteResult,
  ReflectionRecord,
} from "./types.js";

export interface MemoryProvider {
  saveEpisode(episode: AgentEpisode): Promise<MemoryWriteResult>;
  saveReflection(reflection: ReflectionRecord): Promise<MemoryWriteResult>;
  recall(query: MemoryQuery): Promise<MemoryRecallResult[]>;
  getEpisode(id: string): Promise<AgentEpisode | null>;
  getReflection(id: string): Promise<ReflectionRecord | null>;
  listByStream(streamId: string, limit?: number): Promise<AgentEpisode[]>;
}

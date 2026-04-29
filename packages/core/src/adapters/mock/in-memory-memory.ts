import type { MemoryProvider } from "../../memory/provider.js";
import type {
  AgentEpisode,
  MemoryQuery,
  MemoryRecallResult,
  MemoryWriteResult,
  ReflectionRecord,
} from "../../memory/types.js";

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
}

/**
 * In-memory {@link MemoryProvider} for unit and integration tests.
 * Named to avoid clashing with {@link InMemoryMemoryAdapter} (framework MemoryRecord store).
 */
export class InMemoryMemoryProvider implements MemoryProvider {
  private readonly episodes = new Map<string, AgentEpisode>();
  private readonly reflections = new Map<string, ReflectionRecord>();

  async saveEpisode(episode: AgentEpisode): Promise<MemoryWriteResult> {
    this.episodes.set(episode.id, episode);
    return { ok: true, id: episode.id, version: "local" };
  }

  async saveReflection(reflection: ReflectionRecord): Promise<MemoryWriteResult> {
    this.reflections.set(reflection.id, reflection);
    return { ok: true, id: reflection.id, version: "local" };
  }

  async recall(query: MemoryQuery): Promise<MemoryRecallResult[]> {
    const topK = query.topK ?? 5;
    const minSim = query.minSimilarity ?? -1;
    const candidates = [...this.reflections.values()].filter(
      (r) => !query.streamId || r.streamId === query.streamId,
    );
    if (candidates.length === 0) return [];

    const queryVec = simpleTextEmbedding(query.text);
    const scored = candidates
      .map((r) => ({
        id: r.id,
        score: cosineSimilarity(queryVec, r.embedding),
        reflection: r,
      }))
      .filter((x) => x.score >= minSim)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    if (scored.some((s) => s.score > 0)) {
      return scored;
    }

    return candidates.slice(0, topK).map((r, i) => ({
      id: r.id,
      score: 1 - i * 0.1,
      reflection: r,
    }));
  }

  async getEpisode(id: string): Promise<AgentEpisode | null> {
    return this.episodes.get(id) ?? null;
  }

  async getReflection(id: string): Promise<ReflectionRecord | null> {
    return this.reflections.get(id) ?? null;
  }

  async listByStream(streamId: string, limit = 100): Promise<AgentEpisode[]> {
    return [...this.episodes.values()]
      .filter((e) => e.streamId === streamId)
      .slice(0, limit);
  }
}

function simpleTextEmbedding(text: string): number[] {
  const fake = text.split("").map((c) => (c.charCodeAt(0) % 10) / 10).slice(0, 32);
  while (fake.length < 32) fake.push(0);
  return fake;
}

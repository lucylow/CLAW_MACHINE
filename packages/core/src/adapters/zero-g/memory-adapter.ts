import type { MemoryProvider } from "../../memory/provider.js";
import type {
  AgentEpisode,
  MemoryQuery,
  MemoryRecallResult,
  MemoryWriteResult,
  ReflectionRecord,
} from "../../memory/types.js";

export interface ZeroGClientLike {
  putKV(key: string, value: unknown, streamId: string): Promise<{ id: string; version?: string }>;
  getKV<T>(key: string, streamId: string): Promise<T | null>;
  appendLog(streamId: string, payload: unknown): Promise<{ id: string; version?: string }>;
  searchByEmbedding(
    streamId: string,
    vector: number[],
    topK: number,
  ): Promise<Array<{ id: string; score: number }>>;
  getById<T>(id: string): Promise<T | null>;
}

function defaultEmbedQuery(text: string): Promise<number[]> {
  const fake = text.split("").map((c) => (c.charCodeAt(0) % 10) / 10).slice(0, 32);
  while (fake.length < 32) fake.push(0);
  return Promise.resolve(fake);
}

export class ZeroGMemoryAdapter implements MemoryProvider {
  constructor(
    private readonly client: ZeroGClientLike,
    private readonly embedQueryText: (text: string) => Promise<number[]> = defaultEmbedQuery,
  ) {}

  async saveEpisode(episode: AgentEpisode): Promise<MemoryWriteResult> {
    const res = await this.client.appendLog(episode.streamId, {
      type: "episode",
      episode,
    });

    const key = `episodes:${episode.streamId}`;
    const existing = (await this.client.getKV<AgentEpisode[]>(key, episode.streamId)) ?? [];
    existing.push(episode);
    await this.client.putKV(key, existing, episode.streamId);

    return { ok: true, id: res.id, version: res.version };
  }

  async saveReflection(reflection: ReflectionRecord): Promise<MemoryWriteResult> {
    const kvRes = await this.client.putKV(
      `reflection:${reflection.id}`,
      reflection,
      reflection.streamId,
    );

    await this.client.appendLog(reflection.streamId, {
      type: "reflection",
      reflection,
    });

    return { ok: true, id: kvRes.id, version: kvRes.version };
  }

  async recall(query: MemoryQuery): Promise<MemoryRecallResult[]> {
    const topK = query.topK ?? 5;
    const minSim = query.minSimilarity ?? -1;
    const vector = await this.embedQueryText(query.text);
    const hits = await this.client.searchByEmbedding(query.streamId ?? "global", vector, topK);

    const out: MemoryRecallResult[] = [];
    for (const hit of hits) {
      if (hit.score < minSim) continue;
      const reflection = await this.client.getById<ReflectionRecord>(hit.id);
      if (reflection) {
        if (query.streamId && reflection.streamId !== query.streamId) continue;
        out.push({ id: hit.id, score: hit.score, reflection });
      }
    }
    return out;
  }

  async getEpisode(id: string): Promise<AgentEpisode | null> {
    return this.client.getById<AgentEpisode>(id);
  }

  async getReflection(id: string): Promise<ReflectionRecord | null> {
    return this.client.getById<ReflectionRecord>(id);
  }

  async listByStream(streamId: string, limit = 100): Promise<AgentEpisode[]> {
    const key = `episodes:${streamId}`;
    const episodes = await this.client.getKV<AgentEpisode[]>(key, streamId);
    return (episodes ?? []).slice(0, limit);
  }
}

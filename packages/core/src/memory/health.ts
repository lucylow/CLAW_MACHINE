import type { MemoryProvider } from "./provider.js";

export interface HealthReport {
  ok: boolean;
  streamId: string;
  episodeCount: number;
  recentEpisodeOutcomes: Array<{ id: string; outcome: string; endedAt: string }>;
  checkedAt: string;
  errorMessage?: string;
}

export class MemoryHealthMonitor {
  constructor(private readonly provider: MemoryProvider) {}

  async check(streamId: string, recentLimit = 5): Promise<HealthReport> {
    const checkedAt = new Date().toISOString();
    try {
      const episodes = await this.provider.listByStream(streamId, 1000);
      const recent = [...episodes]
        .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))
        .slice(0, recentLimit)
        .map(e => ({ id: e.id, outcome: e.outcome, endedAt: e.endedAt }));
      return { ok: true, streamId, episodeCount: episodes.length, recentEpisodeOutcomes: recent, checkedAt };
    } catch (err) {
      return {
        ok: false, streamId, episodeCount: 0, recentEpisodeOutcomes: [], checkedAt,
        errorMessage: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async checkAll(streamIds: string[]): Promise<HealthReport[]> {
    return Promise.all(streamIds.map(id => this.check(id)));
  }
}

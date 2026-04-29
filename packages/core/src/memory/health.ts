import type { MemoryProvider } from "./provider.js";

export class MemoryHealthMonitor {
  constructor(private readonly provider: MemoryProvider) {}

  async check(streamId: string) {
    const episodes = await this.provider.listByStream(streamId, 1);
    return {
      ok: true,
      episodeCount: episodes.length,
      checkedAt: new Date().toISOString(),
    };
  }
}

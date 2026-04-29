import type { ReflectionEngine } from "../reflection/engine.js";
import type { MemoryProvider } from "./provider.js";
import type { AgentEpisode, MemoryRecallResult, ReflectionRecord } from "./types.js";

export class MemoryOrchestrator {
  constructor(
    private readonly provider: MemoryProvider,
    private readonly reflectionEngine: ReflectionEngine,
  ) {}

  async completeEpisode(episode: AgentEpisode): Promise<ReflectionRecord | null> {
    await this.provider.saveEpisode(episode);

    if (episode.outcome === "success") {
      return null;
    }

    const reflection = await this.reflectionEngine.generateReflection(episode);
    await this.provider.saveReflection(reflection);
    return reflection;
  }

  async recallLessons(streamId: string, text: string, topK = 5): Promise<MemoryRecallResult[]> {
    return this.provider.recall({ streamId, text, topK });
  }
}

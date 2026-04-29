import type { MemoryProvider } from "./provider.js";
import type { ReflectionRecord } from "./types.js";

export interface PrunePolicy {
  maxReflectionsPerStream: number;
  minSeverityToKeep: "low" | "medium" | "high";
}

export class MemoryPruner {
  constructor(
    private readonly provider: MemoryProvider,
    private readonly policy: PrunePolicy,
  ) {}

  async pruneStream(streamId: string): Promise<{ kept: number; pruned: number }> {
    const episodes = await this.provider.listByStream(streamId, 1000);
    const pruned = Math.max(0, episodes.length - this.policy.maxReflectionsPerStream);
    return {
      kept: Math.min(episodes.length, this.policy.maxReflectionsPerStream),
      pruned,
    };
  }

  summarizeReflection(r: ReflectionRecord): string {
    return `${r.severity.toUpperCase()}: ${r.rootCause} -> ${r.correctiveAdvice}`;
  }
}

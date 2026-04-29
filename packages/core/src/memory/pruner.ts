import type { MemoryProvider } from "./provider.js";
import type { ReflectionRecord } from "./types.js";

export interface PrunePolicy {
  maxReflectionsPerStream: number;
  minSeverityToKeep: "low" | "medium" | "high";
}

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2 };

export class MemoryPruner {
  constructor(
    private readonly provider: MemoryProvider,
    private readonly policy: PrunePolicy,
  ) {}

  async pruneStream(streamId: string): Promise<{ kept: number; pruned: number }> {
    const episodes = await this.provider.listByStream(streamId, 10_000);
    const minRank = SEVERITY_RANK[this.policy.minSeverityToKeep] ?? 0;

    // Sort oldest-first so we prune the oldest low-value episodes first
    const sorted = [...episodes].sort((a, b) => Date.parse(a.endedAt) - Date.parse(b.endedAt));

    // Determine how many to remove
    const excess = Math.max(0, sorted.length - this.policy.maxReflectionsPerStream);
    let pruned = 0;

    for (let i = 0; i < excess; i++) {
      const ep = sorted[i];
      // Only prune episodes whose severity is below the minimum threshold
      const epSeverity = (ep.metadata as any)?.severity as string | undefined;
      const epRank = epSeverity !== undefined ? (SEVERITY_RANK[epSeverity] ?? 0) : 0;
      if (epRank < minRank) pruned++;
    }

    return {
      kept: sorted.length - pruned,
      pruned,
    };
  }

  summarizeReflection(r: ReflectionRecord): string {
    return `${r.severity.toUpperCase()}: ${r.rootCause} -> ${r.correctiveAdvice}`;
  }

  summarizeAll(reflections: ReflectionRecord[]): string {
    if (reflections.length === 0) return "No reflections.";
    const bySeverity: Record<string, ReflectionRecord[]> = {};
    for (const r of reflections) {
      (bySeverity[r.severity] ??= []).push(r);
    }
    const lines: string[] = [`Total: ${reflections.length} reflections`];
    for (const [sev, recs] of Object.entries(bySeverity).sort((a, b) => SEVERITY_RANK[b[0]] - SEVERITY_RANK[a[0]])) {
      lines.push(`  ${sev.toUpperCase()} (${recs.length}): ${recs.slice(0, 2).map(r => r.rootCause).join("; ")}`);
    }
    return lines.join("\n");
  }
}

import type { ReflectionEngine } from "../reflection/engine.js";
import type { MemoryProvider } from "./provider.js";
import type { AgentEpisode, MemoryRecallResult, ReflectionRecord } from "./types.js";

export interface OrchestratorStats {
  streamId: string;
  episodeCount: number;
  reflectionCount: number;
  successRate: number;
  topSeverities: Record<string, number>;
  mostCommonRootCauses: string[];
  lastActivityAt: string | null;
}

export interface LessonContext {
  lessons: MemoryRecallResult[];
  promptBlock: string;
}

export class MemoryOrchestrator {
  constructor(
    private readonly provider: MemoryProvider,
    private readonly reflectionEngine: ReflectionEngine,
  ) {}

  async completeEpisode(episode: AgentEpisode): Promise<ReflectionRecord | null> {
    await this.provider.saveEpisode(episode);
    if (episode.outcome === "success") return null;
    const reflection = await this.reflectionEngine.generateReflection(episode);
    await this.provider.saveReflection(reflection);
    return reflection;
  }

  async batchReflect(episodes: AgentEpisode[]): Promise<Array<ReflectionRecord | null>> {
    return Promise.all(episodes.map(ep => this.completeEpisode(ep)));
  }

  async recallLessonsWithContext(streamId: string, task: string, topK = 5): Promise<LessonContext> {
    const lessons = await this.provider.recall({ streamId, text: task, topK });
    const promptBlock = this.buildPromptBlock(lessons);
    return { lessons, promptBlock };
  }

  async recallLessons(streamId: string, text: string, topK = 5): Promise<MemoryRecallResult[]> {
    return this.provider.recall({ streamId, text, topK });
  }

  async summarizeLessons(streamId: string, topK = 20): Promise<string> {
    const lessons = await this.provider.recall({ streamId, text: "summary", topK });
    if (lessons.length === 0) return "";
    const bullets = lessons.map(l => {
      const r = l.reflection;
      return `- [${r.severity}] ${r.rootCause}: ${r.correctiveAdvice}`;
    });
    return `Accumulated lessons (${lessons.length}):\n${bullets.join("\n")}`;
  }

  async getStats(streamId: string): Promise<OrchestratorStats> {
    const episodes = await this.provider.listByStream(streamId, 1000);
    const reflections = await this.provider.recall({ streamId, text: "", topK: 1000 });
    const successCount = episodes.filter(e => e.outcome === "success").length;
    const successRate = episodes.length > 0 ? successCount / episodes.length : 1;
    const severities: Record<string, number> = {};
    const rootCauseCounts: Record<string, number> = {};
    for (const r of reflections) {
      const sev = r.reflection.severity;
      severities[sev] = (severities[sev] ?? 0) + 1;
      const rc = r.reflection.rootCause;
      rootCauseCounts[rc] = (rootCauseCounts[rc] ?? 0) + 1;
    }
    const mostCommonRootCauses = Object.entries(rootCauseCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5).map(([rc]) => rc);
    const lastEpisode = [...episodes].sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))[0];
    return { streamId, episodeCount: episodes.length, reflectionCount: reflections.length,
      successRate, topSeverities: severities, mostCommonRootCauses, lastActivityAt: lastEpisode?.endedAt ?? null };
  }

  private buildPromptBlock(lessons: MemoryRecallResult[]): string {
    if (lessons.length === 0) return "";
    return [
      "Past lessons (apply these to avoid repeating mistakes):",
      ...lessons.map((l, i) => {
        const r = l.reflection;
        return `${i + 1}. [${r.severity.toUpperCase()}] Root cause: ${r.rootCause}\n   Mistake: ${r.mistakeSummary}\n   Advice: ${r.correctiveAdvice}`;
      }),
    ].join("\n");
  }
}

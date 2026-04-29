import { randomUUID } from "node:crypto";
import type { MemoryOrchestrator } from "../memory/orchestrator.js";
import type { AgentEpisode, ReflectionRecord } from "../memory/types.js";
import type { SessionTracer } from "../session/tracer.js";
import { LessonInjector } from "./lesson-injector.js";

export interface AgentRuntimeDeps {
  memory: MemoryOrchestrator;
  tracer: SessionTracer;
}

export interface TaskResult {
  episode: AgentEpisode;
  reflection: ReflectionRecord | null;
  lessonContext?: string;
}

export interface BatchTaskSpec {
  streamId: string;
  task: string;
  exec: () => Promise<{ ok: boolean; result: string }>;
}

export interface RuntimeStats {
  totalTasks: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  activeStreams: number;
}

export class AgentRuntime {
  private readonly lessonInjector: LessonInjector;
  private taskCount = 0;
  private successCount = 0;
  private failureCount = 0;
  private readonly activeStreams = new Set<string>();

  constructor(private readonly deps: AgentRuntimeDeps) {
    this.lessonInjector = new LessonInjector(deps.memory);
  }

  async runTask(
    streamId: string,
    task: string,
    exec: () => Promise<{ ok: boolean; result: string }>,
    opts: { injectLessons?: boolean } = {},
  ): Promise<TaskResult> {
    this.activeStreams.add(streamId);
    this.taskCount++;

    let lessonContext: string | undefined;
    if (opts.injectLessons !== false) {
      try {
        lessonContext = await this.lessonInjector.buildContext(streamId, task);
        if (lessonContext) this.deps.tracer.add("lessons.injected", lessonContext);
      } catch { /* non-fatal */ }
    }

    this.deps.tracer.add("task.start", task);
    const startedAt = new Date().toISOString();
    let outcome: "success" | "failure" = "success";
    let resultText = "";
    let errorText: string | undefined;

    try {
      const res = await exec();
      outcome = res.ok ? "success" : "failure";
      resultText = res.result;
      this.deps.tracer.add("task.result", res.result);
    } catch (err) {
      outcome = "failure";
      errorText = err instanceof Error ? err.message : String(err);
      this.deps.tracer.add("task.error", errorText);
    }

    if (outcome === "success") this.successCount++;
    else this.failureCount++;

    const episode: AgentEpisode = {
      id: randomUUID(),
      streamId,
      task,
      outcome,
      startedAt,
      endedAt: new Date().toISOString(),
      trace: this.deps.tracer.getTrace(),
      metadata: { resultText, errorText: errorText ?? "" },
    };

    const reflection = await this.deps.memory.completeEpisode(episode);
    this.deps.tracer.clear();
    this.activeStreams.delete(streamId);
    return { episode, reflection, lessonContext };
  }

  async runBatch(specs: BatchTaskSpec[]): Promise<TaskResult[]> {
    return Promise.all(specs.map(s => this.runTask(s.streamId, s.task, s.exec)));
  }

  getStats(): RuntimeStats {
    return {
      totalTasks: this.taskCount,
      successCount: this.successCount,
      failureCount: this.failureCount,
      successRate: this.taskCount > 0 ? this.successCount / this.taskCount : 1,
      activeStreams: this.activeStreams.size,
    };
  }
}

import type { MemoryOrchestrator } from "../memory/orchestrator.js";

export class LessonInjector {
  constructor(private readonly memory: MemoryOrchestrator) {}

  async buildContext(streamId: string, task: string): Promise<string> {
    const lessons = await this.memory.recallLessons(streamId, task, 3);

    if (lessons.length === 0) return "";

    return lessons
      .map((l, idx) => {
        const r = l.reflection;
        return [
          `Lesson ${idx + 1}`,
          `Root cause: ${r.rootCause}`,
          `Mistake: ${r.mistakeSummary}`,
          `Advice: ${r.correctiveAdvice}`,
          `Severity: ${r.severity}`,
        ].join("\n");
      })
      .join("\n\n");
  }
}

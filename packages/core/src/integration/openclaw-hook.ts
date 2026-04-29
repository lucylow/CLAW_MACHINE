import type { MemoryOrchestrator } from "../memory/orchestrator.js";
import type { SessionTracer } from "../session/tracer.js";

export interface OpenClawLikeAgent {
  run(input: { task: string; context?: string }): Promise<string>;
}

export function wrapOpenClawAgent(
  agent: OpenClawLikeAgent,
  memory: MemoryOrchestrator,
  tracer: SessionTracer,
  streamId: string,
) {
  return {
    async run(task: string) {
      tracer.add("openclaw.task.start", task);

      const context = await memory.recallLessons(streamId, task, 3);
      const injected = context.map((c) => c.reflection.correctiveAdvice).join("\n");

      try {
        const output = await agent.run({
          task,
          context: injected,
        });

        tracer.add("openclaw.task.success", output);
        return output;
      } catch (err) {
        tracer.add("openclaw.task.failure", err instanceof Error ? err.message : String(err));
        throw err;
      }
    },
  };
}

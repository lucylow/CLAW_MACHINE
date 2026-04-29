import { randomUUID } from "node:crypto";
import type { MemoryOrchestrator } from "../memory/orchestrator.js";
import type { AgentEpisode } from "../memory/types.js";
import type { SessionTracer } from "../session/tracer.js";

export interface AgentRuntimeDeps {
  memory: MemoryOrchestrator;
  tracer: SessionTracer;
}

export class AgentRuntime {
  constructor(private readonly deps: AgentRuntimeDeps) {}

  async runTask(
    streamId: string,
    task: string,
    exec: () => Promise<{ ok: boolean; result: string }>,
  ) {
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

    const episode: AgentEpisode = {
      id: randomUUID(),
      streamId,
      task,
      outcome,
      startedAt,
      endedAt: new Date().toISOString(),
      trace: this.deps.tracer.getTrace(),
      metadata: {
        resultText,
        errorText: errorText ?? "",
      },
    };

    const reflection = await this.deps.memory.completeEpisode(episode);
    this.deps.tracer.clear();

    return { episode, reflection };
  }
}

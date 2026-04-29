import { describe, it, expect } from "vitest";
import { AgentRuntime } from "../../src/agent/runtime.js";
import { LessonInjector } from "../../src/agent/lesson-injector.js";
import { InMemoryMemoryProvider } from "../../src/adapters/mock/in-memory-memory.js";
import { MemoryOrchestrator } from "../../src/memory/orchestrator.js";
import { ReflectionEngine } from "../../src/reflection/engine.js";
import { SessionTracer } from "../../src/session/tracer.js";

class LearningLLM implements import("../../src/reflection/engine.js").LlmClient {
  async chat() {
    return JSON.stringify({
      rootCause: "forgot to check preconditions",
      mistakeSummary: "executed too early",
      correctiveAdvice: "always validate preconditions first",
      severity: "high",
    });
  }

  async embed() {
    return [0.4, 0.4, 0.1, 0.1];
  }
}

describe("learning cycle", () => {
  it("stores a failure and reuses it later", async () => {
    const adapter = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(adapter, new ReflectionEngine(new LearningLLM()));
    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    await runtime.runTask("s1", "update status", async () => {
      throw new Error("precondition missing");
    });

    const injector = new LessonInjector(memory);
    const ctx = await injector.buildContext("s1", "update status");

    expect(ctx).toContain("validate preconditions first");
  });
});

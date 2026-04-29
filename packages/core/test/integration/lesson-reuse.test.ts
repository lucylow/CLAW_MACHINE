import { describe, it, expect } from "vitest";
import { LessonInjector } from "../../src/agent/lesson-injector.js";
import { InMemoryMemoryProvider } from "../../src/adapters/mock/in-memory-memory.js";
import { MemoryOrchestrator } from "../../src/memory/orchestrator.js";
import { ReflectionEngine } from "../../src/reflection/engine.js";

class StubLLM implements import("../../src/reflection/engine.js").LlmClient {
  async chat() {
    return JSON.stringify({
      rootCause: "wrong routing rule",
      mistakeSummary: "picked the wrong branch",
      correctiveAdvice: "check the classifier before taking action",
      severity: "medium",
    });
  }

  async embed() {
    return [0.3, 0.2, 0.1, 0.4];
  }
}

describe("lesson reuse", () => {
  it("retrieves past reflections for a similar task", async () => {
    const adapter = new InMemoryMemoryProvider();
    const engine = new ReflectionEngine(new StubLLM());
    const memory = new MemoryOrchestrator(adapter, engine);

    const reflection = await engine.generateReflection({
      id: "e1",
      streamId: "s1",
      task: "routing mistake",
      outcome: "failure",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      trace: ["selected wrong route"],
    });

    await adapter.saveReflection(reflection);

    const injector = new LessonInjector(memory);
    const ctx = await injector.buildContext("s1", "routing mistake");

    expect(ctx).toContain("wrong routing rule");
  });
});

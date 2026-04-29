import { describe, it, expect } from "vitest";
import { LessonInjector } from "../../src/agent/lesson-injector.js";
import { AgentRuntime } from "../../src/agent/runtime.js";
import { InMemoryMemoryProvider } from "../../src/adapters/mock/in-memory-memory.js";
import { MemoryOrchestrator } from "../../src/memory/orchestrator.js";
import { ReflectionEngine } from "../../src/reflection/engine.js";
import { SessionTracer } from "../../src/session/tracer.js";

class StubLLM implements import("../../src/reflection/engine.js").LlmClient {
  async chat() {
    return JSON.stringify({
      rootCause: "wrong routing rule",
      mistakeSummary: "picked the wrong branch",
      correctiveAdvice: "check the classifier before taking action",
      severity: "medium",
    });
  }
  async embed() { return [0.3, 0.2, 0.1, 0.4]; }
}

describe("lesson reuse (original)", () => {
  it("retrieves past reflections for a similar task", async () => {
    const adapter = new InMemoryMemoryProvider();
    const engine = new ReflectionEngine(new StubLLM());
    const memory = new MemoryOrchestrator(adapter, engine);

    const reflection = await engine.generateReflection({
      id: "e1", streamId: "s1", task: "routing mistake", outcome: "failure",
      startedAt: new Date().toISOString(), endedAt: new Date().toISOString(),
      trace: ["selected wrong route"],
    });
    await adapter.saveReflection(reflection);

    const injector = new LessonInjector(memory);
    const ctx = await injector.buildContext("s1", "routing mistake");
    expect(ctx).toContain("wrong routing rule");
  });
});

describe("lesson reuse (extended)", () => {
  it("recallLessonsWithContext returns a formatted promptBlock", async () => {
    const adapter = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(adapter, new ReflectionEngine(new StubLLM()));
    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    await runtime.runTask("s2", "routing task", async () => { throw new Error("wrong route"); });

    const { lessons, promptBlock } = await memory.recallLessonsWithContext("s2", "routing task", 5);
    expect(lessons.length).toBeGreaterThan(0);
    expect(promptBlock.length).toBeGreaterThan(0);
  });

  it("summarizeLessons returns a compact summary after failures", async () => {
    const adapter = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(adapter, new ReflectionEngine(new StubLLM()));
    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    for (let i = 0; i < 2; i++) {
      await runtime.runTask("s3", `task ${i}`, async () => { throw new Error("err"); });
    }

    const summary = await memory.summarizeLessons("s3");
    expect(summary.length).toBeGreaterThan(0);
  });

  it("getStats returns correct counts", async () => {
    const adapter = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(adapter, new ReflectionEngine(new StubLLM()));
    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    await runtime.runTask("s4", "ok", async () => ({ ok: true, result: "done" }));
    await runtime.runTask("s4", "fail", async () => { throw new Error("err"); });

    const stats = await memory.getStats("s4");
    expect(stats.episodeCount).toBe(2);
    expect(stats.reflectionCount).toBe(1);
    expect(stats.successRate).toBeCloseTo(0.5);
  });
});

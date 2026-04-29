import { describe, it, expect } from "vitest";
import { AgentRuntime } from "../../src/agent/runtime.js";
import { InMemoryMemoryProvider } from "../../src/adapters/mock/in-memory-memory.js";
import { MemoryOrchestrator } from "../../src/memory/orchestrator.js";
import { ReflectionEngine } from "../../src/reflection/engine.js";
import { SessionTracer } from "../../src/session/tracer.js";

class StubLLM implements import("../../src/reflection/engine.js").LlmClient {
  async chat() {
    return JSON.stringify({
      rootCause: "missing input validation",
      mistakeSummary: "did not validate before processing",
      correctiveAdvice: "always validate inputs at the boundary",
      severity: "high",
    });
  }
  async embed(text: string) {
    const v = text.split("").map((c) => (c.charCodeAt(0) % 10) / 10).slice(0, 4);
    while (v.length < 4) v.push(0);
    return v;
  }
}

describe("batchReflect", () => {
  it("processes multiple episodes in parallel and returns one result per episode", async () => {
    const provider = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(provider, new ReflectionEngine(new StubLLM()));

    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    // Run 3 tasks in batch — 2 failures, 1 success
    const results = await runtime.runBatch([
      { streamId: "s1", task: "validate payment", exec: async () => { throw new Error("invalid card"); } },
      { streamId: "s1", task: "send confirmation", exec: async () => ({ ok: true, result: "sent" }) },
      { streamId: "s1", task: "update ledger", exec: async () => { throw new Error("db locked"); } },
    ]);

    expect(results).toHaveLength(3);
    expect(results[0].episode.outcome).toBe("failure");
    expect(results[0].reflection).not.toBeNull();
    expect(results[1].episode.outcome).toBe("success");
    expect(results[1].reflection).toBeNull();
    expect(results[2].episode.outcome).toBe("failure");
    expect(results[2].reflection).not.toBeNull();
  });

  it("getStats tracks success and failure counts correctly", async () => {
    const provider = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(provider, new ReflectionEngine(new StubLLM()));
    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    await runtime.runTask("s2", "task a", async () => ({ ok: true, result: "ok" }));
    await runtime.runTask("s2", "task b", async () => { throw new Error("boom"); });
    await runtime.runTask("s2", "task c", async () => ({ ok: true, result: "ok" }));

    const stats = runtime.getStats();
    expect(stats.totalTasks).toBe(3);
    expect(stats.successCount).toBe(2);
    expect(stats.failureCount).toBe(1);
    expect(stats.successRate).toBeCloseTo(2 / 3);
  });
});

describe("MemoryOrchestrator.getStats", () => {
  it("returns aggregate stats for a stream", async () => {
    const provider = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(provider, new ReflectionEngine(new StubLLM()));
    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    await runtime.runTask("s3", "task 1", async () => { throw new Error("err1"); });
    await runtime.runTask("s3", "task 2", async () => ({ ok: true, result: "done" }));

    const stats = await memory.getStats("s3");
    expect(stats.streamId).toBe("s3");
    expect(stats.episodeCount).toBe(2);
    expect(stats.reflectionCount).toBeGreaterThanOrEqual(1);
    expect(stats.successRate).toBeCloseTo(0.5);
  });
});

describe("MemoryOrchestrator.summarizeLessons", () => {
  it("returns a non-empty summary after failures", async () => {
    const provider = new InMemoryMemoryProvider();
    const memory = new MemoryOrchestrator(provider, new ReflectionEngine(new StubLLM()));
    const runtime = new AgentRuntime({ memory, tracer: new SessionTracer() });

    await runtime.runTask("s4", "process order", async () => { throw new Error("timeout"); });

    const summary = await memory.summarizeLessons("s4");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("lesson");
  });
});

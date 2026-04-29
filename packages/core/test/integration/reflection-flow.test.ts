import { describe, it, expect } from "vitest";
import { AgentRuntime } from "../../src/agent/runtime.js";
import { InMemoryMemoryProvider } from "../../src/adapters/mock/in-memory-memory.js";
import { MemoryOrchestrator } from "../../src/memory/orchestrator.js";
import { ReflectionEngine } from "../../src/reflection/engine.js";
import { SessionTracer } from "../../src/session/tracer.js";

class StubLLM implements import("../../src/reflection/engine.js").LlmClient {
  async chat() {
    return JSON.stringify({
      rootCause: "missed edge case",
      mistakeSummary: "did not validate input",
      correctiveAdvice: "validate before executing",
      severity: "high",
    });
  }

  async embed() {
    return [0.1, 0.2, 0.3, 0.4];
  }
}

describe("reflection flow", () => {
  it("creates a durable reflection after failure", async () => {
    const memory = new MemoryOrchestrator(
      new InMemoryMemoryProvider(),
      new ReflectionEngine(new StubLLM()),
    );

    const runtime = new AgentRuntime({
      memory,
      tracer: new SessionTracer(),
    });

    const { episode, reflection } = await runtime.runTask(
      "s1",
      "process refund request",
      async () => {
        throw new Error("invalid refund state");
      },
    );

    expect(episode.outcome).toBe("failure");
    expect(reflection?.correctiveAdvice).toContain("validate");
  });
});

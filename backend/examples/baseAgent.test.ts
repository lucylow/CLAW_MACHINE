/**
 * Unit tests for BaseAgent helpers.
 */
import { describe, it, expect, vi } from "vitest";
import { BaseAgent } from "./baseAgent.js";

class TestAgent extends BaseAgent {
  constructor() { super("testAgent"); }
  async run() { return this.finalize(); }
  // Expose protected methods for testing
  testPlan(goal: string) { return this.plan(goal); }
  testToolCall(name: string, input: unknown) { return this.toolCall(name, input); }
  testRecordTurn(role: "user" | "assistant", content: string, tags?: string[]) {
    this.recordTurn({ role, content, tags });
  }
  testGetMemoryByTag(...tags: string[]) { return this.getMemoryByTag(...tags); }
  testSummarizeMemory(n?: number) { return this.summarizeMemory(n); }
  testSuccess() { this.success(); }
  testFailure() { this.failure(); }
  testReset() { this.reset(); }
  async testRetryTool<T>(name: string, fn: () => Promise<T>, opts?: any) {
    return this.retryTool(name, fn, opts);
  }
  async testWithTimeout<T>(fn: () => Promise<T>, ms: number) {
    return this.withTimeout(fn, ms, "test-op");
  }
}

describe("BaseAgent", () => {
  it("records turns with auto-timestamp", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "hello");
    const stats = agent.finalize();
    expect(stats.turns).toBe(1);
    expect(stats.memory[0].timestamp).toBeTruthy();
    expect(new Date(stats.memory[0].timestamp).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("getMemoryByTag filters correctly", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "refund request", ["refund", "laptop"]);
    agent.testRecordTurn("assistant", "policy checked", ["policy"]);
    agent.testRecordTurn("user", "another refund", ["refund"]);
    const refundMem = agent.testGetMemoryByTag("refund");
    expect(refundMem.length).toBe(2);
    const policyMem = agent.testGetMemoryByTag("policy");
    expect(policyMem.length).toBe(1);
    const noneMem = agent.testGetMemoryByTag("nonexistent");
    expect(noneMem.length).toBe(0);
  });

  it("summarizeMemory returns prose summary", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "first message");
    agent.testRecordTurn("assistant", "first reply");
    const summary = agent.testSummarizeMemory();
    expect(summary).toContain("[user]");
    expect(summary).toContain("[assistant]");
  });

  it("summarizeMemory returns 'No prior memory' when empty", () => {
    const agent = new TestAgent();
    expect(agent.testSummarizeMemory()).toBe("No prior memory.");
  });

  it("plan increments plansBuilt and sets lastGoal", () => {
    const agent = new TestAgent();
    const steps = agent.testPlan("test goal");
    const stats = agent.finalize();
    expect(stats.plansBuilt).toBe(1);
    expect(stats.lastGoal).toBe("test goal");
    expect(steps.length).toBeGreaterThan(0);
  });

  it("toolCall increments toolCalls and emits tool event", () => {
    const agent = new TestAgent();
    const listener = vi.fn();
    agent.on("tool", listener);
    agent.testToolCall("myTool", { x: 1 });
    const stats = agent.finalize();
    expect(stats.toolCalls).toBe(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].name).toBe("myTool");
  });

  it("retryTool succeeds on second attempt", async () => {
    const agent = new TestAgent();
    let calls = 0;
    const result = await agent.testRetryTool("flaky", async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "ok";
    }, { maxAttempts: 3, baseMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
    const stats = agent.finalize();
    expect(stats.toolRetries).toBe(1);
  });

  it("retryTool throws after max attempts", async () => {
    const agent = new TestAgent();
    await expect(
      agent.testRetryTool("alwaysFail", async () => { throw new Error("always"); }, { maxAttempts: 2, baseMs: 1 }),
    ).rejects.toThrow("always");
  });

  it("withTimeout resolves when fn completes in time", async () => {
    const agent = new TestAgent();
    const result = await agent.testWithTimeout(async () => "fast", 1000);
    expect(result).toBe("fast");
  });

  it("withTimeout throws when fn exceeds limit", async () => {
    const agent = new TestAgent();
    await expect(
      agent.testWithTimeout(() => new Promise((r) => setTimeout(r, 500)), 50),
    ).rejects.toThrow("timed out");
  });

  it("reset clears memory and stats", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "hello");
    agent.testSuccess();
    agent.testReset();
    const stats = agent.finalize();
    expect(stats.turns).toBe(0);
    expect(stats.successes).toBe(0);
    expect(stats.memory.length).toBe(0);
  });

  it("emits reset event on reset()", () => {
    const agent = new TestAgent();
    const listener = vi.fn();
    agent.on("reset", listener);
    agent.testReset();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("finalize includes toolLog", () => {
    const agent = new TestAgent();
    agent.testToolCall("t1", {});
    agent.testToolCall("t2", {});
    const stats = agent.finalize();
    expect(stats.toolLog.length).toBe(2);
    expect(stats.toolLog[0].name).toBe("t1");
  });
});

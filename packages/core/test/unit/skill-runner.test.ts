/**
 * Unit tests for SkillRunner refactor (v3).
 */
import { describe, it, expect, vi } from "vitest";
import { SkillRunner } from "../../src/SkillRunner.js";
import { MockComputeAdapter } from "../../src/adapters/MockComputeAdapter.js";
import { InMemoryStorageAdapter } from "../../src/adapters/InMemoryStorageAdapter.js";
import { InMemoryMemoryAdapter } from "../../src/adapters/InMemoryMemoryAdapter.js";
import { defineSkill } from "../../src/defineSkill.js";

function makeRunner() {
  return new SkillRunner({
    compute: new MockComputeAdapter(),
    storage: new InMemoryStorageAdapter(),
    memory: new InMemoryMemoryAdapter(),
  });
}

const echoSkill = defineSkill({
  manifest: { id: "echo", name: "Echo", description: "Echoes input", capabilities: [], version: "1.0.0" },
  execute: async (input) => ({ echoed: input.message }),
});

const slowSkill = defineSkill({
  manifest: { id: "slow", name: "Slow", description: "Slow skill", capabilities: [], version: "1.0.0" },
  execute: async () => {
    await new Promise((r) => setTimeout(r, 500));
    return { done: true };
  },
});

const errorSkill = defineSkill({
  manifest: { id: "error", name: "Error", description: "Always errors", capabilities: [], version: "1.0.0" },
  execute: async () => { throw new Error("skill error"); },
});

describe("SkillRunner", () => {
  it("register and list", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    expect(runner.list().length).toBe(1);
    expect(runner.list()[0].id).toBe("echo");
  });

  it("register rejects duplicate ids", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    expect(() => runner.register(echoSkill)).toThrow(`Duplicate skill id: "echo"`);
  });

  it("execute returns correct output", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    const result = await runner.execute("echo", { message: "hello" });
    expect(result.echoed).toBe("hello");
  });

  it("execute throws for unknown skill", async () => {
    const runner = makeRunner();
    await expect(runner.execute("nonexistent", {})).rejects.toThrow("Unknown skill");
  });

  it("execute throws for disabled skill", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    runner.setEnabled("echo", false);
    await expect(runner.execute("echo", {})).rejects.toThrow("is disabled");
  });

  it("disableAll and enableAll", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    runner.register(errorSkill);
    runner.disableAll();
    expect(runner.listEnabled().length).toBe(0);
    runner.enableAll();
    expect(runner.listEnabled().length).toBe(2);
  });

  it("getAll returns manifests and stats", () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    const all = runner.getAll();
    expect(all.length).toBe(1);
    expect(all[0].manifest.id).toBe("echo");
    expect(all[0].stats.callCount).toBe(0);
  });

  it("getStats tracks call counts and errors", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    runner.register(errorSkill);
    await runner.execute("echo", { message: "test" });
    await runner.execute("echo", { message: "test2" });
    try { await runner.execute("error", {}); } catch {}
    const stats = runner.getStats();
    const echoStats = stats.find((s) => s.id === "echo")!;
    const errStats = stats.find((s) => s.id === "error")!;
    expect(echoStats.callCount).toBe(2);
    expect(echoStats.errorCount).toBe(0);
    expect(echoStats.successRate).toBe(1);
    expect(errStats.callCount).toBe(1);
    expect(errStats.errorCount).toBe(1);
    expect(errStats.successRate).toBe(0);
  });

  it("executeWithTimeout resolves fast skills", async () => {
    const runner = makeRunner();
    runner.register(echoSkill);
    const result = await runner.executeWithTimeout("echo", { message: "hi" }, 2000);
    expect(result.echoed).toBe("hi");
  });

  it("executeWithTimeout throws on slow skills", async () => {
    const runner = makeRunner();
    runner.register(slowSkill);
    await expect(
      runner.executeWithTimeout("slow", {}, 50),
    ).rejects.toThrow("timed out");
  });
});

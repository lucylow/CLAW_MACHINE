/**
 * Unit tests for PluginManager refactor (v3).
 */
import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../../src/PluginManager.js";
import { definePlugin } from "../../src/definePlugin.js";

const p1 = definePlugin({ id: "p1", name: "Plugin 1", hooks: {} });
const p2 = definePlugin({ id: "p2", name: "Plugin 2", hooks: {} });

describe("PluginManager", () => {
  it("register and list", () => {
    const pm = new PluginManager();
    pm.register(p1);
    pm.register(p2);
    expect(pm.list().length).toBe(2);
    expect(pm.count()).toBe(2);
  });

  it("has() returns correct boolean", () => {
    const pm = new PluginManager();
    pm.register(p1);
    expect(pm.has("p1")).toBe(true);
    expect(pm.has("p2")).toBe(false);
  });

  it("register rejects duplicates", () => {
    const pm = new PluginManager();
    pm.register(p1);
    expect(() => pm.register(p1)).toThrow(`Duplicate plugin id: "p1"`);
  });

  it("unregister removes plugin", () => {
    const pm = new PluginManager();
    pm.register(p1);
    pm.register(p2);
    expect(pm.unregister("p1")).toBe(true);
    expect(pm.count()).toBe(1);
    expect(pm.has("p1")).toBe(false);
  });

  it("unregister returns false for unknown id", () => {
    const pm = new PluginManager();
    expect(pm.unregister("nonexistent")).toBe(false);
  });

  it("describe() returns hook names", () => {
    const hookPlugin = definePlugin({
      id: "hook.plugin",
      name: "Hook Plugin",
      hooks: {
        onAgentInit: async () => {},
        onBeforeTurn: async (input) => input,
      },
    });
    const pm = new PluginManager();
    pm.register(hookPlugin);
    const desc = pm.describe();
    expect(desc[0].id).toBe("hook.plugin");
    expect(desc[0].hooks).toContain("onAgentInit");
    expect(desc[0].hooks).toContain("onBeforeTurn");
  });

  it("uses custom logger instead of console.error", async () => {
    const logger = { warn: vi.fn(), error: vi.fn() };
    const throwPlugin = definePlugin({
      id: "throw.plugin",
      name: "Throw Plugin",
      hooks: {
        onAgentInit: async () => { throw new Error("init error"); },
      },
    });
    const pm = new PluginManager(logger);
    pm.register(throwPlugin);
    await pm.runOnAgentInit({} as any);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("onAgentInit error"),
      expect.objectContaining({ error: expect.stringContaining("init error") }),
    );
    expect(logger.error).not.toHaveBeenCalledWith(expect.any(String), undefined);
  });

  it("after-hooks run in reverse order", async () => {
    const order: string[] = [];
    const a = definePlugin({ id: "a", name: "A", hooks: { onAfterTurn: async (r) => { order.push("a"); return r; } } });
    const b = definePlugin({ id: "b", name: "B", hooks: { onAfterTurn: async (r) => { order.push("b"); return r; } } });
    const pm = new PluginManager();
    pm.register(a);
    pm.register(b);
    const mockResult = { output: "", success: true, reflections: [], memoryIds: [], metadata: {} };
    await pm.runOnAfterTurn(mockResult, {} as any);
    expect(order).toEqual(["b", "a"]); // reverse registration order
  });
});

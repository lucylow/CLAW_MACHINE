/**
 * Unit tests for AgentBuilder refactor (v3).
 */
import { describe, it, expect } from "vitest";
import { AgentBuilder } from "../../src/AgentBuilder.js";
import { defineSkill } from "../../src/defineSkill.js";
import { definePlugin } from "../../src/definePlugin.js";
import { MockComputeAdapter } from "../../src/adapters/MockComputeAdapter.js";

const dummySkill = defineSkill({
  manifest: { id: "test.skill", name: "Test Skill", description: "A test skill", capabilities: [], version: "1.0.0" },
  execute: async () => ({ ok: true }),
});

const dummyPlugin = definePlugin({
  id: "test.plugin",
  name: "Test Plugin",
  hooks: {},
});

describe("AgentBuilder", () => {
  it("setName rejects empty string", () => {
    expect(() => new AgentBuilder().setName("")).toThrow("name must be a non-empty string");
    expect(() => new AgentBuilder().setName("  ")).toThrow("name must be a non-empty string");
  });

  it("setName trims whitespace", () => {
    const b = new AgentBuilder().setName("  MyAgent  ");
    expect(b.toConfig().name).toBe("MyAgent");
  });

  it("setVersion sets version", () => {
    const b = new AgentBuilder().setVersion("2.3.4");
    expect(b.toConfig().version).toBe("2.3.4");
  });

  it("withTags accumulates tags", () => {
    const b = new AgentBuilder().withTags("defi", "0g").withTags("support");
    expect(b.toConfig().tags).toEqual(["defi", "0g", "support"]);
  });

  it("skill() rejects duplicate ids", () => {
    expect(() =>
      new AgentBuilder().skill(dummySkill).skill(dummySkill),
    ).toThrow(`Duplicate skill id: "test.skill"`);
  });

  it("use() rejects duplicate plugin ids", () => {
    expect(() =>
      new AgentBuilder().use(dummyPlugin).use(dummyPlugin),
    ).toThrow(`Duplicate plugin id: "test.plugin"`);
  });

  it("setMaxPlanParallelism rejects < 1", () => {
    expect(() => new AgentBuilder().setMaxPlanParallelism(0)).toThrow("maxPlanParallelism must be >= 1");
  });

  it("withTimeout rejects <= 0", () => {
    expect(() => new AgentBuilder().withTimeout(0)).toThrow("timeout must be > 0");
    expect(() => new AgentBuilder().withTimeout(-1)).toThrow("timeout must be > 0");
  });

  it("validate() returns warnings when adapters are missing", () => {
    const result = new AgentBuilder().setName("X").validate();
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("compute"))).toBe(true);
  });

  it("validate() returns errors for duplicate skills", () => {
    // Bypass the skill() guard by using configure()
    const b = new AgentBuilder().setName("X").configure({
      skills: [dummySkill, dummySkill],
    });
    const result = b.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("duplicate skill"))).toBe(true);
  });

  it("describe() returns correct descriptor", () => {
    const b = new AgentBuilder()
      .setName("TestAgent")
      .setVersion("1.2.3")
      .withTags("test")
      .skill(dummySkill)
      .use(dummyPlugin)
      .withTimeout(5000)
      .enableReflection(false);
    const d = b.describe();
    expect(d.name).toBe("TestAgent");
    expect(d.version).toBe("1.2.3");
    expect(d.skillCount).toBe(1);
    expect(d.pluginCount).toBe(1);
    expect(d.skillIds).toContain("test.skill");
    expect(d.pluginIds).toContain("test.plugin");
    expect(d.reflectionEnabled).toBe(false);
    expect(d.turnTimeoutMs).toBe(5000);
    expect(d.tags).toContain("test");
  });

  it("clone() produces an independent copy", () => {
    const base = new AgentBuilder().setName("Base").skill(dummySkill);
    const clone = base.clone();
    clone.setName("Clone");
    expect(base.toConfig().name).toBe("Base");
    expect(clone.toConfig().name).toBe("Clone");
    // Adding a skill to clone should not affect base
    const anotherSkill = defineSkill({
      manifest: { id: "other.skill", name: "Other", description: "", capabilities: [], version: "1.0.0" },
      execute: async () => ({}),
    });
    clone.skill(anotherSkill);
    expect(base.toConfig().skills?.length).toBe(1);
    expect(clone.toConfig().skills?.length).toBe(2);
  });

  it("build() throws when validation fails", async () => {
    const b = new AgentBuilder().configure({ name: "" });
    await expect(b.build()).rejects.toThrow("Invalid configuration");
  });

  it("build() succeeds with minimal valid config", async () => {
    const agent = await new AgentBuilder()
      .setName("MinimalAgent")
      .withCompute(new MockComputeAdapter())
      .build();
    expect(agent).toBeDefined();
    expect(typeof agent.run).toBe("function");
    await agent.destroy();
  });
});

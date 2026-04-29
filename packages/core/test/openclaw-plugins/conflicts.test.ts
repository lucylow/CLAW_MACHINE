import { describe, it, expect } from "vitest";
import { detectConflicts, detectExclusiveSlotViolations } from "../../src/openclaw-plugins/conflicts.js";
import type { PluginRecord } from "../../src/openclaw-plugins/contracts.js";

describe("plugin conflicts", () => {
  it("detects duplicate tool ownership", () => {
    const errors = detectConflicts([
      {
        manifest: { id: "a", name: "A", kind: "native", manifestPath: "a.json", entry: "x" },
        status: "enabled",
        shape: "non-capability",
        diagnostics: [],
        owners: { capabilities: [], tools: ["search"], commands: [], channels: [], services: [] },
      },
      {
        manifest: { id: "b", name: "B", kind: "native", manifestPath: "b.json", entry: "y" },
        status: "enabled",
        shape: "non-capability",
        diagnostics: [],
        owners: { capabilities: [], tools: ["search"], commands: [], channels: [], services: [] },
      },
    ] as PluginRecord[]);

    expect(errors.length).toBe(1);
  });

  it("ignores disabled plugins for ownership conflicts", () => {
    const errors = detectConflicts([
      {
        manifest: { id: "a", name: "A", kind: "native", manifestPath: "a.json", entry: "x" },
        status: "disabled",
        shape: "non-capability",
        diagnostics: [],
        owners: { capabilities: [], tools: ["search"], commands: [], channels: [], services: [] },
      },
      {
        manifest: { id: "b", name: "B", kind: "native", manifestPath: "b.json", entry: "y" },
        status: "enabled",
        shape: "non-capability",
        diagnostics: [],
        owners: { capabilities: [], tools: ["search"], commands: [], channels: [], services: [] },
      },
    ] as PluginRecord[]);

    expect(errors.length).toBe(0);
  });

  it("detects multiple enabled memory providers without a slot", () => {
    const base = {
      shape: "plain-capability" as const,
      diagnostics: [],
      owners: { capabilities: ["memory"], tools: [], commands: [], channels: [], services: [] },
    };
    const issues = detectExclusiveSlotViolations(
      [
        {
          manifest: {
            id: "m1",
            name: "M1",
            kind: "native",
            manifestPath: "a.json",
            entry: "e",
            capabilities: ["memory"],
          },
          status: "enabled",
          ...base,
        },
        {
          manifest: {
            id: "m2",
            name: "M2",
            kind: "native",
            manifestPath: "b.json",
            entry: "e",
            capabilities: ["memory"],
          },
          status: "enabled",
          ...base,
        },
      ],
      {}
    );
    expect(issues.length).toBe(1);
  });
});

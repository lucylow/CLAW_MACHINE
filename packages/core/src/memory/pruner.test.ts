import { describe, it, expect } from "vitest";
import { MemoryPruner, MemoryRecord } from "./pruner.js";

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    sessionId: "s1",
    type: "turn",
    importance: 0.5,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MemoryPruner", () => {
  it("does not evict pinned records (importance=1)", () => {
    const pruner = new MemoryPruner({ maxRecords: 1 });
    const records = [
      makeRecord({ importance: 1.0 }),
      makeRecord({ importance: 0.3 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    expect(records[0].importance).toBe(1.0);
  });

  it("evicts records below minImportance", () => {
    const pruner = new MemoryPruner({ minImportance: 0.1 });
    const records = [
      makeRecord({ importance: 0.05 }),
      makeRecord({ importance: 0.5 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    expect(records.every((r) => r.importance >= 0.1)).toBe(true);
  });

  it("evicts lowest-scoring records when over maxRecords", () => {
    const pruner = new MemoryPruner({ maxRecords: 2 });
    const records = [
      makeRecord({ importance: 0.9 }),
      makeRecord({ importance: 0.8 }),
      makeRecord({ importance: 0.1 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    expect(records.length).toBe(2);
  });

  it("lessons score higher than turns (type weight)", () => {
    const pruner = new MemoryPruner({ maxRecords: 1 });
    const records = [
      makeRecord({ type: "lesson",  importance: 0.5 }),
      makeRecord({ type: "turn",    importance: 0.5 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    // The turn should be evicted, lesson kept
    expect(records[0].type).toBe("lesson");
  });

  it("dryRun does not mutate records", () => {
    const pruner = new MemoryPruner({ maxRecords: 1 });
    const records = [makeRecord(), makeRecord()];
    const dry = pruner.dryRun(records);
    expect(dry.wouldRemove).toBe(1);
    expect(records.length).toBe(2); // unchanged
  });

  it("applyDecay reduces importance over time", () => {
    const pruner = new MemoryPruner({ halfLifeHours: 0.001 }); // very short half-life
    const oldDate = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
    const records = [makeRecord({ importance: 0.8, createdAt: oldDate })];
    pruner.applyDecay(records);
    expect(records[0].importance).toBeLessThan(0.8);
  });
});

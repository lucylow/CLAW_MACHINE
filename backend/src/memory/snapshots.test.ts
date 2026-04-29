import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  assertSnapshotChecksum,
  createDefaultSnapshotRegistry,
  createDefaultSnapshotService,
  FileSnapshotStore,
  MemorySnapshotService,
  SnapshotFactory,
} from "./snapshots";

describe("Memory snapshots", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "claw-snap-"));
  });

  it("migrates v1 reflection to v2 on write and preserves checksum", async () => {
    const service = createDefaultSnapshotService({ directory: dir });
    await service.init();
    await service.saveReflection({
      sessionId: "sess_a",
      payload: {
        rootCause: "Example root cause",
        mistakeSummary: "Example mistake",
        correctiveAdvice: "Example advice",
        severity: "high",
        confidence: 0.9,
        relatedSnapshotIds: [],
        lessonTags: ["example"],
      },
    });

    const rows = await service.getReflectionsForSession("sess_a");
    expect(rows.length).toBe(1);
    expect(rows[0].schemaVersion).toBe(2);
    expect(rows[0].payload).toMatchObject({
      rootCause: "Example root cause",
      nextBestAction: "Example advice",
    });
    expect(assertSnapshotChecksum(rows[0])).toBe(true);
  });

  it("rejects invalid conversation_turn payload", async () => {
    const registry = createDefaultSnapshotRegistry();
    const store = new FileSnapshotStore({
      directory: dir,
      registry,
      latestSchemaByKind: { conversation_turn: 2 },
    });
    await store.init();
    const bad = SnapshotFactory.create({
      kind: "conversation_turn",
      sessionId: "s",
      payload: { prompt: "", response: "x", selectedSkills: [], toolCalls: [] },
    });
    await expect(store.write(bad)).rejects.toThrow(/Invalid snapshot payload/);
  });

  it("readById returns migrated snapshot", async () => {
    const registry = createDefaultSnapshotRegistry();
    const store = new FileSnapshotStore({
      directory: dir,
      registry,
      latestSchemaByKind: { reflection: 2 },
    });
    const service = new MemorySnapshotService({ store, registry });
    await service.init();
    await service.saveReflection({
      sessionId: "sess_b",
      payload: {
        rootCause: "rc",
        mistakeSummary: "ms",
        correctiveAdvice: "ca",
        severity: "low",
        relatedSnapshotIds: [],
        lessonTags: [],
      },
    });
    const rows = await service.getReflectionsForSession("sess_b");
    const one = await store.readById(rows[0].id);
    expect(one?.schemaVersion).toBe(2);
    expect(assertSnapshotChecksum(one!)).toBe(true);
  });
});

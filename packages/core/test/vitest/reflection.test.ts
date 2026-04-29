import { describe, it, expect, vi } from "vitest";
import { MemoryOrchestrator } from "../../src/memory/orchestrator.js";
import type { AgentEpisode } from "../../src/memory/types.js";

describe("End-to-End Reflection & Learning Cycle", () => {
  it("triggers reflection and stores memory on task failure", async () => {
    const mockAdapter = {
      saveEpisode: vi.fn().mockResolvedValue({ ok: true, id: "ep-1" }),
      saveReflection: vi.fn().mockResolvedValue({ ok: true, id: "ref-kv" }),
    };
    const reflection = {
      id: "ref-1",
      streamId: "stream-1",
      episodeId: "ep-1",
      rootCause: "x",
      mistakeSummary: "y",
      correctiveAdvice: "z",
      severity: "low" as const,
      embedding: [0.1],
      createdAt: new Date().toISOString(),
    };
    const mockReflection = {
      generateReflection: vi.fn().mockResolvedValue(reflection),
    };

    const orchestrator = new MemoryOrchestrator(mockAdapter as never, mockReflection as never);
    const episode: AgentEpisode = {
      id: "ep-1",
      streamId: "stream-1",
      task: "test",
      outcome: "failure",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      trace: [],
    };
    await orchestrator.completeEpisode(episode);

    expect(mockReflection.generateReflection).toHaveBeenCalledWith(episode);
    expect(mockAdapter.saveReflection).toHaveBeenCalledWith(reflection);
  });

  it("does not reflect on success", async () => {
    const mockAdapter = {
      saveEpisode: vi.fn().mockResolvedValue({ ok: true, id: "ep-2" }),
      saveReflection: vi.fn(),
    };
    const mockReflection = { generateReflection: vi.fn() };
    const orchestrator = new MemoryOrchestrator(mockAdapter as never, mockReflection as never);
    await orchestrator.completeEpisode({
      id: "ep-2",
      streamId: "stream-1",
      task: "ok",
      outcome: "success",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      trace: [],
    });
    expect(mockReflection.generateReflection).not.toHaveBeenCalled();
    expect(mockAdapter.saveReflection).not.toHaveBeenCalled();
  });
});

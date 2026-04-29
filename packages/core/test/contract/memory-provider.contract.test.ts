import { describe, it, expect } from "vitest";
import { InMemoryMemoryProvider } from "../../src/adapters/mock/in-memory-memory.js";

describe("MemoryProvider contract", () => {
  it("saves and recalls reflections", async () => {
    const provider = new InMemoryMemoryProvider();

    const reflection = {
      id: "r1",
      streamId: "s1",
      episodeId: "e1",
      rootCause: "bad parsing",
      mistakeSummary: "parsed output wrong",
      correctiveAdvice: "validate schema",
      severity: "high" as const,
      embedding: [0.1, 0.2],
      createdAt: new Date().toISOString(),
    };

    await provider.saveReflection(reflection);
    const got = await provider.getReflection("r1");

    expect(got?.rootCause).toBe("bad parsing");
  });
});

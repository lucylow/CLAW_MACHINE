/**
 * MockComputeAdapter
 *
 * A deterministic mock compute adapter for testing and development.
 * Returns predictable responses without any network calls.
 */

import type { ComputeAdapter, LLMRequest, LLMResponse, EmbeddingRequest, EmbeddingResponse } from "../types.js";

export class MockComputeAdapter implements ComputeAdapter {
  readonly mode = "mock" as const;

  isAvailable(): boolean { return true; }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const content = lastUser
      ? `[mock] Acknowledged: "${lastUser.content.slice(0, 60)}${lastUser.content.length > 60 ? "..." : ""}"`
      : "[mock] No user message found.";
    return {
      content,
      model: "mock-v1",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
    };
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    // Deterministic pseudo-embeddings based on text hash
    const embeddings = request.texts.map((text) => {
      const seed = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
      return Array.from({ length: 1536 }, (_, i) =>
        Math.sin(seed * (i + 1) * 0.001) * 0.5,
      );
    });
    return { embeddings, model: "mock-embed-v1" };
  }
}

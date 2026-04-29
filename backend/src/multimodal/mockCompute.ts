import type { MultimodalComputeClient } from "../../../packages/core/src/multimodal/types";

export class MockMultimodalComputeClient implements MultimodalComputeClient {
  mode = "mock" as const;

  async generate(
    prompt: string,
    opts?: { temperature?: number; maxTokens?: number; json?: boolean; systemPrompt?: string; modelHint?: string },
  ) {
    const text = prompt.toLowerCase();
    if (text.includes("audio")) {
      return {
        text: "Mock audio transcription: a user is speaking about the task, asking the agent to summarize or act on the content.",
        confidence: 0.56,
        model: opts?.modelHint || "mock-audio",
        tokensUsed: 64,
        raw: { mode: "mock" },
      };
    }
    if (text.includes("image")) {
      return {
        text: "Mock image description: the input likely contains a screenshot, interface, chart, or diagram with relevant labels and structured visual information.",
        confidence: 0.58,
        model: opts?.modelHint || "mock-image",
        tokensUsed: 72,
        raw: { mode: "mock" },
      };
    }
    return {
      text: opts?.json
        ? JSON.stringify({
            rootCause: "The multimodal input needed stronger grounding.",
            mistakeSummary: "The model should extract clearer descriptions before reasoning.",
            correctiveAdvice: "Improve preprocessing and rerun.",
            severity: "medium",
            confidence: 0.73,
            nextBestAction: "Review multimodal descriptions and try again.",
            tags: ["multimodal", "mock"],
            relatedMemoryIds: [],
            summary: "Mock reflection generated.",
            details: "Mock mode output.",
          })
        : "Mock multimodal reasoning completed. Use the descriptions to continue the agent loop.",
      confidence: 0.7,
      model: opts?.modelHint || "mock-reasoner",
      tokensUsed: 96,
      raw: { mode: "mock" },
    };
  }
}

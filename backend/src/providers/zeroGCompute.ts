import type {
  MultimodalAsset,
  MultimodalConversationContext,
  MultimodalObservation,
  MultimodalReflection,
  MultimodalRequest,
  ZeroGComputeMultimodalClient,
  ZeroGMultimodalAnalysisResponse,
} from "../multimodal/types";
import { createId, nowIso, parseMaybeJson } from "../multimodal/utils";

export class ZeroGComputeMultimodalAdapter implements ZeroGComputeMultimodalClient {
  constructor(
    private readonly config: {
      endpoint: string;
      apiKey?: string;
      modelImage?: string;
      modelAudio?: string;
      modelFusion?: string;
      modelReflection?: string;
      fallbackToLocal?: boolean;
    },
  ) {}

  async analyzeImage(input: {
    prompt: string;
    image: MultimodalAsset;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse> {
    return this.post("/v1/multimodal/image", {
      model: this.config.modelImage ?? this.config.modelFusion ?? "0g-image-model",
      prompt: input.prompt,
      image: input.image,
      context: input.context,
      outputSchema: input.outputSchema,
    });
  }

  async analyzeAudio(input: {
    prompt: string;
    audio: MultimodalAsset;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse> {
    return this.post("/v1/multimodal/audio", {
      model: this.config.modelAudio ?? this.config.modelFusion ?? "0g-audio-model",
      prompt: input.prompt,
      audio: input.audio,
      context: input.context,
      outputSchema: input.outputSchema,
    });
  }

  async fuse(input: {
    prompt: string;
    observations: MultimodalObservation[];
    question?: string;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse> {
    return this.post("/v1/multimodal/fuse", {
      model: this.config.modelFusion ?? "0g-fusion-model",
      prompt: input.prompt,
      observations: input.observations,
      question: input.question,
      context: input.context,
      outputSchema: input.outputSchema,
    });
  }

  async reflect(input: {
    prompt: string;
    answer: string;
    observations: MultimodalObservation[];
    request: MultimodalRequest;
    context: MultimodalConversationContext;
  }): Promise<MultimodalReflection> {
    const response = await this.post("/v1/multimodal/reflection", {
      model: this.config.modelReflection ?? "0g-reflection-model",
      prompt: input.prompt,
      answer: input.answer,
      observations: input.observations,
      request: input.request,
      context: input.context,
    });

    let parsed: Record<string, unknown> | null =
      typeof response.structured === "object" && response.structured !== null
        ? (response.structured as Record<string, unknown>)
        : null;
    if (!parsed && response.text) {
      parsed = parseMaybeJson(response.text);
    }
    const reflection: MultimodalReflection = {
      reflectionId: String(parsed?.reflectionId ?? createId("refl")),
      sourceTurnId: String(parsed?.sourceTurnId ?? input.request.context.turnId ?? createId("turn")),
      rootCause: String(parsed?.rootCause ?? "Unknown root cause"),
      mistakeSummary: String(parsed?.mistakeSummary ?? "Unknown mistake summary"),
      correctiveAdvice: String(parsed?.correctiveAdvice ?? "Review the multimodal pipeline"),
      nextBestAction: String(parsed?.nextBestAction ?? "Retry with improved prompts and asset metadata"),
      severity: ["low", "medium", "high"].includes(String(parsed?.severity))
        ? (String(parsed?.severity) as MultimodalReflection["severity"])
        : "medium",
      tags: Array.isArray(parsed?.tags) ? (parsed?.tags as string[]) : ["multimodal", "reflection"],
      createdAt: String(parsed?.createdAt ?? nowIso()),
    };
    return reflection;
  }

  private async post(pathname: string, body: Record<string, unknown>): Promise<ZeroGMultimodalAnalysisResponse> {
    const url = `${this.config.endpoint.replace(/\/$/, "")}${pathname}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.config.apiKey ? { Authorization: `Bearer ${this.config.apiKey}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const json = (await res.json().catch(() => null)) as ZeroGMultimodalAnalysisResponse | null;
      if (!res.ok || !json) {
        throw new Error((json as ZeroGMultimodalAnalysisResponse | null)?.text || `0G Compute request failed with ${res.status}`);
      }
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Local sealed-inference substitute for development when no HTTP multimodal endpoint is configured. */
export class MockZeroGMultimodalComputeClient implements ZeroGComputeMultimodalClient {
  async analyzeImage(input: {
    prompt: string;
    image: MultimodalAsset;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse> {
    return {
      text: `[mock image] Scene and text cues for ${input.image.filename}. Instruction: ${input.prompt.slice(0, 200)}`,
      model: "mock-0g-image",
      requestId: createId("mm"),
      usage: { imageCount: 1, inputTokens: 128, outputTokens: 64 },
      structured: null,
    };
  }

  async analyzeAudio(input: {
    prompt: string;
    audio: MultimodalAsset;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse> {
    return {
      text: `[mock audio] Transcription placeholder for ${input.audio.filename}. User intent from prompt: ${input.prompt.slice(0, 160)}`,
      model: "mock-0g-audio",
      requestId: createId("mm"),
      usage: { audioSeconds: (input.audio.durationMs ?? 1000) / 1000, inputTokens: 96, outputTokens: 48 },
      structured: null,
    };
  }

  async fuse(input: {
    prompt: string;
    observations: MultimodalObservation[];
    question?: string;
    context?: MultimodalConversationContext;
    outputSchema?: Record<string, unknown>;
  }): Promise<ZeroGMultimodalAnalysisResponse> {
    const n = input.observations.length;
    return {
      text: `Synthesized answer from ${n} observation(s). Task: ${input.question || input.prompt.slice(0, 120)}`,
      model: "mock-0g-fusion",
      requestId: createId("mm"),
      usage: { inputTokens: 256, outputTokens: 128 },
      structured: null,
    };
  }

  async reflect(input: {
    prompt: string;
    answer: string;
    observations: MultimodalObservation[];
    request: MultimodalRequest;
    context: MultimodalConversationContext;
  }): Promise<MultimodalReflection> {
    return {
      reflectionId: createId("refl"),
      sourceTurnId: input.context.turnId ?? createId("turn"),
      rootCause: "Mock reflection — verify production 0G multimodal endpoint for real TEE-backed critique",
      mistakeSummary: "No mistakes recorded in mock mode",
      correctiveAdvice: "Wire ZERO_G_MULTIMODAL_ENDPOINT for sealed inference",
      nextBestAction: "Run the same request against production compute",
      severity: "low",
      tags: ["multimodal", "mock", "reflection"],
      createdAt: nowIso(),
    };
  }
}

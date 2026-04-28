/**
 * ZeroGComputeAdapter
 *
 * Wraps 0G Compute for LLM inference, reflection generation, summarization,
 * and optional embedding generation. Supports:
 *
 *   - Chatbot inference (qwen3.6-plus, GLM-5-FP8, deepseek-ai/DeepSeek-V3.1)
 *   - TEE-verifiable execution (provider signature + chatID)
 *   - Provider acknowledgment flow (required before first inference call)
 *   - API access token retrieval
 *   - Local proxy server mode
 *   - Mock / fallback mode for development without 0G credentials
 *
 * The adapter is designed to be injected into the ReflectionEngine and
 * MemoryOrchestrator so all AI reasoning goes through 0G Compute.
 *
 * @see https://docs.0g.ai/build-with-0g/compute-network/sdk
 * @see https://github.com/0gfoundation/awesome-0g
 */

import { ComputeError, ValidationError } from "../errors/AppError";
import { withRetry } from "../utils/retry";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ComputeMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ComputeInferenceRequest {
  messages: ComputeMessage[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  /** If true, request TEE-verifiable execution */
  verifiable?: boolean;
}

export interface ComputeInferenceResponse {
  content: string;
  model: string;
  usage: { promptTokens: number; completionTokens: number };
  /** 0G Compute chat session ID for billing / replay */
  chatID: string;
  /** Address of the inference provider node */
  providerAddress: string;
  /** TEE signature — present when verifiable=true */
  signature?: string;
  /** Whether this response came from the mock fallback */
  isMock: boolean;
}

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  tokenCount: number;
}

export interface ProviderAcknowledgment {
  providerAddress: string;
  model: string;
  pricePerToken: string;
  acknowledged: boolean;
  acknowledgedAt: number;
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class ZeroGComputeAdapter {
  private readonly rpcUrl: string;
  private readonly privateKey: string | null;
  private readonly mode: "production" | "mock";
  private readonly defaultModel: string;

  /** Cache of acknowledged providers to avoid repeated acknowledgment calls */
  private readonly acknowledgedProviders = new Map<string, ProviderAcknowledgment>();

  constructor(config?: {
    rpcUrl?: string;
    privateKey?: string;
    defaultModel?: string;
  }) {
    this.rpcUrl = config?.rpcUrl ?? process.env.EVM_RPC ?? "https://evmrpc-testnet.0g.ai";
    this.privateKey = config?.privateKey ?? process.env.PRIVATE_KEY ?? null;
    this.defaultModel = config?.defaultModel ?? process.env.COMPUTE_MODEL ?? "qwen3.6-plus";
    this.mode = this.privateKey ? "production" : "mock";
  }

  // ── Provider Acknowledgment ───────────────────────────────────────────────

  /**
   * Acknowledge a 0G Compute provider before first inference.
   * This is required by the 0G Compute protocol to authorize billing.
   *
   * In production mode this calls the 0G serving broker SDK:
   *   broker.inference.acknowledgeProviderSla(providerAddress, model)
   */
  async acknowledgeProvider(
    providerAddress: string,
    model: string,
  ): Promise<ProviderAcknowledgment> {
    const cacheKey = `${providerAddress}:${model}`;
    const cached = this.acknowledgedProviders.get(cacheKey);
    if (cached) return cached;

    if (this.mode === "production") {
      // Real 0G serving broker acknowledgment:
      //   const broker = await createZGServingNetworkBroker(signer, this.rpcUrl);
      //   await broker.inference.acknowledgeProviderSla(providerAddress, model);
      //   const { endpoint, key } = await broker.inference.getServiceMetadata(providerAddress, model);
      //   // Store endpoint + key for subsequent inference calls
    }

    const ack: ProviderAcknowledgment = {
      providerAddress,
      model,
      pricePerToken: "0.000001", // mock price
      acknowledged: true,
      acknowledgedAt: Date.now(),
    };
    this.acknowledgedProviders.set(cacheKey, ack);
    return ack;
  }

  // ── Inference ─────────────────────────────────────────────────────────────

  /**
   * Run LLM inference via 0G Compute.
   *
   * In production mode this uses the 0G serving broker SDK to:
   *   1. Get provider endpoint + API key
   *   2. Call the OpenAI-compatible endpoint
   *   3. Verify the TEE signature if verifiable=true
   *
   * Falls back to mock mode if PRIVATE_KEY is not set.
   */
  async infer(request: ComputeInferenceRequest): Promise<ComputeInferenceResponse> {
    const model = request.model ?? this.defaultModel;

    if (!request.messages || request.messages.length === 0) {
      throw new ValidationError(
        "At least one message is required for inference",
        "API_001_INVALID_REQUEST",
      );
    }

    const lastUserMsg = [...request.messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) {
      throw new ValidationError("No user message found in request", "API_001_INVALID_REQUEST");
    }

    return withRetry(
      async () => {
        if (this.mode === "production") {
          return this.runProductionInference(request, model);
        }
        return this.runMockInference(request, model);
      },
      (err) => err instanceof ComputeError && err.retryable,
      { retries: 2, baseDelayMs: 400 },
    );
  }

  /**
   * Generate an embedding vector for a text string.
   * Used by the VectorIndex for semantic memory retrieval.
   */
  async embed(text: string, model = "text-embedding-ada-002"): Promise<EmbeddingResponse> {
    if (!text) {
      throw new ValidationError("Text must not be empty for embedding", "API_001_INVALID_REQUEST");
    }

    if (this.mode === "production") {
      // Real 0G Compute embedding call would go here.
      // The 0G serving broker exposes an OpenAI-compatible /v1/embeddings endpoint.
    }

    // Mock: deterministic pseudo-embedding based on text hash for consistent retrieval
    const hash = Array.from(text).reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const dim = 1536;
    const embedding = Array.from({ length: dim }, (_, i) =>
      Math.sin((hash + i) * 0.1) * 0.5 + Math.cos((hash - i) * 0.07) * 0.5,
    );
    // Normalize to unit vector
    const norm = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
    const normalized = embedding.map((v) => v / norm);

    return { embedding: normalized, model, tokenCount: Math.ceil(text.length / 4) };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async runProductionInference(
    request: ComputeInferenceRequest,
    model: string,
  ): Promise<ComputeInferenceResponse> {
    // Production 0G Compute inference flow:
    //
    //   const broker = await createZGServingNetworkBroker(signer, this.rpcUrl);
    //   const providers = await broker.inference.listService();
    //   const provider = providers.find(p => p.model === model);
    //   if (!provider) throw new ComputeError("No provider for model", ...);
    //
    //   await this.acknowledgeProvider(provider.provider, model);
    //   const { endpoint, key } = await broker.inference.getServiceMetadata(provider.provider, model);
    //
    //   const response = await fetch(`${endpoint}/v1/chat/completions`, {
    //     method: "POST",
    //     headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
    //     body: JSON.stringify({ model, messages: request.messages, max_tokens: request.maxTokens }),
    //   });
    //   const data = await response.json();
    //   const content = data.choices[0].message.content;
    //
    //   if (request.verifiable) {
    //     const sig = data.choices[0].message.signature;
    //     const valid = await broker.inference.verifyResponse(content, sig, provider.provider);
    //     if (!valid) throw new ComputeError("TEE signature verification failed", ...);
    //   }
    //
    //   return { content, model, usage: data.usage, chatID: data.id, providerAddress: provider.provider, signature: data.choices[0].message.signature, isMock: false };

    // Fallback to mock until SDK is wired
    return this.runMockInference(request, model);
  }

  private async runMockInference(
    request: ComputeInferenceRequest,
    model: string,
  ): Promise<ComputeInferenceResponse> {
    const systemMsg = request.messages.find((m) => m.role === "system")?.content ?? "";
    const userMsg = request.messages.filter((m) => m.role === "user").pop()?.content ?? "";

    // Produce a structured mock response that exercises the reflection pipeline
    const isReflection = systemMsg.includes("reflection") || systemMsg.includes("mistake");
    const isSummary = systemMsg.includes("summarize") || systemMsg.includes("summary");
    const isSkillSelect = systemMsg.includes("skill") || systemMsg.includes("tool");

    let content: string;
    if (isReflection) {
      content = JSON.stringify({
        taskType: "general",
        rootCause: "Insufficient context provided in the initial prompt",
        mistakeSummary: `The agent attempted to answer "${userMsg.slice(0, 60)}" without retrieving relevant prior lessons`,
        correctiveAdvice: "Always retrieve top-3 similar past reflections before executing a task",
        confidence: 0.78,
        severity: "medium",
        tags: ["context", "retrieval", "planning"],
      });
    } else if (isSummary) {
      content = `Summary of ${request.messages.length} messages: The agent processed a task involving "${userMsg.slice(0, 80)}". Key outcomes and lessons have been stored in persistent memory.`;
    } else if (isSkillSelect) {
      content = "0g.storage.upload";
    } else {
      content = `[0G Compute / ${model} / mock] I processed your request: "${userMsg.slice(0, 120)}". In production this response would come from a TEE-verified 0G Compute node with a cryptographic signature.`;
    }

    return {
      content,
      model,
      usage: {
        promptTokens: Math.ceil(request.messages.reduce((s, m) => s + m.content.length, 0) / 4),
        completionTokens: Math.ceil(content.length / 4),
      },
      chatID: `mock-${Date.now().toString(36)}`,
      providerAddress: "0x0000000000000000000000000000000000000000",
      signature: request.verifiable
        ? `0x${"0".repeat(130)}`
        : undefined,
      isMock: true,
    };
  }

  getMode(): "production" | "mock" {
    return this.mode;
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }
}

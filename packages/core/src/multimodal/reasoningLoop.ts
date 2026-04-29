import { buildReasoningPrompt } from "./computePrompts.js";
import { MultimodalPreprocessor } from "./preprocess.js";
import type { AgentBus } from "./agentBus.js";
import type {
  AgentBusEnvelope,
  MultimodalComputeClient,
  MultimodalInput,
  MultimodalStorageClient,
  MultimodalProcessContext,
  ReasoningLoopResult,
} from "./types.js";
import { safeJsonParse, uuid } from "./utils.js";

export interface ReasoningLoopDeps {
  compute: MultimodalComputeClient;
  storage: MultimodalStorageClient;
  bus?: AgentBus;
  options?: {
    allowMockFallback?: boolean;
    maxAssets?: number;
    imageDetailLevel?: "low" | "medium" | "high";
    audioDetailLevel?: "low" | "medium" | "high";
  };
}

export class MultimodalReasoningLoop {
  private readonly preprocessor: MultimodalPreprocessor;
  private readonly compute: MultimodalComputeClient;
  private readonly storage: MultimodalStorageClient;
  private readonly bus?: AgentBus;

  constructor(deps: ReasoningLoopDeps) {
    this.compute = deps.compute;
    this.storage = deps.storage;
    this.bus = deps.bus;
    this.preprocessor = new MultimodalPreprocessor({
      compute: deps.compute,
      options: {
        allowMockFallback: deps.options?.allowMockFallback ?? true,
        maxAssets: deps.options?.maxAssets ?? 12,
        imageDetailLevel: deps.options?.imageDetailLevel ?? "medium",
        audioDetailLevel: deps.options?.audioDetailLevel ?? "medium",
      },
    });
  }

  async run(input: MultimodalInput): Promise<ReasoningLoopResult> {
    const requestId = input.requestId || uuid("req");
    const multimodal = await this.preprocessor.process({ ...input, requestId });
    const ctx: MultimodalProcessContext = await this.preprocessor.createReasoningContext({ ...input, requestId });
    const prompt = buildReasoningPrompt(ctx);

    const answer = await this.compute.generate(prompt, {
      temperature: 0.2,
      maxTokens: 900,
      json: false,
      systemPrompt: [
        "You are CLAW MACHINE.",
        "Use multimodal grounding and memory when reasoning.",
        "Be concise and actionable.",
      ].join("\n"),
      modelHint: "multimodal-reasoning",
    });

    const reflection = await this.maybeGenerateReflection({
      sessionId: input.sessionId,
      walletAddress: input.walletAddress,
      requestId,
      userText: input.userText || "",
      multimodal,
      answerText: answer.text,
      context: input.context || {},
    });

    const warnings = [...multimodal.warnings];
    let busMessages: AgentBusEnvelope[] | undefined;
    if (this.bus) {
      busMessages = await this.broadcastReasoningArtifacts({
        sessionId: input.sessionId,
        walletAddress: input.walletAddress,
        requestId,
        multimodal,
        answer: answer.text,
        reflection,
      });
    }

    return {
      ok: true,
      sessionId: input.sessionId,
      requestId,
      answer: answer.text,
      reflection,
      multimodal,
      busMessages,
      warnings,
    };
  }

  private async maybeGenerateReflection(input: {
    sessionId: string;
    walletAddress?: string;
    requestId: string;
    userText: string;
    multimodal: Awaited<ReturnType<MultimodalPreprocessor["process"]>>;
    answerText: string;
    context: Record<string, unknown>;
  }): Promise<Record<string, unknown> | undefined> {
    const hasErrorSignals =
      input.multimodal.warnings.length > 0 ||
      /error|failed|exception|invalid|timeout|broken/i.test(input.userText) ||
      /error|failed|exception|invalid|timeout|broken/i.test(input.answerText);
    if (!hasErrorSignals && input.multimodal.confidence > 0.65) return undefined;

    const prompt = [
      "Generate a compact reflection for the multimodal reasoning run.",
      "Return JSON with: rootCause, mistakeSummary, correctiveAdvice, severity, confidence, nextBestAction, tags, relatedMemoryIds, summary, details.",
      `Session: ${input.sessionId}`,
      `Request: ${input.requestId}`,
      input.walletAddress ? `Wallet: ${input.walletAddress}` : "",
      `User text: ${input.userText}`,
      `Answer: ${input.answerText}`,
      `Descriptions: ${input.multimodal.descriptions.join(" | ")}`,
      `Warnings: ${input.multimodal.warnings.join(", ")}`,
      `Context: ${JSON.stringify(input.context || {})}`,
    ].join("\n");

    const result = await this.compute.generate(prompt, {
      temperature: 0.12,
      maxTokens: 520,
      json: true,
      modelHint: "multimodal-reflection",
      systemPrompt: "Return only JSON.",
    });
    const parsed = safeJsonParse<Record<string, unknown>>(result.text, {});
    const reflection = normalizeReflection(parsed, {
      sessionId: input.sessionId,
      walletAddress: input.walletAddress,
      requestId: input.requestId,
      userText: input.userText,
      answerText: input.answerText,
      descriptions: input.multimodal.descriptions,
      warnings: input.multimodal.warnings,
    });
    await this.persistReflection(input.sessionId, input.walletAddress, reflection);
    return reflection;
  }

  private async persistReflection(sessionId: string, walletAddress: string | undefined, reflection: Record<string, unknown>): Promise<void> {
    await this.storage.put(`multimodal/reflections/${sessionId}/${Date.now()}.json`, reflection, {
      contentType: "application/json",
      compress: true,
      encrypt: false,
      ttlMs: 1000 * 60 * 60 * 24 * 180,
      metadata: { kind: "multimodal_reflection", sessionId, walletAddress: walletAddress || "" },
    });
  }

  private async broadcastReasoningArtifacts(input: {
    sessionId: string;
    walletAddress?: string;
    requestId: string;
    multimodal: Awaited<ReturnType<MultimodalPreprocessor["process"]>>;
    answer: string;
    reflection?: Record<string, unknown>;
  }): Promise<AgentBusEnvelope[]> {
    if (!this.bus) return [];
    const messages: AgentBusEnvelope[] = [];
    const payloadBase = {
      sessionId: input.sessionId,
      requestId: input.requestId,
      walletAddress: input.walletAddress,
      summary: input.multimodal.summary,
      descriptions: input.multimodal.descriptions,
      answer: input.answer,
      reflection: input.reflection || null,
    };

    if (input.multimodal.artifacts.length) {
      const msg = await this.bus.send({
        topic: "multimodal.artifact",
        fromAgent: "multimodal.reasoning",
        toAgent: "memory",
        sessionId: input.sessionId,
        requestId: input.requestId,
        walletAddress: input.walletAddress,
        priority: "normal",
        deliveryMode: "at_least_once",
        tags: ["multimodal", "artifact"],
        payload: { ...payloadBase, artifacts: input.multimodal.artifacts },
      });
      messages.push(msg);
    }

    const msg2 = await this.bus.send({
      topic: "multimodal.reasoning.complete",
      fromAgent: "multimodal.reasoning",
      toAgent: "agent.coordinator",
      sessionId: input.sessionId,
      requestId: input.requestId,
      walletAddress: input.walletAddress,
      priority: "high",
      deliveryMode: "at_least_once",
      tags: ["multimodal", "reasoning"],
      payload: payloadBase,
    });
    messages.push(msg2);
    return messages;
  }
}

function normalizeReflection(
  parsed: Record<string, unknown>,
  fallback: {
    sessionId: string;
    walletAddress?: string;
    requestId: string;
    userText: string;
    answerText: string;
    descriptions: string[];
    warnings: string[];
  },
): Record<string, unknown> {
  return {
    sessionId: fallback.sessionId,
    walletAddress: fallback.walletAddress,
    sourceTurnId: fallback.requestId,
    taskType: "multimodal_reasoning",
    outcome: fallback.warnings.length ? "partial" : "success",
    rootCause: stringOrFallback(parsed.rootCause, "The multimodal pipeline did not have enough grounding."),
    mistakeSummary: stringOrFallback(parsed.mistakeSummary, "The run needs a more focused visual or audio description."),
    correctiveAdvice: stringOrFallback(parsed.correctiveAdvice, "Tighten preprocessing, extract clearer descriptions, and retry."),
    confidence: numberOrFallback(parsed.confidence, fallback.warnings.length ? 0.72 : 0.84),
    severity: stringOrFallback(parsed.severity, fallback.warnings.length ? "medium" : "low"),
    tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : ["multimodal", "reflection"],
    relatedMemoryIds: Array.isArray(parsed.relatedMemoryIds) ? parsed.relatedMemoryIds.map(String) : [],
    nextBestAction: stringOrFallback(parsed.nextBestAction, "Repeat preprocessing with stronger grounding."),
    summary: stringOrFallback(parsed.summary, "Multimodal reasoning reflection recorded."),
    details: stringOrFallback(parsed.details, `Descriptions: ${fallback.descriptions.join(" | ")}; Answer: ${fallback.answerText}`),
  };
}

function stringOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function numberOrFallback(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

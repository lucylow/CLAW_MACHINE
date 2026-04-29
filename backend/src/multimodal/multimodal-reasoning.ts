import path from "node:path";
import type {
  MultimodalAsset,
  MultimodalConversationContext,
  MultimodalErrorShape,
  MultimodalFusionPlan,
  MultimodalObservation,
  MultimodalPipelineOptions,
  MultimodalReflection,
  MultimodalRequest,
  MultimodalTaskType,
  MultimodalReasoningResult,
  NormalizedAssetResult,
  UploadedAssetInput,
  ZeroGMultimodalAnalysisResponse,
} from "./types";
import {
  assert,
  buildError,
  clamp,
  collectAssets,
  confidenceToBand,
  createId,
  isProbablyAudioMime,
  isProbablyImageMime,
  normalizeWords,
  nowIso,
  parseMaybeJson,
  safeString,
  sha256,
  summarizeText,
  uniqueStepId,
  uniqueStrings,
} from "./utils";

export * from "./types";
export { collectAssets, sha256, normalizeWords, summarizeText, safeString, tokenize } from "./utils";

export class MultimodalAssetNormalizer {
  static normalize(
    input: UploadedAssetInput,
    options: {
      maxImageSizeBytes: number;
      maxAudioSizeBytes: number;
      maxAudioDurationMs: number;
    },
  ): NormalizedAssetResult {
    const warnings: string[] = [];

    assert(
      input.kind === "image" ? isProbablyImageMime(input.mimeType) : isProbablyAudioMime(input.mimeType),
      buildError(
        "MM_001_INVALID_MIME",
        "File mime type does not match declared modality",
        "validation",
        { kind: input.kind, mimeType: input.mimeType },
        false,
        false,
      ),
    );

    if (input.kind === "image") {
      assert(
        input.buffer.length <= options.maxImageSizeBytes,
        buildError("MM_002_IMAGE_TOO_LARGE", "Image exceeds the configured maximum size", "validation", {
          sizeBytes: input.buffer.length,
          maxSizeBytes: options.maxImageSizeBytes,
        }),
      );
    }

    if (input.kind === "audio") {
      assert(
        input.buffer.length <= options.maxAudioSizeBytes,
        buildError("MM_003_AUDIO_TOO_LARGE", "Audio exceeds the configured maximum size", "validation", {
          sizeBytes: input.buffer.length,
          maxSizeBytes: options.maxAudioSizeBytes,
        }),
      );
    }

    const asset: MultimodalAsset = {
      id: createId(`asset_${input.kind}`),
      kind: input.kind,
      mimeType: input.mimeType,
      filename: input.filename,
      sizeBytes: input.buffer.length,
      sha256: sha256(input.buffer),
      base64: input.buffer.toString("base64"),
      metadata: input.metadata ?? {},
    };

    if (input.kind === "audio") {
      asset.durationMs = Math.min(options.maxAudioDurationMs, Math.round(input.buffer.length / 32));
      if (asset.durationMs >= options.maxAudioDurationMs) {
        warnings.push("Audio duration was estimated and capped by configured maximum.");
      }
    }

    if (input.kind === "image") {
      warnings.push("Image dimensions were not extracted in this helper. Use a metadata extractor if available.");
    }

    return { asset, warnings };
  }

  static fromUri(input: {
    kind: "image" | "audio";
    uri: string;
    filename?: string;
    mimeType: string;
    sizeBytes?: number;
    metadata?: Record<string, unknown>;
  }): MultimodalAsset {
    return {
      id: createId(`asset_${input.kind}`),
      kind: input.kind,
      mimeType: input.mimeType,
      filename: input.filename ?? path.basename(input.uri),
      sizeBytes: input.sizeBytes ?? 0,
      sha256: sha256(input.uri),
      uri: input.uri,
      metadata: input.metadata ?? {},
    };
  }
}

export class MultimodalPlanBuilder {
  static build(request: MultimodalRequest): MultimodalFusionPlan {
    const modalities: Array<"image" | "audio" | "text" | "mixed"> = [];
    const steps: MultimodalFusionPlan["steps"] = [];

    const assets = collectAssets(request);
    const hasText = Boolean(request.prompt || request.question || request.text);
    const hasImages = assets.some((a) => a.kind === "image");
    const hasAudio = assets.some((a) => a.kind === "audio");

    if (hasText) modalities.push("text");
    if (hasImages) modalities.push("image");
    if (hasAudio) modalities.push("audio");

    const stepIds = new Set<string>();

    if (hasAudio) {
      steps.push({
        stepId: uniqueStepId(stepIds, "transcribe_audio"),
        kind: "transcribe",
        description: "Transcribe audio into searchable text and note tone/speaker cues.",
        inputRefs: assets.filter((a) => a.kind === "audio").map((a) => a.id),
      });
    }

    if (hasImages) {
      steps.push({
        stepId: uniqueStepId(stepIds, "analyze_image"),
        kind: "describe",
        description: "Describe the visual scene, detect text, structure, and key objects.",
        inputRefs: assets.filter((a) => a.kind === "image").map((a) => a.id),
      });
    }

    if (hasText) {
      steps.push({
        stepId: uniqueStepId(stepIds, "extract_text_intent"),
        kind: "extract",
        description: "Extract the user intent from the textual instruction or question.",
        inputRefs: ["prompt"],
      });
    }

    steps.push({
      stepId: uniqueStepId(stepIds, "fuse_evidence"),
      kind: "fuse",
      description: "Fuse all modality observations into a single reasoning context.",
      inputRefs: assets.map((a) => a.id).concat(hasText ? ["prompt"] : []),
    });

    steps.push({
      stepId: uniqueStepId(stepIds, "answer_user"),
      kind: "answer",
      description: "Generate a final response with the requested output format.",
      inputRefs: [],
    });

    return {
      intent: request.taskType,
      modalities: uniqueStrings(modalities) as MultimodalFusionPlan["modalities"],
      steps,
      expectedOutput: request.outputSchema ? "json" : request.hints?.preferStructuredOutput ? "structured" : "text",
      needsReflection: true,
    };
  }
}

export class MultimodalPromptBuilder {
  static buildImagePrompt(request: MultimodalRequest, image: MultimodalAsset): string {
    const objective = request.taskType;
    const base = request.prompt || request.question || request.text || "Analyze the image carefully.";

    return normalizeWords(`
      You are CLAW MACHINE, a multimodal AI agent running on 0G Compute.

      Task type: ${objective}
      User instruction: ${base}

      Analyze the image with the following priorities:
      1. Identify the primary subject or scene.
      2. Detect visible text, labels, diagrams, charts, UI elements, symbols, and annotations.
      3. Note composition, relationships, and any notable changes, error states, or instructions.
      4. If the image is a screenshot, infer application state, UI purpose, and likely workflow.
      5. If the image is a diagram, explain the structure and the flow of information.
      6. If the image is a document or slide, summarize the key claims and layout.
      7. If there is ambiguity, state it explicitly and propose the most likely interpretation.

      Return concise but thorough analysis. If structured output is requested, emit valid JSON only.

      Asset metadata:
      - filename: ${image.filename}
      - mimeType: ${image.mimeType}
      - sha256: ${image.sha256}
      - sizeBytes: ${image.sizeBytes}
    `);
  }

  static buildAudioPrompt(request: MultimodalRequest, audio: MultimodalAsset): string {
    const objective = request.taskType;
    const base = request.prompt || request.question || request.text || "Transcribe and reason over the audio.";

    return normalizeWords(`
      You are CLAW MACHINE, a multimodal AI agent running on 0G Compute.

      Task type: ${objective}
      User instruction: ${base}

      Analyze the audio with the following priorities:
      1. Transcribe the speech accurately.
      2. Preserve names, numbers, URLs, code, product names, and technical phrases.
      3. Identify speaker count if possible.
      4. Note tone, sentiment, urgency, hesitation, or emphasis.
      5. If the audio contains instructions, extract the action items.
      6. If the audio is noisy or ambiguous, mark the uncertain spans.
      7. If structured output is requested, emit valid JSON only.

      Asset metadata:
      - filename: ${audio.filename}
      - mimeType: ${audio.mimeType}
      - sha256: ${audio.sha256}
      - sizeBytes: ${audio.sizeBytes}
      - durationMs: ${audio.durationMs ?? "unknown"}
    `);
  }

  static buildFusionPrompt(request: MultimodalRequest, observations: MultimodalObservation[]): string {
    const base = request.prompt || request.question || request.text || "Answer the user based on all provided evidence.";
    const observationSection = observations
      .map((obs, index) => {
        return [
          `Observation ${index + 1}:`,
          `- modality: ${obs.modality}`,
          `- source: ${obs.source}`,
          `- title: ${obs.title}`,
          `- summary: ${obs.summary}`,
          obs.rawText ? `- rawText: ${obs.rawText}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      })
      .join("\n\n");

    return normalizeWords(`
      You are CLAW MACHINE, a multimodal reasoning engine.

      User task:
      ${base}

      Use the following evidence to answer the task.
      Prefer grounded, explicit reasoning over speculation.
      If there are conflicts across modalities, explain the conflict and choose the most credible interpretation.
      If the user asked for a structured response, return valid JSON only.

      Evidence:
      ${observationSection}
    `);
  }

  static buildReflectionPrompt(input: {
    request: MultimodalRequest;
    answer: string;
    observations: MultimodalObservation[];
    warnings: string[];
  }): string {
    const assetSummary = collectAssets(input.request)
      .map((a) => `- ${a.kind}: ${a.filename} (${a.mimeType}, ${a.sizeBytes} bytes)`)
      .join("\n");

    const obsSummary = input.observations
      .map((obs) => `- ${obs.modality}: ${obs.summary} [confidence=${obs.confidence.toFixed(2)}]`)
      .join("\n");

    return normalizeWords(`
      You are CLAW MACHINE generating a reflection on a multimodal turn.

      Request task type: ${input.request.taskType}
      User prompt: ${input.request.prompt || input.request.question || input.request.text || "n/a"}

      Assets:
      ${assetSummary || "- none"}

      Observations:
      ${obsSummary || "- none"}

      Answer produced:
      ${input.answer}

      Warnings:
      ${input.warnings.length ? input.warnings.map((w) => `- ${w}`).join("\n") : "- none"}

      Produce a reflection in JSON with the following keys:
      {
        "rootCause": "...",
        "mistakeSummary": "...",
        "correctiveAdvice": "...",
        "nextBestAction": "...",
        "severity": "low|medium|high",
        "tags": ["..."],
        "confidence": 0.0
      }
    `);
  }
}

export class MultimodalObservationBuilder {
  static fromImageResponse(response: ZeroGMultimodalAnalysisResponse, asset: MultimodalAsset): MultimodalObservation {
    return {
      source: "0g-compute",
      modality: "image",
      assetId: asset.id,
      title: `Image analysis: ${asset.filename}`,
      summary: summarizeText(response.text),
      rawText: response.text,
      confidence: response.usage?.imageCount ? 0.9 : 0.8,
      tags: uniqueStrings(["image", asset.mimeType, "visual-analysis"]),
      metadata: {
        model: response.model,
        requestId: response.requestId,
        structured: response.structured ?? null,
        warnings: response.warnings ?? [],
        usage: response.usage ?? null,
      },
    };
  }

  static fromAudioResponse(response: ZeroGMultimodalAnalysisResponse, asset: MultimodalAsset): MultimodalObservation {
    return {
      source: "0g-compute",
      modality: "audio",
      assetId: asset.id,
      title: `Audio analysis: ${asset.filename}`,
      summary: summarizeText(response.text),
      rawText: response.text,
      confidence: response.usage?.audioSeconds ? 0.9 : 0.8,
      tags: uniqueStrings(["audio", asset.mimeType, "transcription"]),
      metadata: {
        model: response.model,
        requestId: response.requestId,
        structured: response.structured ?? null,
        warnings: response.warnings ?? [],
        usage: response.usage ?? null,
      },
    };
  }

  static fromFusionResponse(response: ZeroGMultimodalAnalysisResponse, taskType: MultimodalTaskType): MultimodalObservation {
    return {
      source: "0g-compute",
      modality: "mixed",
      title: `Fusion result: ${taskType}`,
      summary: summarizeText(response.text),
      rawText: response.text,
      confidence: response.structured ? 0.95 : 0.85,
      tags: uniqueStrings(["fusion", taskType]),
      metadata: {
        model: response.model,
        requestId: response.requestId,
        structured: response.structured ?? null,
        warnings: response.warnings ?? [],
        usage: response.usage ?? null,
      },
    };
  }
}

export class MultimodalReasoningPipeline {
  private readonly compute: MultimodalPipelineOptions["compute"];
  private readonly memory: MultimodalPipelineOptions["memory"];
  private readonly events?: MultimodalPipelineOptions["events"];
  private readonly logger?: MultimodalPipelineOptions["logger"];
  private readonly fallbackMode: "mock" | "disabled";
  private readonly limits: Required<
    Pick<
      MultimodalPipelineOptions,
      | "maxImageAssets"
      | "maxAudioAssets"
      | "maxTotalAssets"
      | "maxAudioDurationMs"
      | "maxImageSizeBytes"
      | "maxAudioSizeBytes"
    >
  >;

  constructor(options: MultimodalPipelineOptions) {
    this.compute = options.compute;
    this.memory = options.memory;
    this.events = options.events;
    this.logger = options.logger;
    this.fallbackMode = options.fallbackMode ?? "mock";
    this.limits = {
      maxImageAssets: options.maxImageAssets ?? 4,
      maxAudioAssets: options.maxAudioAssets ?? 2,
      maxTotalAssets: options.maxTotalAssets ?? 6,
      maxAudioDurationMs: options.maxAudioDurationMs ?? 10 * 60 * 1000,
      maxImageSizeBytes: options.maxImageSizeBytes ?? 18 * 1024 * 1024,
      maxAudioSizeBytes: options.maxAudioSizeBytes ?? 32 * 1024 * 1024,
    };
  }

  async run(request: MultimodalRequest): Promise<MultimodalReasoningResult> {
    const requestId = request.context.requestId ?? createId("req");
    const sessionId = request.context.sessionId;
    const turnId = request.context.turnId ?? createId("turn");
    const warnings: string[] = [];
    const assets = collectAssets(request);

    this.validateRequest(request, assets);

    this.emit("multimodal.run.started", {
      requestId,
      sessionId,
      turnId,
      taskType: request.taskType,
      imageCount: assets.filter((a) => a.kind === "image").length,
      audioCount: assets.filter((a) => a.kind === "audio").length,
    });

    const plan = MultimodalPlanBuilder.build(request);
    const observations: MultimodalObservation[] = [];

    try {
      const textInput = this.buildPrimaryTextInput(request);
      const cachedContext = await this.memory.searchSimilar({
        sessionId,
        query: textInput,
        limit: 5,
      });

      if (cachedContext.length > 0) {
        warnings.push(`Loaded ${cachedContext.length} similar memories to improve grounding.`);
        this.emit("multimodal.memory.loaded", {
          requestId,
          sessionId,
          turnId,
          memoryCount: cachedContext.length,
        });
      }

      if (assets.length > 0) {
        for (const asset of assets) {
          if (asset.kind === "image") {
            const observation = await this.analyzeImageAsset(request, asset, textInput);
            observations.push(observation);
            await this.persistObservation(sessionId, turnId, requestId, observation);
          }
          if (asset.kind === "audio") {
            const observation = await this.analyzeAudioAsset(request, asset, textInput);
            observations.push(observation);
            await this.persistObservation(sessionId, turnId, requestId, observation);
          }
        }
      }

      const fusion = await this.fuseObservations(request, observations, textInput, cachedContext);
      observations.push(fusion);

      const answer = this.composeAnswer(request, fusion, cachedContext);
      const reflection = await this.createReflection(request, answer, observations, warnings);

      const memoryRefs: string[] = [];
      const turnMemoryId = await this.memory.saveTurn({
        sessionId,
        turnId,
        requestId,
        taskType: request.taskType,
        summary: fusion.summary,
        answer,
        assets,
        observations,
        reflection,
        warnings,
      });
      memoryRefs.push(turnMemoryId);

      if (reflection) {
        const reflectionMemoryId = await this.memory.saveReflection({
          sessionId,
          turnId,
          requestId,
          reflection,
        });
        memoryRefs.push(reflectionMemoryId);
      }

      this.emit("multimodal.run.completed", {
        requestId,
        sessionId,
        turnId,
        plan,
        memoryRefs,
      });

      const usageMeta = fusion.metadata.usage as
        | { inputTokens?: number; outputTokens?: number; audioSeconds?: number; imageCount?: number }
        | undefined;

      return {
        ok: true,
        requestId,
        sessionId,
        turnId,
        taskType: request.taskType,
        summary: fusion.summary,
        answer,
        confidence: confidenceToBand(fusion.confidence),
        observations,
        assets,
        plan,
        languageModel: fusion.metadata.model as string | undefined,
        computeMode: "sealed",
        outputFormat: plan.expectedOutput,
        structuredOutput: (fusion.metadata.structured as Record<string, unknown> | null | undefined) ?? null,
        warnings,
        reflection,
        memoryRefs,
        toolRefs: [],
        usage: {
          inputTokens: usageMeta?.inputTokens,
          outputTokens: usageMeta?.outputTokens,
          imageCount: assets.filter((a) => a.kind === "image").length,
          audioSeconds: assets.reduce((acc, a) => acc + (a.durationMs ?? 0), 0) / 1000,
        },
        error: null,
      };
    } catch (error) {
      const fallback = await this.tryFallback(request, plan, assets, warnings, observations, error, requestId, turnId);
      if (fallback) {
        return fallback;
      }

      const mmError = this.normalizeError(error, request, { requestId, sessionId, turnId });
      this.emit("multimodal.run.failed", {
        requestId,
        sessionId,
        turnId,
        error: mmError,
      });

      return {
        ok: false,
        requestId,
        sessionId,
        turnId,
        taskType: request.taskType,
        summary: "",
        answer: "",
        confidence: "low",
        observations,
        assets,
        plan,
        computeMode: "fallback",
        outputFormat: plan.expectedOutput,
        warnings,
        reflection: null,
        memoryRefs: [],
        toolRefs: [],
        error: mmError,
      };
    }
  }

  private validateRequest(request: MultimodalRequest, assets: MultimodalAsset[]): void {
    const imageCount = assets.filter((a) => a.kind === "image").length;
    const audioCount = assets.filter((a) => a.kind === "audio").length;

    assert(
      assets.length <= this.limits.maxTotalAssets,
      buildError("MM_010_TOO_MANY_ASSETS", "Too many total multimodal assets submitted", "validation", {
        total: assets.length,
        maxTotalAssets: this.limits.maxTotalAssets,
      }),
    );

    assert(
      imageCount <= this.limits.maxImageAssets,
      buildError("MM_011_TOO_MANY_IMAGES", "Too many images submitted", "validation", {
        imageCount,
        maxImageAssets: this.limits.maxImageAssets,
      }),
    );

    assert(
      audioCount <= this.limits.maxAudioAssets,
      buildError("MM_012_TOO_MANY_AUDIO", "Too many audio assets submitted", "validation", {
        audioCount,
        maxAudioAssets: this.limits.maxAudioAssets,
      }),
    );

    assert(
      Boolean(request.prompt || request.question || request.text),
      buildError("MM_013_EMPTY_PROMPT", "A multimodal request needs a prompt, question, or text instruction", "validation", {}),
    );

    for (const asset of assets) {
      if (asset.kind === "image") {
        assert(
          asset.sizeBytes <= this.limits.maxImageSizeBytes,
          buildError("MM_002_IMAGE_TOO_LARGE", "Image exceeds the configured maximum size", "validation", {
            sizeBytes: asset.sizeBytes,
            maxSizeBytes: this.limits.maxImageSizeBytes,
          }),
        );
      }
      if (asset.kind === "audio") {
        assert(
          asset.sizeBytes <= this.limits.maxAudioSizeBytes,
          buildError("MM_003_AUDIO_TOO_LARGE", "Audio exceeds the configured maximum size", "validation", {
            sizeBytes: asset.sizeBytes,
            maxSizeBytes: this.limits.maxAudioSizeBytes,
          }),
        );
      }
    }
  }

  private buildPrimaryTextInput(request: MultimodalRequest): string {
    return normalizeWords(request.prompt || request.question || request.text || "");
  }

  private async analyzeImageAsset(
    request: MultimodalRequest,
    asset: MultimodalAsset,
    baseText: string,
  ): Promise<MultimodalObservation> {
    const prompt = MultimodalPromptBuilder.buildImagePrompt(request, asset);
    this.emit("multimodal.image.analysis.started", {
      assetId: asset.id,
      filename: asset.filename,
      requestId: request.context.requestId,
    });

    const response = await this.compute.analyzeImage({
      prompt,
      image: asset,
      context: request.context,
      outputSchema: request.outputSchema,
    });

    this.emit("multimodal.image.analysis.completed", {
      assetId: asset.id,
      model: response.model,
      requestId: response.requestId,
    });

    const observation = MultimodalObservationBuilder.fromImageResponse(response, asset);
    if (baseText && response.text.toLowerCase().includes(baseText.toLowerCase().slice(0, 20))) {
      observation.tags.push("prompt-grounded");
    }
    return observation;
  }

  private async analyzeAudioAsset(
    request: MultimodalRequest,
    asset: MultimodalAsset,
    baseText: string,
  ): Promise<MultimodalObservation> {
    const prompt = MultimodalPromptBuilder.buildAudioPrompt(request, asset);
    this.emit("multimodal.audio.analysis.started", {
      assetId: asset.id,
      filename: asset.filename,
      requestId: request.context.requestId,
    });

    const response = await this.compute.analyzeAudio({
      prompt,
      audio: asset,
      context: request.context,
      outputSchema: request.outputSchema,
    });

    this.emit("multimodal.audio.analysis.completed", {
      assetId: asset.id,
      model: response.model,
      requestId: response.requestId,
    });

    const observation = MultimodalObservationBuilder.fromAudioResponse(response, asset);
    if (baseText && response.text.toLowerCase().includes(baseText.toLowerCase().slice(0, 20))) {
      observation.tags.push("prompt-grounded");
    }
    return observation;
  }

  private async fuseObservations(
    request: MultimodalRequest,
    observations: MultimodalObservation[],
    textInput: string,
    cachedContext: Array<{ id: string; text: string; kind: string; score: number }>,
  ): Promise<MultimodalObservation> {
    const prompt = MultimodalPromptBuilder.buildFusionPrompt(request, observations);
    const response = await this.compute.fuse({
      prompt,
      observations: observations.concat(
        cachedContext.map((mem) => ({
          source: "memory" as const,
          modality: "text" as const,
          title: `Memory hit: ${mem.kind}`,
          summary: mem.text,
          rawText: mem.text,
          confidence: clamp(mem.score, 0.1, 0.99),
          tags: uniqueStrings(["memory", mem.kind]),
          metadata: { memoryId: mem.id, score: mem.score },
        })),
      ),
      question: textInput,
      context: request.context,
      outputSchema: request.outputSchema,
    });

    return MultimodalObservationBuilder.fromFusionResponse(response, request.taskType);
  }

  private composeAnswer(
    request: MultimodalRequest,
    fusion: MultimodalObservation,
    cachedContext: Array<{ id: string; text: string; kind: string; score: number }>,
  ): string {
    const text = fusion.rawText ?? fusion.summary;
    const structured = parseMaybeJson(text);
    if (request.hints?.preferStructuredOutput || request.outputSchema) {
      if (structured) {
        return text;
      }
      this.logger?.warn("Structured output was requested but the model returned plain text. Falling back to text answer.", {
        requestId: request.context.requestId,
        sessionId: request.context.sessionId,
      });
    }

    if (cachedContext.length > 0) {
      return normalizeWords(`${text}\n\nRelevant prior memory was used to ground this answer.`);
    }

    return text;
  }

  private async createReflection(
    request: MultimodalRequest,
    answer: string,
    observations: MultimodalObservation[],
    warnings: string[],
  ): Promise<MultimodalReflection | null> {
    if (observations.length === 0 && warnings.length === 0) {
      return null;
    }

    const prompt = MultimodalPromptBuilder.buildReflectionPrompt({ request, answer, observations, warnings });
    return this.compute.reflect({
      prompt,
      answer,
      observations,
      request,
      context: request.context,
    });
  }

  private async persistObservation(
    sessionId: string,
    turnId: string,
    requestId: string | undefined,
    observation: MultimodalObservation,
  ): Promise<void> {
    const key = await this.memory.saveObservation({
      sessionId,
      turnId,
      requestId,
      observation,
    });

    this.emit("multimodal.observation.saved", {
      sessionId,
      turnId,
      requestId,
      memoryId: key,
      modality: observation.modality,
      source: observation.source,
    });
  }

  private normalizeError(
    error: unknown,
    request: MultimodalRequest,
    context: { requestId: string; sessionId: string; turnId: string },
  ): MultimodalErrorShape {
    if (error && typeof error === "object" && "multimodalError" in error) {
      return (error as { multimodalError: MultimodalErrorShape }).multimodalError;
    }

    const message = error instanceof Error ? error.message : safeString(error) || "Unknown multimodal failure";
    const details = {
      requestId: context.requestId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      taskType: request.taskType,
      prompt: summarizeText(request.prompt || request.question || request.text || ""),
    };

    if (/timeout/i.test(message)) {
      return buildError(
        "MM_020_COMPUTE_TIMEOUT",
        "0G Compute timed out while processing multimodal input",
        "compute",
        details,
        true,
        true,
      );
    }
    if (/invalid json|parse/i.test(message)) {
      return buildError("MM_030_PARSE_FAILURE", "The multimodal model returned malformed structured output", "parse", details);
    }
    if (/unsupported|mime|audio|image/i.test(message)) {
      return buildError("MM_010_VALIDATION_FAILURE", "The multimodal request failed validation", "validation", details);
    }
    if (/storage/i.test(message)) {
      return buildError(
        "MM_040_STORAGE_FAILURE",
        "A memory or storage step failed during multimodal processing",
        "storage",
        details,
        true,
        true,
      );
    }

    return buildError("MM_099_INTERNAL_ERROR", "Unexpected multimodal pipeline failure", "internal", {
      ...details,
      cause: message,
    });
  }

  private async tryFallback(
    request: MultimodalRequest,
    plan: MultimodalFusionPlan,
    assets: MultimodalAsset[],
    warnings: string[],
    observations: MultimodalObservation[],
    error: unknown,
    requestId: string,
    turnId: string,
  ): Promise<MultimodalReasoningResult | null> {
    if (this.fallbackMode !== "mock") return null;

    const fallbackReason = error instanceof Error ? error.message : safeString(error);
    warnings.push(`Fallback mode used because: ${fallbackReason}`);

    const text = normalizeWords(request.prompt || request.question || request.text || "");
    const imageCount = assets.filter((a) => a.kind === "image").length;
    const audioCount = assets.filter((a) => a.kind === "audio").length;
    const summaryParts: string[] = [];
    if (imageCount > 0) summaryParts.push(`Processed ${imageCount} image(s)`);
    if (audioCount > 0) summaryParts.push(`Processed ${audioCount} audio file(s)`);
    if (text) summaryParts.push(`User asked: ${summarizeText(text, 140)}`);

    const answer = summaryParts.length
      ? `Fallback multimodal analysis: ${summaryParts.join(". ")}.`
      : "Fallback multimodal analysis completed.";

    const observation: MultimodalObservation = {
      source: "tool",
      modality:
        assets.length > 0
          ? assets.every((a) => a.kind === "image")
            ? "image"
            : assets.every((a) => a.kind === "audio")
              ? "audio"
              : "mixed"
          : "text",
      title: "Fallback analysis",
      summary: answer,
      rawText: answer,
      confidence: 0.35,
      tags: uniqueStrings(["fallback", "mock"]),
      metadata: { reason: fallbackReason, requestId },
    };

    observations.push(observation);

    const reflection: MultimodalReflection = {
      reflectionId: createId("refl"),
      sourceTurnId: turnId,
      rootCause: "Pipeline fell back to local mock mode after an upstream multimodal failure",
      mistakeSummary: "The system could not complete sealed multimodal inference",
      correctiveAdvice: "Check 0G Compute availability, asset validation, and prompt/schema compatibility",
      nextBestAction: "Retry the multimodal request after confirming asset metadata and provider health",
      severity: "medium",
      tags: uniqueStrings(["fallback", "multimodal", "compute"]),
      createdAt: nowIso(),
    };

    return {
      ok: true,
      requestId,
      sessionId: request.context.sessionId,
      turnId,
      taskType: request.taskType,
      summary: answer,
      answer,
      confidence: "low",
      observations,
      assets,
      plan,
      computeMode: "mock",
      outputFormat: plan.expectedOutput,
      warnings,
      reflection,
      memoryRefs: [],
      toolRefs: [],
      error: null,
    };
  }

  private emit(eventName: string, payload: Record<string, unknown>): void {
    try {
      this.events?.emit(eventName, payload);
    } catch (error) {
      this.logger?.warn?.("Event emission failed in multimodal pipeline", { eventName, error: safeString(error) });
    }
  }
}

export function validateResponseShape(result: MultimodalReasoningResult): string[] {
  const errors: string[] = [];
  if (!result.requestId) errors.push("requestId missing");
  if (!result.sessionId) errors.push("sessionId missing");
  if (!result.turnId) errors.push("turnId missing");
  if (!result.taskType) errors.push("taskType missing");
  if (!result.plan) errors.push("plan missing");
  if (!Array.isArray(result.observations)) errors.push("observations must be an array");
  if (!Array.isArray(result.assets)) errors.push("assets must be an array");
  if (!Array.isArray(result.warnings)) errors.push("warnings must be an array");
  return errors;
}

export function buildMultimodalReflectionTags(input: {
  taskType: MultimodalTaskType;
  observations: MultimodalObservation[];
  warnings: string[];
}): string[] {
  return uniqueStrings([
    "multimodal",
    input.taskType,
    ...input.observations.flatMap((obs) => obs.tags),
    ...(input.warnings.length > 0 ? ["warning"] : []),
  ]);
}

export function estimateInputComplexity(request: MultimodalRequest): number {
  const assets = collectAssets(request);
  const imageWeight = assets.filter((a) => a.kind === "image").length * 2;
  const audioWeight = assets.filter((a) => a.kind === "audio").length * 3;
  const textWeight = (request.prompt || request.question || request.text ? 1 : 0) * 1;
  return imageWeight + audioWeight + textWeight;
}

export function buildMultimodalSummary(result: MultimodalReasoningResult): string {
  const modalityList = uniqueStrings(result.assets.map((asset) => asset.kind)).join(", ") || "text";
  return normalizeWords(`
    ${result.taskType} task using ${modalityList}.
    Confidence: ${result.confidence}.
    Answer preview: ${summarizeText(result.answer, 180)}
  `);
}

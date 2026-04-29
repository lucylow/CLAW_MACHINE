import type {
  MultimodalAnalysisResult,
  MultimodalArtifact,
  MultimodalAsset,
  MultimodalComputeClient,
  MultimodalInput,
  MultimodalInputKind,
  MultimodalPreprocessOptions,
  MultimodalProcessContext,
} from "./types.js";
import { buildAudioPrompt, buildImagePrompt, buildMixedPrompt, buildReasoningPrompt } from "./computePrompts.js";
import {
  assetKindFromMimeType,
  assetSha256,
  assetSizeBytes,
  clamp,
  firstSentence,
  normalizeTags,
  normalizeText,
  now,
  sha256,
  tokenize,
  uuid,
} from "./utils.js";

type AssetDescribeResult = {
  description: string;
  transcript?: string;
  sceneGraph?: Record<string, unknown>;
  artifacts?: MultimodalArtifact[];
  warnings?: string[];
};

type GenerationResult = {
  text: string;
  confidence: number;
  model: string;
  fallbackUsed: boolean;
  raw?: unknown;
};

export class MultimodalPreprocessor {
  private readonly compute: MultimodalComputeClient;
  private readonly options: Required<MultimodalPreprocessOptions>;
  private readonly cache = new Map<string, { value: MultimodalAnalysisResult; expiresAt: number }>();

  constructor(deps: { compute: MultimodalComputeClient; options?: MultimodalPreprocessOptions }) {
    this.compute = deps.compute;
    this.options = {
      maxImageChars: deps.options?.maxImageChars ?? 2000,
      maxAudioChars: deps.options?.maxAudioChars ?? 2200,
      maxAssets: deps.options?.maxAssets ?? 12,
      imageDetailLevel: deps.options?.imageDetailLevel ?? "medium",
      audioDetailLevel: deps.options?.audioDetailLevel ?? "medium",
      allowMockFallback: deps.options?.allowMockFallback ?? true,
      useStructuredVision: deps.options?.useStructuredVision ?? true,
      useStructuredAudio: deps.options?.useStructuredAudio ?? true,
      cacheTtlMs: deps.options?.cacheTtlMs ?? 1000 * 60 * 3,
    };
  }

  async process(input: MultimodalInput): Promise<MultimodalAnalysisResult> {
    const requestId = input.requestId || uuid("req");
    const sessionId = input.sessionId;
    const assets = (input.assets || []).slice(0, this.options.maxAssets);
    const cacheKey = this.cacheKey({ input, assets });
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now()) return cached.value;

    const normalizedText = normalizeText(input.userText);
    const descriptions: string[] = [];
    const artifacts: MultimodalArtifact[] = [];
    const warnings: string[] = [];
    let transcript: string | undefined;
    let sceneGraph: Record<string, unknown> | undefined;

    for (const asset of assets) {
      const result = await this.describeAsset(asset, {
        sessionId,
        walletAddress: input.walletAddress,
        requestId,
        userText: input.userText,
        normalizedText,
        descriptions,
        transcript,
        artifacts,
        context: input.context,
        assets,
      });

      descriptions.push(result.description);
      if (result.transcript) transcript = transcript ? `${transcript}\n${result.transcript}` : result.transcript;
      if (result.sceneGraph) sceneGraph = { ...(sceneGraph || {}), ...result.sceneGraph };
      if (result.artifacts?.length) artifacts.push(...result.artifacts);
      if (result.warnings?.length) warnings.push(...result.warnings);
    }

    const kind = this.detectKind(assets, normalizedText);
    let summary = "";
    let confidence = 0.68;

    if (!assets.length && normalizedText) {
      summary = firstSentence(normalizedText, 220);
      descriptions.push(summary);
      confidence = 0.55;
    } else if (descriptions.length) {
      summary = this.summarizeDescriptions(descriptions, transcript, normalizedText);
      confidence = clamp(0.7 + Math.min(0.2, descriptions.length * 0.03), 0, 1);
    }

    const result: MultimodalAnalysisResult = {
      requestId,
      sessionId,
      walletAddress: input.walletAddress,
      kind,
      summary,
      normalizedText,
      descriptions,
      transcript,
      sceneGraph,
      confidence,
      artifacts,
      warnings: normalizeTags(warnings),
      raw: {
        assetCount: assets.length,
        kinds: assets.map((a) => a.kind),
      },
    };

    this.cache.set(cacheKey, { value: result, expiresAt: now() + this.options.cacheTtlMs });
    return result;
  }

  async createReasoningContext(input: MultimodalInput): Promise<MultimodalProcessContext> {
    const multimodal = await this.process(input);
    return {
      sessionId: multimodal.sessionId,
      walletAddress: multimodal.walletAddress,
      requestId: multimodal.requestId,
      userText: input.userText,
      normalizedText: multimodal.normalizedText,
      descriptions: multimodal.descriptions,
      transcript: multimodal.transcript,
      summary: multimodal.summary,
      assets: input.assets || [],
      artifacts: multimodal.artifacts,
      context: input.context,
    };
  }

  buildReasoningPrompt(context: MultimodalProcessContext): string {
    return buildReasoningPrompt(context);
  }

  async generateReasoningPrompt(input: MultimodalInput): Promise<string> {
    const ctx = await this.createReasoningContext(input);
    return this.buildReasoningPrompt(ctx);
  }

  private async describeAsset(
    asset: MultimodalAsset,
    context: MultimodalProcessContext & { descriptions: string[]; transcript?: string; artifacts: MultimodalArtifact[]; assets: MultimodalAsset[] },
  ): Promise<AssetDescribeResult> {
    const hash = assetSha256(asset);
    const mimeType = asset.mimeType || (asset.kind === "image" ? "image/*" : asset.kind === "audio" ? "audio/*" : "text/plain");
    const kind = asset.kind || assetKindFromMimeType(mimeType);
    const label = asset.filename || asset.id;

    if (kind === "image") {
      const prompt = buildImagePrompt(asset, context);
      const response = await this.safeGenerate(prompt, {
        temperature: 0.15,
        maxTokens: this.options.maxImageChars,
        json: false,
        modelHint: "multimodal-image-description",
      });
      const description = this.cleanupDescription(response.text, kind);
      const sceneGraph = this.estimateSceneGraph(asset, description);
      const artifact = this.makeArtifact(asset, "description", `Image description: ${label}`, description, {
        kind: "image_description",
        promptHash: sha256(prompt),
        computeModel: response.model,
      });
      return { description, sceneGraph, artifacts: [artifact], warnings: response.fallbackUsed ? ["image_fallback_used"] : [] };
    }

    if (kind === "audio") {
      const prompt = buildAudioPrompt(asset, context);
      const response = await this.safeGenerate(prompt, {
        temperature: 0.1,
        maxTokens: this.options.maxAudioChars,
        json: false,
        modelHint: "multimodal-audio-transcript",
      });
      const transcript = this.extractTranscript(response.text);
      const description = this.cleanupDescription(firstSentence(response.text, 260), kind);
      const artifact = this.makeArtifact(asset, "transcript", `Audio transcript: ${label}`, transcript, {
        kind: "audio_transcript",
        promptHash: sha256(prompt),
        computeModel: response.model,
      });
      return { description, transcript, artifacts: [artifact], warnings: response.fallbackUsed ? ["audio_fallback_used"] : [] };
    }

    if (kind === "video") {
      const prompt = buildMixedPrompt({
        sessionId: context.sessionId,
        walletAddress: context.walletAddress,
        requestId: context.requestId,
        userText: context.userText,
        normalizedText: context.normalizedText,
        descriptions: context.descriptions,
        transcript: context.transcript,
        summary: context.summary,
        assets: [asset],
        artifacts: context.artifacts,
        context: context.context,
      });
      const response = await this.safeGenerate(prompt, {
        temperature: 0.15,
        maxTokens: 1600,
        json: false,
        modelHint: "multimodal-video-summary",
      });
      const description = this.cleanupDescription(response.text, kind);
      const artifact = this.makeArtifact(asset, "summary", `Video summary: ${label}`, description, {
        kind: "video_summary",
        promptHash: sha256(prompt),
        computeModel: response.model,
      });
      return { description, artifacts: [artifact], warnings: response.fallbackUsed ? ["video_fallback_used"] : [] };
    }

    const text = normalizeText(typeof asset.data === "string" ? asset.data : "");
    const description = text ? this.cleanupDescription(text, "text") : `Text asset ${label}`;
    const artifact = this.makeArtifact(asset, "summary", `Text asset: ${label}`, description, {
      kind: "text_summary",
      contentHash: hash,
    });
    return { description, artifacts: [artifact] };
  }

  private detectKind(assets: MultimodalAsset[], normalizedText: string): MultimodalInputKind {
    if (!assets.length) return normalizedText ? "text" : "mixed";
    const kinds = new Set(assets.map((a) => a.kind || assetKindFromMimeType(a.mimeType)));
    if (kinds.size !== 1) return "mixed";
    const only = [...kinds][0];
    return only === "image" || only === "audio" || only === "video" || only === "text" ? only : "mixed";
  }

  private summarizeDescriptions(descriptions: string[], transcript?: string, normalizedText?: string): string {
    const joined = [normalizedText || "", transcript || "", ...descriptions].filter(Boolean).join(" ");
    return firstSentence(joined, 260);
  }

  private cleanupDescription(text: string, kind: string): string {
    const clean = normalizeText(text);
    if (!clean) return `${kind} asset`;
    return clean.length > 400 ? `${clean.slice(0, 399)}...` : clean;
  }

  private extractTranscript(text: string): string {
    const clean = normalizeText(text);
    if (!clean) return "";
    const transcriptMarker = clean.match(/(?:transcript|spoken text|heard|audio text)\s*[:\-]\s*(.+)$/i);
    if (transcriptMarker?.[1]) return transcriptMarker[1].trim();
    return clean;
  }

  private estimateSceneGraph(asset: MultimodalAsset, description: string): Record<string, unknown> {
    const tokens = tokenize(description);
    const objects = tokens.slice(0, 12).map((token, index) => ({
      id: `obj_${index}`,
      label: token,
      confidence: clamp(0.55 + index * 0.03, 0, 0.95),
    }));

    return {
      assetId: asset.id,
      width: asset.width,
      height: asset.height,
      objects,
      relationships: [],
      notes: "Approximate scene graph derived from multimodal description.",
    };
  }

  private makeArtifact(
    asset: MultimodalAsset,
    kind: MultimodalArtifact["kind"],
    title: string,
    summary: string,
    metadata?: Record<string, unknown>,
  ): MultimodalArtifact {
    return {
      id: uuid("artifact"),
      kind,
      title,
      summary,
      text: summary,
      mimeType: asset.mimeType,
      sha256: assetSha256(asset),
      sourceAssetIds: [asset.id],
      createdAt: now(),
      metadata,
    };
  }

  private async safeGenerate(
    prompt: string,
    opts: { temperature?: number; maxTokens?: number; json?: boolean; modelHint?: string },
  ): Promise<GenerationResult> {
    try {
      const response = await this.compute.generate(prompt, {
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        json: opts.json,
        modelHint: opts.modelHint,
      });
      return {
        text: response.text || "",
        confidence: clamp(response.confidence ?? 0.75, 0, 1),
        model: response.model || opts.modelHint || "multimodal",
        fallbackUsed: false,
        raw: response.raw,
      };
    } catch (error) {
      if (!this.options.allowMockFallback) throw error;
      return {
        text: this.mockDescribe(prompt, opts.modelHint),
        confidence: 0.42,
        model: `mock-${opts.modelHint || "multimodal"}`,
        fallbackUsed: true,
        raw: { error: String(error) },
      };
    }
  }

  private mockDescribe(prompt: string, modelHint?: string): string {
    const text = prompt.toLowerCase();
    if (text.includes("audio")) {
      return "Audio contains a spoken request or narration. A concise transcript is unavailable in mock mode, but the content should be treated as user-provided spoken input and summarized accordingly.";
    }
    if (text.includes("image")) {
      return "The image appears to contain a user interface, visual artifact, or diagram. In mock mode, treat it as grounded visual input and extract any visible labels, buttons, charts, or errors.";
    }
    if (text.includes("video")) {
      return "The video should be summarized as a sequence of visual events and actions. In mock mode, treat it as a temporal scene and infer the most salient steps.";
    }
    return `Mock multimodal description generated for ${modelHint || "input"}.`;
  }

  private cacheKey(input: { input: MultimodalInput; assets: MultimodalAsset[] }): string {
    return sha256(
      JSON.stringify({
        sessionId: input.input.sessionId,
        walletAddress: input.input.walletAddress || "",
        userText: input.input.userText || "",
        assets: input.assets.map((a) => ({
          id: a.id,
          kind: a.kind,
          mimeType: a.mimeType,
          filename: a.filename || "",
          sha256: assetSha256(a),
          sizeBytes: assetSizeBytes(a),
        })),
      }),
    );
  }
}

import express, { type Request, type Response, type Router } from "express";
import type { MultimodalRequest } from "../multimodal/types";
import type { MultimodalLogger } from "../multimodal/types";
import { MultimodalReasoningPipeline, MultimodalAssetNormalizer } from "../multimodal/multimodal-reasoning";
import { assert, buildError, collectAssets, deepMerge, normalizeWords, sha256 } from "../multimodal/utils";
import type { MultimodalErrorShape } from "../multimodal/types";

export interface MultimodalRouteDeps {
  pipeline: MultimodalReasoningPipeline;
  logger?: MultimodalLogger;
}

const defaultUploadLimits = {
  maxImageSizeBytes: 18 * 1024 * 1024,
  maxAudioSizeBytes: 32 * 1024 * 1024,
  maxAudioDurationMs: 10 * 60 * 1000,
} as const;

/**
 * POST /api/agent/multimodal/run
 * POST /api/agent/multimodal/upload/image
 * POST /api/agent/multimodal/upload/audio
 */
export function createMultimodalRoutes(deps: MultimodalRouteDeps): Router {
  const router = express.Router();
  router.use(express.json({ limit: "50mb" }));

  router.post("/run", async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<MultimodalRequest>;
      const sessionId = body.context?.sessionId;

      assert(sessionId, buildError("MM_100_SESSION_REQUIRED", "context.sessionId is required", "validation", {}));

      assert(body.taskType, buildError("MM_101_TASK_REQUIRED", "taskType is required", "validation", {}));

      const normalized = await normalizeRequest(body as MultimodalRequest, deps.logger);
      const result = await deps.pipeline.run(normalized);
      res.status(result.ok ? 200 : 500).json(result);
    } catch (error) {
      const err =
        error && typeof error === "object" && "multimodalError" in error
          ? (error as { multimodalError: MultimodalErrorShape }).multimodalError
          : buildError("MM_099_INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown error", "internal", {}, true, true);

      deps.logger?.error("Multimodal route failure", { error: err });
      res.status(err.category === "validation" ? 400 : 500).json({
        ok: false,
        error: err,
      });
    }
  });

  router.post("/upload/image", async (req: Request, res: Response) => {
    try {
      const { filename, mimeType, base64 } = req.body as { filename: string; mimeType: string; base64: string };
      assert(filename, buildError("MM_201_FILENAME_REQUIRED", "filename is required", "validation", {}));
      assert(mimeType, buildError("MM_202_MIME_REQUIRED", "mimeType is required", "validation", {}));
      assert(base64, buildError("MM_203_FILE_REQUIRED", "base64 payload is required", "validation", {}));

      const buffer = Buffer.from(base64, "base64");
      const normalized = MultimodalAssetNormalizer.normalize(
        { kind: "image", filename, mimeType, buffer },
        defaultUploadLimits,
      );

      res.json({ ok: true, asset: normalized.asset, warnings: normalized.warnings });
    } catch (error) {
      const err =
        error && typeof error === "object" && "multimodalError" in error
          ? (error as { multimodalError: MultimodalErrorShape }).multimodalError
          : buildError("MM_099_INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown error", "internal", {}, true, true);
      res.status(err.category === "validation" ? 400 : 500).json({ ok: false, error: err });
    }
  });

  router.post("/upload/audio", async (req: Request, res: Response) => {
    try {
      const { filename, mimeType, base64 } = req.body as { filename: string; mimeType: string; base64: string };
      assert(filename, buildError("MM_201_FILENAME_REQUIRED", "filename is required", "validation", {}));
      assert(mimeType, buildError("MM_202_MIME_REQUIRED", "mimeType is required", "validation", {}));
      assert(base64, buildError("MM_203_FILE_REQUIRED", "base64 payload is required", "validation", {}));

      const buffer = Buffer.from(base64, "base64");
      const normalized = MultimodalAssetNormalizer.normalize(
        { kind: "audio", filename, mimeType, buffer },
        defaultUploadLimits,
      );

      res.json({ ok: true, asset: normalized.asset, warnings: normalized.warnings });
    } catch (error) {
      const err =
        error && typeof error === "object" && "multimodalError" in error
          ? (error as { multimodalError: MultimodalErrorShape }).multimodalError
          : buildError("MM_099_INTERNAL_ERROR", error instanceof Error ? error.message : "Unknown error", "internal", {}, true, true);
      res.status(err.category === "validation" ? 400 : 500).json({ ok: false, error: err });
    }
  });

  return router;
}

async function normalizeRequest(request: MultimodalRequest, logger?: MultimodalLogger): Promise<MultimodalRequest> {
  const assets = collectAssets(request);

  const normalizedAssets = await Promise.all(
    assets.map(async (asset) => {
      if (asset.uri && !asset.base64) return asset;
      if (asset.base64 && !asset.sha256) {
        return {
          ...asset,
          sha256: sha256(Buffer.from(asset.base64, "base64")),
        };
      }
      return asset;
    }),
  );

  if (!request.context.sessionId) {
    throw Object.assign(new Error("sessionId missing"), {
      multimodalError: buildError("MM_100_SESSION_REQUIRED", "context.sessionId is required", "validation", {}),
    });
  }

  if (!request.taskType) {
    throw Object.assign(new Error("taskType missing"), {
      multimodalError: buildError("MM_101_TASK_REQUIRED", "taskType is required", "validation", {}),
    });
  }

  logger?.debug?.("Normalized multimodal request", {
    sessionId: request.context.sessionId,
    taskType: request.taskType,
    assetCount: normalizedAssets.length,
  });

  const images = normalizedAssets.filter((a) => a.kind === "image");
  const audios = normalizedAssets.filter((a) => a.kind === "audio");

  return {
    ...request,
    image: undefined,
    audio: undefined,
    text: request.text ? normalizeWords(request.text) : request.text,
    prompt: request.prompt ? normalizeWords(request.prompt) : request.prompt,
    question: request.question ? normalizeWords(request.question) : request.question,
    images,
    audios,
    attachments: normalizedAssets,
    hints: deepMerge(
      {
        preferDescription: true,
        preferTranscription: true,
        preferStructuredOutput: false,
        preserveVerbatim: false,
        detectObjects: true,
        detectText: true,
        detectSpeakers: true,
        detectTone: true,
        compareAssets: false,
      },
      request.hints ?? {},
    ),
  };
}

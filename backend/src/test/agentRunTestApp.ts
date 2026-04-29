import express, { Express, NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { AgentRuntime } from "../core/AgentRuntime";
import { ComputeProvider } from "../providers/ComputeProvider";
import { StorageProvider } from "../providers/StorageProvider";
import { EventBus } from "../events/EventBus";
import { MemoryStore } from "../memory/MemoryStore";
import {
  AgentMemorySnapshotAdapter,
  createDefaultSnapshotService,
  MemorySnapshotService,
} from "../memory/snapshots";
import { ReflectionEngine } from "../reflection/ReflectionEngine";
import { SkillRegistry } from "../skills/SkillRegistry";
import { AppError, ValidationError } from "../errors/AppError";
import { normalizeError, toApiErrorResponse } from "../errors/normalize";

function ok<T>(res: Response, data: T, meta: Record<string, unknown> = {}): Response {
  return res.json({ ok: true, data, meta: { ...meta, timestamp: Date.now() } });
}

function requireString(value: unknown, _field: string, max = 2000): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.length > max) return null;
  return value.trim();
}

function safeAsync(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => void fn(req, res, next).catch(next);
}

export interface AgentRunTestContext {
  app: Express;
  memory: MemoryStore;
  events: EventBus;
  compute: ComputeProvider;
  storage: StorageProvider;
  runtime: AgentRuntime;
  /** Present when `snapshotsDirectory` was passed to `createAgentRunTestApp`. */
  snapshotService?: MemorySnapshotService;
}

/**
 * Minimal Express app mirroring production POST /api/agent/run for integration tests.
 * Uses injectable compute/storage so providers can be mocked without starting the real server.
 */
export function createAgentRunTestApp(overrides?: {
  compute?: ComputeProvider;
  storage?: StorageProvider;
  snapshotsDirectory?: string;
}): AgentRunTestContext {
  const events = new EventBus();
  const memory = new MemoryStore();
  const skills = new SkillRegistry();
  const storage = overrides?.storage ?? new StorageProvider("memory://integration-test");
  const compute = overrides?.compute ?? new ComputeProvider(null, "mock");
  const reflection = new ReflectionEngine("integration-test-model");
  const snapshotService = overrides?.snapshotsDirectory
    ? createDefaultSnapshotService({ directory: overrides.snapshotsDirectory })
    : undefined;
  const snapshotAdapter = snapshotService ? new AgentMemorySnapshotAdapter(snapshotService) : undefined;
  const runtime = new AgentRuntime(compute, storage, skills, memory, reflection, events, snapshotAdapter);

  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const requestId = (req.headers["x-request-id"] as string) || randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;
    next();
  });

  app.post(
    "/api/agent/run",
    safeAsync(async (req: Request, res: Response) => {
      const input = requireString(req.body?.input, "input");
      const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
      if (!input) {
        throw new ValidationError(
          "input must be a non-empty string up to 2000 chars",
          "API_001_INVALID_REQUEST",
          { field: "input" },
        );
      }

      const sessionId = walletAddress || "guest";
      const requestId = (req as Request & { requestId: string }).requestId;
      const result = await runtime.runTurn({ input, walletAddress, sessionId }, requestId);
      ok(res, result, { degraded: result.degradedMode });
    }),
  );

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = (req as Request & { requestId?: string }).requestId;
    const normalized = normalizeError(err, { operation: `${req.method.toLowerCase()} ${req.path}` });
    const enriched = new AppError({
      ...normalized,
      code: normalized.code,
      message: normalized.message,
      category: normalized.category,
      statusCode: normalized.statusCode,
      recoverable: normalized.recoverable,
      retryable: normalized.retryable,
      details: normalized.details,
      operation: normalized.operation,
      requestId,
    });
    res.status(enriched.statusCode).json(toApiErrorResponse(enriched, requestId));
  });

  return { app, memory, events, compute, storage, runtime, snapshotService };
}

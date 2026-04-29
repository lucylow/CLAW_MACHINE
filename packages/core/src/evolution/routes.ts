import type { SelfEvolvingSkillEngine } from "./engine.js";
import type { EvolutionHistoryQuery, EvolutionPromptContext, EvolutionResultStatus, EvolutionStage } from "./types.js";

export interface EvolutionRoutesDeps {
  engine: SelfEvolvingSkillEngine;
  requireAuth?: (req: HttpRequestLike, res: HttpResponseLike, next: () => void) => void | Promise<void>;
}

interface HttpRequestLike {
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, unknown>;
  params: Record<string, string>;
  body: Record<string, unknown>;
}

interface HttpResponseLike {
  status(code: number): HttpResponseLike;
  json(payload: unknown): void;
}

interface ExpressLike {
  get(path: string, ...handlers: Array<(req: HttpRequestLike, res: HttpResponseLike) => void | Promise<void>>): void;
  post(path: string, ...handlers: Array<(req: HttpRequestLike, res: HttpResponseLike, next: () => void) => void | Promise<void>>): void;
}

function jsonMiddleware() {
  const express = require("express") as { json: (opts: { limit: string }) => (req: HttpRequestLike, res: HttpResponseLike, next: () => void) => void };
  return express.json({ limit: "12mb" });
}

function requestId(req: HttpRequestLike): string {
  return (req.headers["x-request-id"] as string) || `req_${Date.now()}`;
}

function respondError(res: HttpResponseLike, status: number, code: string, message: string, requestId: string, details?: unknown): void {
  res.status(status).json({
    ok: false,
    error: {
      code,
      message,
      category: status >= 500 ? "server" : "client",
      recoverable: status < 500,
      retryable: status >= 500,
      requestId,
      details,
    },
  });
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseNumber(value: unknown, fallback?: number): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

export function registerEvolutionRoutes(app: ExpressLike, deps: EvolutionRoutesDeps): void {
  const { engine, requireAuth } = deps;

  const guard = requireAuth
    ? (req: HttpRequestLike, res: HttpResponseLike, next: () => void) => Promise.resolve(requireAuth(req, res, next))
    : (_req: HttpRequestLike, _res: HttpResponseLike, next: () => void) => next();

  app.get("/api/evolution/health", async (req, res) => {
    const rid = requestId(req);
    try {
      const attempts = await engine.listAttempts({ limit: 1 });
      res.json({
        ok: true,
        requestId: rid,
        data: {
          attempts: attempts.length,
          latest: attempts[0] ?? null,
        },
      });
    } catch (error) {
      respondError(res, 500, "evolution_health_failed", error instanceof Error ? error.message : String(error), rid);
    }
  });

  app.get("/api/evolution/history", async (req, res) => {
    const rid = requestId(req);
    try {
      const query: EvolutionHistoryQuery = {
        status: parseOptionalString(req.query.status) as EvolutionResultStatus | undefined,
        stage: parseOptionalString(req.query.stage) as EvolutionStage | undefined,
        taskContains: parseOptionalString(req.query.taskContains),
        skillId: parseOptionalString(req.query.skillId),
        limit: parseNumber(req.query.limit, 50),
        offset: parseNumber(req.query.offset, 0),
      };
      const attempts = await engine.listAttempts(query);
      res.json({ ok: true, requestId: rid, data: attempts });
    } catch (error) {
      respondError(res, 400, "evolution_history_failed", error instanceof Error ? error.message : String(error), rid);
    }
  });

  app.get("/api/evolution/history/:id", async (req, res) => {
    const rid = requestId(req);
    try {
      const attempt = await engine.getAttempt(req.params.id);
      if (!attempt) return respondError(res, 404, "evolution_attempt_not_found", "Attempt not found", rid);
      res.json({ ok: true, requestId: rid, data: attempt });
    } catch (error) {
      respondError(res, 400, "evolution_history_get_failed", error instanceof Error ? error.message : String(error), rid);
    }
  });

  app.post("/api/evolution/run", guard, jsonMiddleware(), async (req, res) => {
    const rid = requestId(req);
    try {
      const body = req.body ?? {};
      const result = await engine.evolve({
        task: String(body.task ?? "").trim(),
        domainHint: parseOptionalString(body.domainHint),
        context: typeof body.context === "object" && body.context ? (body.context as EvolutionPromptContext) : undefined,
        memoryHits: Array.isArray(body.memoryHits) ? (body.memoryHits as Array<{ id: string; title?: string; summary?: string; tags?: string[]; importance?: number }>) : undefined,
        currentSkills: Array.isArray(body.currentSkills)
          ? (body.currentSkills as Array<{ id: string; name: string; description: string; tags?: string[]; kind?: string; version?: string }>)
          : undefined,
        metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : undefined,
      });
      res.json({ ok: true, requestId: rid, data: result });
    } catch (error) {
      respondError(res, 400, "evolution_run_failed", error instanceof Error ? error.message : String(error), rid);
    }
  });

  app.post("/api/evolution/evaluate", guard, jsonMiddleware(), async (req, res) => {
    const rid = requestId(req);
    try {
      const body = req.body ?? {};
      const result = await engine.evolve({
        task: String(body.task ?? "").trim(),
        domainHint: parseOptionalString(body.domainHint),
        context: typeof body.context === "object" && body.context ? (body.context as EvolutionPromptContext) : undefined,
        memoryHits: Array.isArray(body.memoryHits) ? (body.memoryHits as Array<{ id: string; title?: string; summary?: string; tags?: string[]; importance?: number }>) : undefined,
        currentSkills: Array.isArray(body.currentSkills)
          ? (body.currentSkills as Array<{ id: string; name: string; description: string; tags?: string[]; kind?: string; version?: string }>)
          : undefined,
        metadata: typeof body.metadata === "object" && body.metadata ? (body.metadata as Record<string, unknown>) : undefined,
      });

      res.json({
        ok: true,
        requestId: rid,
        data: {
          attempt: result.attempt,
          score: result.score,
          tests: result.tests,
          results: result.results,
          promoted: result.promoted,
          repaired: result.repaired,
          warnings: result.warnings,
        },
      });
    } catch (error) {
      respondError(res, 400, "evolution_evaluate_failed", error instanceof Error ? error.message : String(error), rid);
    }
  });

  app.post("/api/evolution/import-snapshot", guard, jsonMiddleware(), async (req, res) => {
    const rid = requestId(req);
    try {
      const body = req.body ?? {};
      if (!body.snapshot || typeof body.snapshot !== "object") return respondError(res, 400, "evolution_import_invalid", "snapshot is required", rid);
      await engine.importSnapshot(body.snapshot as Awaited<ReturnType<SelfEvolvingSkillEngine["exportSnapshot"]>>);
      res.json({ ok: true, requestId: rid, data: { imported: true } });
    } catch (error) {
      respondError(res, 400, "evolution_import_failed", error instanceof Error ? error.message : String(error), rid);
    }
  });

  app.get("/api/evolution/export-snapshot", async (req, res) => {
    const rid = requestId(req);
    try {
      const snapshot = await engine.exportSnapshot();
      res.json({ ok: true, requestId: rid, data: snapshot });
    } catch (error) {
      respondError(res, 500, "evolution_export_failed", error instanceof Error ? error.message : String(error), rid);
    }
  });
}

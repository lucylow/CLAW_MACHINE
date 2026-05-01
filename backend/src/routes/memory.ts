/**
 * Memory management routes
 * GET  /api/memory/search   — semantic search over memory store
 * GET  /api/memory/stats    — memory statistics
 * POST /api/memory/pin/:id  — pin a memory record (prevent pruning)
 * DELETE /api/memory/:id    — soft-delete (set importance=0)
 */
import { Router, Request, Response } from "express";
import type { MemoryStore } from "../memory/MemoryStore";
import { NotFoundError, ValidationError } from "../errors/AppError";
import type { MemoryType } from "../types/runtime";

export function createMemoryRouter(memory: MemoryStore): Router {
  const router = Router();

  const ok = (res: Response, data: unknown, meta: Record<string, unknown> = {}) =>
    res.json({ ok: true, data, ...meta });

  router.get("/search", (req: Request, res: Response) => {
    const { sessionId, walletAddress, type, query, limit } = req.query as Record<string, string>;
    const tags = req.query.tags
      ? (Array.isArray(req.query.tags) ? req.query.tags : [req.query.tags]) as string[]
      : undefined;

    const results = memory.search({
      sessionId,
      walletAddress,
      type: type as MemoryType | undefined,
      tags,
      query,
      limit: limit ? parseInt(limit, 10) : 20,
    });

    ok(res, { results, count: results.length });
  });

  router.get("/stats", (_req: Request, res: Response) => {
    const all = [...(memory as unknown as { records: Map<string, unknown> })["records"].values()] as Array<{
      type: string;
      importance: number;
      sessionId: string;
    }>;

    const byType: Record<string, number> = {};
    const bySeverity = { high: 0, medium: 0, low: 0 };
    const sessions = new Set<string>();

    for (const r of all) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      sessions.add(r.sessionId);
      if (r.importance >= 0.8) bySeverity.high++;
      else if (r.importance >= 0.5) bySeverity.medium++;
      else bySeverity.low++;
    }

    ok(res, {
      total: all.length,
      byType,
      bySeverity,
      activeSessions: sessions.size,
    });
  });

  router.post("/pin/:id", (req: Request, res: Response) => {
    const record = memory.retrieve(req.params.id);
    if (!record) throw new NotFoundError(`Memory record "${req.params.id}" not found`);
    (record as typeof record & { pinned: boolean }).pinned = true;
    ok(res, { id: req.params.id, pinned: true });
  });

  router.delete("/:id", (req: Request, res: Response) => {
    const record = memory.retrieve(req.params.id);
    if (!record) throw new NotFoundError(`Memory record "${req.params.id}" not found`);
    // Soft delete — mark for pruning
    record.importance = 0;
    record.updatedAt = 0;
    ok(res, { id: req.params.id, deleted: true });
  });

  
  // POST /api/memory/bulk-pin — pin multiple records at once
  router.post("/bulk-pin", (req: Request, res: Response) => {
    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ ok: false, error: "ids must be a non-empty array" });
      return;
    }
    const validIds = ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (validIds.length === 0) {
      res.status(400).json({ ok: false, error: "ids must contain at least one non-empty string" });
      return;
    }
    const pinned: string[] = [];
    const missing: string[] = [];
    for (const id of validIds) {
      try {
        memory.pin(id);
        pinned.push(id);
      } catch {
        missing.push(id);
      }
    }
    ok(res, { pinned, missing, pinnedCount: pinned.length, missingCount: missing.length });
  });

  // GET /api/memory/export/:sessionId — export all memory for a session as NDJSON
  router.get("/export/:sessionId", (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!sessionId?.trim()) {
      res.status(400).json({ ok: false, error: "sessionId is required" });
      return;
    }
    const results = memory.search({ sessionId, limit: 10_000 });
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Content-Disposition", `attachment; filename="memory-${sessionId}.ndjson"`);
    for (const record of results) {
      res.write(JSON.stringify(record) + "\n");
    }
    res.end();
  });

  return router;
}

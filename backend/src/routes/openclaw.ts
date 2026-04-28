/**
 * OpenClaw Routes
 *
 * Exposes the OpenClawAdapter integration:
 *   GET  /api/openclaw/tools         — list all registered OpenClaw tools
 *   POST /api/openclaw/tools/execute — execute a tool by name
 *   GET  /api/openclaw/export        — export all Claw Machine skills as OpenClaw tools
 *
 * This makes Claw Machine's skill registry bidirectionally compatible with
 * the OpenClaw plugin ecosystem.
 */

import { Router, Request, Response } from "express";
import type { OpenClawAdapter } from "../adapters/OpenClawAdapter";
import type { SkillRegistry } from "../skills/SkillRegistry";
import { ValidationError } from "../errors/AppError";

function ok(res: Response, data: unknown) {
  res.json({ success: true, ...((typeof data === "object" && data !== null) ? data : { data }) });
}

export function createOpenClawRouter(adapter: OpenClawAdapter, registry: SkillRegistry): Router {
  const router = Router();

  // GET /api/openclaw/tools — list all skills exportable as OpenClaw tools
  router.get("/tools", (_req: Request, res: Response) => {
    const tools = adapter.exportAllAsOpenClawTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      ownerOnly: t.ownerOnly ?? false,
    }));
    ok(res, { tools, count: tools.length });
  });

  // POST /api/openclaw/tools/execute — execute a tool
  router.post("/tools/execute", async (req: Request, res: Response) => {
    const name = req.body?.name;
    if (typeof name !== "string" || !name) {
      throw new ValidationError("name is required", "API_001_INVALID_REQUEST", { field: "name" });
    }
    const params = req.body?.params ?? {};

    const tool = adapter.toOpenClawTool(name);
    if (!tool) {
      res.status(404).json({ success: false, error: `Tool "${name}" not found` });
      return;
    }

    const result = await tool.execute(`req-${Date.now()}`, params);
    ok(res, { name, result });
  });

  // GET /api/openclaw/export — full export manifest for OpenClaw integration
  router.get("/export", (_req: Request, res: Response) => {
    const skills = registry.list().filter((s) => s.enabled);
    const tools = skills.map((s) => adapter.toOpenClawTool(s.id)).filter(Boolean);
    ok(res, {
      frameworkName: "claw-machine",
      version: "4.0.0",
      toolCount: tools.length,
      tools: tools.map((t) => ({
        name: t!.name,
        description: t!.description,
        inputSchema: t!.inputSchema,
      })),
    });
  });

  return router;
}

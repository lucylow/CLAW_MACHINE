/**
 * Skill management routes
 * GET    /api/agent/skills           — list all skills
 * GET    /api/agent/skills/:id       — get skill details
 * POST   /api/agent/skills/:id/enable  — enable a skill
 * POST   /api/agent/skills/:id/disable — disable a skill
 * POST   /api/agent/skills/execute   — execute a skill directly
 */
import { Router, Request, Response } from "express";
import type { SkillRegistry } from "../skills/SkillRegistry";
import { NotFoundError, ValidationError } from "../errors/AppError";

export function createSkillsRouter(registry: SkillRegistry): Router {
  const router = Router();

  const ok = (res: Response, data: unknown, meta: Record<string, unknown> = {}) =>
    res.json({ ok: true, data, meta: { ...meta, timestamp: Date.now() } });

  // GET /api/agent/skills — list all
  router.get("/", (_req: Request, res: Response) => {
    const skillList = registry.list();
    ok(res, { skills: skillList, count: skillList.length });
  });

  // GET /api/agent/skills/:id — get one
  router.get("/:id", (req: Request, res: Response) => {
    const manifest = registry.getManifest(req.params.id);
    if (!manifest) throw new NotFoundError(`Skill "${req.params.id}" not found`, "SKILL_001_NOT_FOUND");
    ok(res, { skill: manifest });
  });

  // POST /api/agent/skills/:id/enable
  router.post("/:id/enable", (req: Request, res: Response) => {
    const manifest = registry.getManifest(req.params.id);
    if (!manifest) throw new NotFoundError(`Skill "${req.params.id}" not found`, "SKILL_001_NOT_FOUND");
    manifest.enabled = true;
    ok(res, { skillId: req.params.id, enabled: true });
  });

  // POST /api/agent/skills/:id/disable
  router.post("/:id/disable", (req: Request, res: Response) => {
    const manifest = registry.getManifest(req.params.id);
    if (!manifest) throw new NotFoundError(`Skill "${req.params.id}" not found`, "SKILL_001_NOT_FOUND");
    manifest.enabled = false;
    ok(res, { skillId: req.params.id, enabled: false });
  });

  // POST /api/agent/skills/execute
  router.post("/execute", async (req: Request, res: Response) => {
    const { skillId, params } = req.body ?? {};
    if (!skillId) throw new ValidationError("skillId is required", "API_001_INVALID_REQUEST", { field: "skillId" });
    const result = await registry.execute(skillId, params ?? {});
    ok(res, { skillId, result });
  });

  return router;
}

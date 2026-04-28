/**
 * Evolution Routes
 *
 * REST endpoints for the SkillEvolutionEngine:
 *   POST /api/evolution/evolve      — evolve a new skill from a description
 *   GET  /api/evolution/skills      — list all evolved skills
 *   POST /api/evolution/load        — reload evolved skills from 0G Storage
 *   GET  /api/evolution/status      — engine status
 *
 * On-chain registry endpoints:
 *   GET  /api/onchain/skills        — list on-chain skills
 *   POST /api/onchain/publish       — publish a skill to the chain
 *   POST /api/onchain/endorse/:key  — endorse a skill
 *   GET  /api/onchain/skill/:id     — get skill by string id
 */

import { Router, Request, Response } from "express";
import type { SkillEvolutionEngine } from "../../../packages/core/src/evolution/SkillEvolutionEngine.js";
import type { OnChainSkillRegistry } from "../onchain/OnChainSkillRegistry.js";

export function createEvolutionRouter(
  engine: SkillEvolutionEngine,
  chainRegistry: OnChainSkillRegistry,
): Router {
  const router = Router();

  // ── Evolution endpoints ──────────────────────────────────────────────────

  /**
   * POST /api/evolution/evolve
   * Body: { description, exampleInputs?, expectedOutputShape?, tags?, minScore?, maxAttempts? }
   */
  router.post("/evolve", async (req: Request, res: Response) => {
    const { description, exampleInputs, expectedOutputShape, tags, minScore, maxAttempts } = req.body;
    if (!description || typeof description !== "string") {
      return res.status(400).json({ ok: false, error: { message: "description is required" } });
    }
    try {
      const result = await engine.evolve({
        description,
        exampleInputs,
        expectedOutputShape,
        tags,
        minScore: minScore ? Number(minScore) : undefined,
        maxAttempts: maxAttempts ? Number(maxAttempts) : undefined,
      });
      return res.json({ ok: true, payload: result });
    } catch (err) {
      return res.status(500).json({ ok: false, error: { message: (err as Error).message } });
    }
  });

  /**
   * GET /api/evolution/skills
   */
  router.get("/skills", (_req: Request, res: Response) => {
    const skills = engine.listEvolvedSkills();
    return res.json({ ok: true, payload: { skills, count: skills.length } });
  });

  /**
   * POST /api/evolution/load
   * Reload evolved skills from 0G Storage (e.g., after restart)
   */
  router.post("/load", async (_req: Request, res: Response) => {
    try {
      const count = await engine.loadEvolvedSkills();
      return res.json({ ok: true, payload: { loaded: count } });
    } catch (err) {
      return res.status(500).json({ ok: false, error: { message: (err as Error).message } });
    }
  });

  /**
   * GET /api/evolution/status
   */
  router.get("/status", (_req: Request, res: Response) => {
    const evolved = engine.listEvolvedSkills();
    return res.json({
      ok: true,
      payload: {
        evolvedSkillCount: evolved.length,
        avgScore: evolved.length > 0
          ? evolved.reduce((s, e) => s + e.score, 0) / evolved.length
          : 0,
        topSkills: evolved.slice(0, 5).map(e => ({
          id: e.id,
          description: e.description.slice(0, 60),
          score: e.score,
          version: e.version,
        })),
      },
    });
  });

  return router;
}

export function createOnChainRouter(chainRegistry: OnChainSkillRegistry): Router {
  const router = Router();

  /**
   * GET /api/onchain/skills
   */
  router.get("/skills", async (req: Request, res: Response) => {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    try {
      const skills = await chainRegistry.listChainSkills(limit);
      return res.json({ ok: true, payload: { skills, count: skills.length, mode: chainRegistry.mode } });
    } catch (err) {
      return res.status(500).json({ ok: false, error: { message: (err as Error).message } });
    }
  });

  /**
   * POST /api/onchain/publish
   * Body: { id, name, description, contentHash, tags, requiresWallet?, touchesChain?, usesCompute?, usesStorage? }
   */
  router.post("/publish", async (req: Request, res: Response) => {
    const { id, name, description, contentHash, tags } = req.body;
    if (!id || !name || !contentHash) {
      return res.status(400).json({ ok: false, error: { message: "id, name, contentHash required" } });
    }
    try {
      const result = await chainRegistry.publishSkill({
        id, name, description: description || "", contentHash,
        tags: tags || [],
        requiresWallet: Boolean(req.body.requiresWallet),
        touchesChain: Boolean(req.body.touchesChain),
        usesCompute: Boolean(req.body.usesCompute),
        usesStorage: Boolean(req.body.usesStorage),
      });
      return res.json({ ok: true, payload: result });
    } catch (err) {
      return res.status(500).json({ ok: false, error: { message: (err as Error).message } });
    }
  });

  /**
   * POST /api/onchain/endorse/:key
   */
  router.post("/endorse/:key", async (req: Request, res: Response) => {
    try {
      const txHash = await chainRegistry.endorseSkill(req.params.key);
      return res.json({ ok: true, payload: { txHash } });
    } catch (err) {
      return res.status(500).json({ ok: false, error: { message: (err as Error).message } });
    }
  });

  /**
   * GET /api/onchain/skill/:id
   */
  router.get("/skill/:id", async (req: Request, res: Response) => {
    try {
      const skill = await chainRegistry.getSkillById(req.params.id);
      if (!skill) return res.status(404).json({ ok: false, error: { message: "Skill not found" } });
      return res.json({ ok: true, payload: skill });
    } catch (err) {
      return res.status(500).json({ ok: false, error: { message: (err as Error).message } });
    }
  });

  return router;
}

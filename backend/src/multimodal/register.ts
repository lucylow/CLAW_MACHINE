import type { Express, NextFunction, Request, Response } from "express";
import { AgentBus } from "../../../packages/core/src/multimodal/agentBus";
import { MultimodalPreprocessor } from "../../../packages/core/src/multimodal/preprocess";
import { MultimodalReasoningLoop } from "../../../packages/core/src/multimodal/reasoningLoop";
import type {
  AgentBusSendInput,
  MultimodalComputeClient,
  MultimodalInput,
  MultimodalStorageClient,
} from "../../../packages/core/src/multimodal/types";

export interface MultimodalDeps {
  compute: MultimodalComputeClient;
  storage: MultimodalStorageClient;
  bus?: AgentBus;
  requireAuth?: (req: Request, res: Response, next: NextFunction) => void | Promise<void>;
}

export function mountMultimodalIntegration(app: Express, deps: MultimodalDeps) {
  const preprocessor = new MultimodalPreprocessor({
    compute: deps.compute,
    options: { allowMockFallback: true, maxAssets: 12, cacheTtlMs: 1000 * 60 * 3 },
  });
  const reasoning = new MultimodalReasoningLoop({ compute: deps.compute, storage: deps.storage, bus: deps.bus });

  const guard = deps.requireAuth
    ? (req: Request, res: Response, next: NextFunction) => Promise.resolve(deps.requireAuth!(req, res, next))
    : (_req: Request, _res: Response, next: NextFunction) => next();

  app.post("/api/multimodal/process", guard, async (req, res) => {
    try {
      const input = req.body as MultimodalInput;
      const data = await preprocessor.process(input);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/multimodal/reason", guard, async (req, res) => {
    try {
      const input = req.body as MultimodalInput;
      const data = await reasoning.run(input);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.get("/api/agentbus/stats", async (_req, res) => {
    try {
      res.json({ ok: true, data: deps.bus?.stats() ?? null });
    } catch (error) {
      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/agentbus/send", guard, async (req, res) => {
    try {
      if (!deps.bus) throw new Error("AgentBus is not configured");
      const data = await deps.bus.send(req.body as AgentBusSendInput);
      res.json({ ok: true, data });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/agentbus/receive", guard, async (req, res) => {
    try {
      if (!deps.bus) throw new Error("AgentBus is not configured");
      const data = await deps.bus.receive(req.body || {});
      res.json({ ok: true, data });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/agentbus/ack", guard, async (req, res) => {
    try {
      if (!deps.bus) throw new Error("AgentBus is not configured");
      const ok = await deps.bus.ack(req.body);
      res.json({ ok: true, data: { ok } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post("/api/agentbus/nack", guard, async (req, res) => {
    try {
      if (!deps.bus) throw new Error("AgentBus is not configured");
      const ok = await deps.bus.nack(req.body);
      res.json({ ok: true, data: { ok } });
    } catch (error) {
      res.status(400).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  return { preprocessor, reasoning };
}

/**
 * Builder Routes
 *
 * Backend support for the Visual No-Code Agent Builder:
 *   POST /api/builder/deploy   — deploy a visual pipeline as a live agent config
 *   GET  /api/builder/pipelines — list saved pipelines
 *   GET  /api/builder/pipeline/:id — get a pipeline
 *   DELETE /api/builder/pipeline/:id — delete a pipeline
 */

import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";

interface PipelineNode {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

interface PipelineEdge {
  from: string;
  to: string;
}

interface SavedPipeline {
  id: string;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
  generatedCode: string;
  deployedAt: number;
  agentId: string;
}

// In-memory store (would use 0G Storage in production)
const pipelines = new Map<string, SavedPipeline>();

export function createBuilderRouter(): Router {
  const router = Router();

  /**
   * POST /api/builder/deploy
   * Body: { nodes, edges, generatedCode }
   */
  router.post("/deploy", async (req: Request, res: Response) => {
    const { nodes, edges, generatedCode } = req.body;
    if (!nodes || !Array.isArray(nodes)) {
      return res.status(400).json({ ok: false, error: { message: "nodes array required" } });
    }

    // Validate pipeline has at least a trigger and output
    const hasTrigger = nodes.some((n: PipelineNode) => n.type === "trigger");
    const hasOutput  = nodes.some((n: PipelineNode) => n.type === "output");
    if (!hasTrigger || !hasOutput) {
      return res.status(400).json({
        ok: false,
        error: { message: "Pipeline must have at least one Trigger and one Output node" },
      });
    }

    const agentId = `visual-agent-${Date.now()}`;
    const pipelineId = randomUUID();

    const pipeline: SavedPipeline = {
      id: pipelineId,
      nodes,
      edges: edges || [],
      generatedCode: generatedCode || "",
      deployedAt: Date.now(),
      agentId,
    };
    pipelines.set(pipelineId, pipeline);

    // Build a summary of what was deployed
    const skillNodes = nodes.filter((n: PipelineNode) => n.type === "skill");
    const evolveNodes = nodes.filter((n: PipelineNode) => n.type === "evolve");
    const computeNodes = nodes.filter((n: PipelineNode) => n.type === "compute");

    return res.json({
      ok: true,
      payload: {
        agentId,
        pipelineId,
        summary: {
          totalNodes: nodes.length,
          totalEdges: (edges || []).length,
          skillNodes: skillNodes.length,
          evolveNodes: evolveNodes.length,
          computeNodes: computeNodes.length,
          models: computeNodes.map((n: PipelineNode) => n.config.model).filter(Boolean),
        },
        message: `Visual agent "${agentId}" deployed with ${nodes.length} nodes`,
      },
    });
  });

  /**
   * GET /api/builder/pipelines
   */
  router.get("/pipelines", (_req: Request, res: Response) => {
    const list = [...pipelines.values()].map(p => ({
      id: p.id,
      agentId: p.agentId,
      nodeCount: p.nodes.length,
      edgeCount: p.edges.length,
      deployedAt: p.deployedAt,
    }));
    return res.json({ ok: true, payload: { pipelines: list, count: list.length } });
  });

  /**
   * GET /api/builder/pipeline/:id
   */
  router.get("/pipeline/:id", (req: Request, res: Response) => {
    const p = pipelines.get(req.params.id);
    if (!p) return res.status(404).json({ ok: false, error: { message: "Pipeline not found" } });
    return res.json({ ok: true, payload: p });
  });

  /**
   * DELETE /api/builder/pipeline/:id
   */
  router.delete("/pipeline/:id", (req: Request, res: Response) => {
    if (!pipelines.has(req.params.id)) {
      return res.status(404).json({ ok: false, error: { message: "Pipeline not found" } });
    }
    pipelines.delete(req.params.id);
    return res.json({ ok: true, payload: { deleted: req.params.id } });
  });

  return router;
}

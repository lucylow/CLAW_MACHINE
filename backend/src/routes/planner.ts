/**
 * Planner Routes
 *
 * Exposes the HierarchicalPlanner via REST:
 *   POST /api/agent/plan        — create and execute a new plan
 *   GET  /api/agent/plans       — list recent plans
 *   GET  /api/agent/plans/:id   — get a specific plan
 */

import { Router, Request, Response } from "express";
import type { HierarchicalPlanner } from "../core/HierarchicalPlanner";
import type { AgentRuntime } from "../core/AgentRuntime";
import { ValidationError } from "../errors/AppError";

function ok(res: Response, data: unknown) {
  res.json({ success: true, ...((typeof data === "object" && data !== null) ? data : { data }) });
}

function requireString(val: unknown, field: string, max = 2000): string {
  if (typeof val !== "string" || !val.trim()) {
    throw new ValidationError(`${field} must be a non-empty string`, "API_001_INVALID_REQUEST", { field });
  }
  if (val.length > max) {
    throw new ValidationError(`${field} exceeds max length ${max}`, "API_001_INVALID_REQUEST", { field, max });
  }
  return val.trim();
}

export function createPlannerRouter(planner: HierarchicalPlanner, runtime: AgentRuntime): Router {
  const router = Router();

  // POST /api/agent/plan — decompose goal and execute
  router.post("/", async (req: Request, res: Response) => {
    const goal = requireString(req.body?.goal, "goal", 1000);
    const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
    const sessionId = walletAddress ?? "guest";

    // Create the plan
    const plan = await planner.createPlan(goal, { sessionId, walletAddress });

    // Execute asynchronously — return the plan immediately, client polls for updates
    planner.executePlan(plan, {
      maxConcurrency: 2,
      taskExecutor: async (task) => {
        const result = await runtime.runTurn(
          { input: task.goal, walletAddress, sessionId },
        );
        return result.output;
      },
    }).catch(() => {
      // Errors are captured per-task in the plan object
    });

    ok(res, { plan });
  });

  // GET /api/agent/plans — list recent plans
  router.get("/", (req: Request, res: Response) => {
    const plans = planner.listPlans().slice(0, 20);
    ok(res, { plans, count: plans.length });
  });

  // GET /api/agent/plans/:id — get specific plan
  router.get("/:id", (req: Request, res: Response) => {
    const plan = planner.getPlan(req.params.id);
    if (!plan) {
      res.status(404).json({ success: false, error: "Plan not found" });
      return;
    }
    ok(res, { plan });
  });

  return router;
}

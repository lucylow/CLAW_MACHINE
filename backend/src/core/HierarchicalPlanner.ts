/**
 * HierarchicalPlanner
 *
 * Decomposes complex goals into a dependency graph of sub-tasks, executes them
 * in topological order (parallel where possible), and synthesizes a final result.
 *
 * This implements the "hierarchical planning" module described in the hackathon
 * track requirements:
 *   "New OpenClaw modules for hierarchical planning, reflection loops, or
 *    multi-modal reasoning that natively integrate 0G Compute's sealed inference"
 *
 * Plan versioning is included so memory snapshots remain compatible across
 * framework upgrades.
 */

import { randomUUID } from "crypto";
import type { ZeroGComputeAdapter } from "../adapters/ZeroGComputeAdapter";
import { PLANNER_SYSTEM, buildPlannerPrompt, buildSynthesisPrompt } from "../prompts/templates";

// ── Types ─────────────────────────────────────────────────────────────────────

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface PlanTask {
  id: string;
  goal: string;
  /** IDs of tasks that must complete before this one can start */
  dependencies: string[];
  status: TaskStatus;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  skillHint?: string; // suggested skill to use
}

export interface Plan {
  planId: string;
  originalGoal: string;
  tasks: PlanTask[];
  finalResult?: string;
  status: "planning" | "executing" | "completed" | "failed";
  createdAt: number;
  completedAt?: number;
  /** Semantic version of the plan schema */
  schemaVersion: string;
  sessionId: string;
  walletAddress?: string;
}

export interface PlanExecutionOptions {
  /** Maximum number of tasks to run in parallel */
  maxConcurrency?: number;
  /** Executor function called for each task */
  taskExecutor: (task: PlanTask, plan: Plan) => Promise<string>;
  /** Optional progress callback */
  onTaskComplete?: (task: PlanTask, plan: Plan) => void;
}

// ── Planner ───────────────────────────────────────────────────────────────────

export class HierarchicalPlanner {
  private readonly compute: ZeroGComputeAdapter;
  private readonly SCHEMA_VERSION = "1.0.0";
  private readonly activePlans = new Map<string, Plan>();

  constructor(compute: ZeroGComputeAdapter) {
    this.compute = compute;
  }

  // ── Plan Creation ─────────────────────────────────────────────────────────

  /**
   * Decompose a goal into a dependency graph of sub-tasks using 0G Compute.
   * Returns a versioned Plan ready for execution.
   */
  async createPlan(
    goal: string,
    context: { sessionId: string; walletAddress?: string; lessonContext?: string },
  ): Promise<Plan> {
    const prompt = buildPlannerPrompt(goal, context.lessonContext);

    const response = await this.compute.infer({
      messages: [
        { role: "system", content: PLANNER_SYSTEM },
        { role: "user", content: prompt },
      ],
      verifiable: true,
    });

    let rawTasks: Array<{
      id?: string;
      goal: string;
      dependencies?: string[];
      skillHint?: string;
    }>;

    try {
      rawTasks = JSON.parse(response.content);
      if (!Array.isArray(rawTasks)) throw new Error("not array");
    } catch {
      // Fallback: single-task plan
      rawTasks = [{ goal, dependencies: [] }];
    }

    const tasks: PlanTask[] = rawTasks.map((t, i) => ({
      id: t.id ?? `task-${i + 1}`,
      goal: t.goal ?? goal,
      dependencies: t.dependencies ?? [],
      status: "pending",
      skillHint: t.skillHint,
    }));

    // Validate dependency references
    const taskIds = new Set(tasks.map((t) => t.id));
    for (const task of tasks) {
      task.dependencies = task.dependencies.filter((d) => taskIds.has(d));
    }

    const plan: Plan = {
      planId: randomUUID(),
      originalGoal: goal,
      tasks,
      status: "planning",
      createdAt: Date.now(),
      schemaVersion: this.SCHEMA_VERSION,
      sessionId: context.sessionId,
      walletAddress: context.walletAddress,
    };

    this.activePlans.set(plan.planId, plan);
    return plan;
  }

  // ── Plan Execution ────────────────────────────────────────────────────────

  /**
   * Execute a plan by running tasks in topological order.
   * Tasks with no pending dependencies run in parallel up to maxConcurrency.
   */
  async executePlan(plan: Plan, options: PlanExecutionOptions): Promise<Plan> {
    const maxConcurrency = options.maxConcurrency ?? 3;
    plan.status = "executing";

    const completed = new Set<string>();
    const failed = new Set<string>();

    while (true) {
      // Find tasks ready to run
      const ready = plan.tasks.filter(
        (t) =>
          t.status === "pending" &&
          t.dependencies.every((d) => completed.has(d)),
      );

      if (ready.length === 0) break;

      // Skip tasks whose dependencies failed
      for (const task of plan.tasks) {
        if (task.status === "pending" && task.dependencies.some((d) => failed.has(d))) {
          task.status = "skipped";
        }
      }

      // Run batch in parallel
      const batch = ready.slice(0, maxConcurrency);
      await Promise.allSettled(
        batch.map(async (task) => {
          task.status = "running";
          task.startedAt = Date.now();
          try {
            task.result = await options.taskExecutor(task, plan);
            task.status = "completed";
            task.completedAt = Date.now();
            completed.add(task.id);
            options.onTaskComplete?.(task, plan);
          } catch (err) {
            task.status = "failed";
            task.error = err instanceof Error ? err.message : String(err);
            task.completedAt = Date.now();
            failed.add(task.id);
            options.onTaskComplete?.(task, plan);
          }
        }),
      );
    }

    // Synthesize final result from completed task outputs
    const completedTasks = plan.tasks.filter((t) => t.status === "completed");
    if (completedTasks.length > 0) {
      const synthPrompt = buildSynthesisPrompt(
        plan.originalGoal,
        completedTasks.map((t) => ({ goal: t.goal, result: t.result ?? "" })),
      );
      const synthResponse = await this.compute.infer({
        messages: [
          { role: "system", content: "You are a synthesis agent. Combine task results into a coherent final answer." },
          { role: "user", content: synthPrompt },
        ],
      });
      plan.finalResult = synthResponse.content;
    } else {
      plan.finalResult = "All tasks failed or were skipped.";
    }

    plan.status = failed.size === plan.tasks.length ? "failed" : "completed";
    plan.completedAt = Date.now();
    return plan;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getPlan(planId: string): Plan | undefined {
    return this.activePlans.get(planId);
  }

  listPlans(): Plan[] {
    return Array.from(this.activePlans.values()).sort((a, b) => b.createdAt - a.createdAt);
  }
}

/**
 * PlanExecutor
 *
 * Executes hierarchical plans produced by the LLM planner.
 * Tasks with no unresolved dependencies run in parallel up to
 * the configured maxParallelism limit.
 *
 * New in v3:
 *   - cancel(planId) — abort an in-flight plan
 *   - getActivePlans() — list currently executing plans
 *   - per-plan and per-task timeouts
 */

import { randomUUID } from "crypto";
import type {
  Plan,
  PlanTask,
  WalletAddress,
  ComputeAdapter,
} from "./types.js";
import type { SkillRunner } from "./SkillRunner.js";

interface PlanExecutorDeps {
  compute: ComputeAdapter;
  skillRunner: SkillRunner;
  maxParallelism: number;
  /** Optional per-plan timeout in ms. Default: no timeout. */
  planTimeoutMs?: number;
  /** Optional per-task timeout in ms. Default: no timeout. */
  taskTimeoutMs?: number;
}

export class PlanExecutor {
  private readonly deps: PlanExecutorDeps;
  /** Plans currently executing, keyed by plan id. */
  private readonly activePlans: Map<string, { plan: Plan; abortController: AbortController }> = new Map();

  constructor(deps: PlanExecutorDeps) {
    this.deps = deps;
  }

  /** Return a snapshot of all currently executing plans. */
  getActivePlans(): Plan[] {
    return [...this.activePlans.values()].map((e) => ({ ...e.plan }));
  }

  /**
   * Cancel an in-flight plan by id.
   * All pending tasks are immediately marked as "skipped".
   * Returns true if the plan was found and cancelled.
   */
  cancel(planId: string): boolean {
    const entry = this.activePlans.get(planId);
    if (!entry) return false;
    entry.abortController.abort();
    for (const task of entry.plan.tasks) {
      if (task.status === "pending" || task.status === "running") {
        task.status = "skipped";
        task.error = "Cancelled by caller";
      }
    }
    entry.plan.status = "failed";
    entry.plan.completedAt = Date.now();
    this.activePlans.delete(planId);
    return true;
  }

  async execute(goal: string, walletAddress?: WalletAddress): Promise<Plan> {
    const planId = randomUUID();
    const createdAt = Date.now();
    const abortController = new AbortController();

    // Step 1: LLM decomposes the goal into tasks
    let tasks: PlanTask[] = [];
    try {
      const skills = this.deps.skillRunner.listEnabled();
      const skillList = skills.map((s) => `${s.id}: ${s.description}`).join("\n");
      const resp = await this.deps.compute.complete({
        messages: [
          {
            role: "system",
            content: `You are a planning agent. Decompose the given goal into 2-5 concrete tasks.
Return ONLY a JSON array of task objects with this shape:
[{ "id": "t1", "goal": "...", "dependsOn": [], "skillHint": "skill.id or null" }]
Rules:
  - Each task must have a unique id (t1, t2, ...).
  - dependsOn lists ids of tasks that must complete before this one starts.
  - skillHint is the id of the most relevant skill, or null.
  - Do not include explanation text outside the JSON array.
Available skills:\n${skillList || "none"}`,
          },
          { role: "user", content: goal },
        ],
        temperature: 0.3,
        maxTokens: 600,
      });

      const raw = resp.content.trim();
      const jsonStr = raw.startsWith("[") ? raw : raw.slice(raw.indexOf("["));
      const parsed = JSON.parse(jsonStr) as Array<{
        id: string;
        goal: string;
        dependsOn?: string[];
        skillHint?: string;
      }>;
      tasks = parsed.map((t) => ({
        id: t.id,
        goal: t.goal,
        dependsOn: t.dependsOn ?? [],
        skillHint: t.skillHint ?? undefined,
        status: "pending" as const,
      }));
    } catch {
      // Fallback: single task
      tasks = [{ id: "t1", goal, dependsOn: [], status: "pending" }];
    }

    const plan: Plan = {
      id: planId,
      goal,
      tasks,
      status: "running",
      walletAddress,
      createdAt,
      schemaVersion: "1.1",
    };

    this.activePlans.set(planId, { plan, abortController });

    // Optional plan-level timeout
    let planTimer: ReturnType<typeof setTimeout> | undefined;
    if (this.deps.planTimeoutMs) {
      planTimer = setTimeout(() => {
        if (this.activePlans.has(planId)) {
          this.cancel(planId);
        }
      }, this.deps.planTimeoutMs);
    }

    try {
      await this.executeTasks(plan, abortController.signal);
    } finally {
      clearTimeout(planTimer);
      this.activePlans.delete(planId);
    }

    return plan;
  }

  private async executeTasks(plan: Plan, signal: AbortSignal): Promise<void> {
    const results: Map<string, string> = new Map();

    const isReady = (task: PlanTask) =>
      task.status === "pending" &&
      task.dependsOn.every((dep) => {
        const depTask = plan.tasks.find((t) => t.id === dep);
        return depTask?.status === "completed";
      });

    let iterations = 0;
    while (plan.tasks.some((t) => t.status === "pending" || t.status === "running")) {
      if (signal.aborted) break;
      if (++iterations > 20) break; // safety

      const ready = plan.tasks.filter(isReady).slice(0, this.deps.maxParallelism);
      if (ready.length === 0) {
        const pending = plan.tasks.filter((t) => t.status === "pending");
        if (pending.length > 0) {
          for (const t of pending) { t.status = "skipped"; t.error = "Dependency deadlock"; }
        }
        break;
      }

      for (const task of ready) task.status = "running";

      await Promise.allSettled(
        ready.map(async (task) => {
          if (signal.aborted) { task.status = "skipped"; task.error = "Cancelled"; return; }
          task.startedAt = Date.now();
          try {
            const depContext = task.dependsOn
              .map((dep) => results.get(dep))
              .filter(Boolean)
              .join("\n");

            let result: string;

            // Try skill execution first
            if (task.skillHint && this.deps.skillRunner.has(task.skillHint)) {
              const skillResult = this.deps.taskTimeoutMs
                ? await this.deps.skillRunner.executeWithTimeout(
                    task.skillHint,
                    { goal: task.goal, context: depContext },
                    this.deps.taskTimeoutMs,
                  )
                : await this.deps.skillRunner.execute(
                    task.skillHint,
                    { goal: task.goal, context: depContext },
                  );
              result = typeof skillResult.output === "string"
                ? skillResult.output
                : JSON.stringify(skillResult);
            } else {
              // Fall back to LLM
              const llmResp = await this.deps.compute.complete({
                messages: [
                  { role: "system", content: "Complete the given sub-task concisely. Return only the result." },
                  {
                    role: "user",
                    content: depContext
                      ? `Context:\n${depContext}\n\nTask: ${task.goal}`
                      : task.goal,
                  },
                ],
                temperature: 0.4,
              });
              result = llmResp.content;
            }

            task.result = result;
            task.status = "completed";
            task.completedAt = Date.now();
            results.set(task.id, result);
          } catch (err) {
            task.error = err instanceof Error ? err.message : String(err);
            task.status = "failed";
            task.completedAt = Date.now();
          }
        }),
      );
    }

    // Synthesis
    const completedResults = plan.tasks
      .filter((t) => t.status === "completed" && t.result)
      .map((t) => `[${t.id}] ${t.goal}:\n${t.result}`)
      .join("\n\n");

    if (completedResults && !signal.aborted) {
      try {
        const synthResp = await this.deps.compute.complete({
          messages: [
            {
              role: "system",
              content: "Synthesize the following task results into a single coherent answer for the original goal.",
            },
            {
              role: "user",
              content: `Goal: ${plan.goal}\n\nResults:\n${completedResults}`,
            },
          ],
        });
        plan.synthesisResult = synthResp.content;
      } catch {
        plan.synthesisResult = completedResults;
      }
    }

    const allOk = plan.tasks.every((t) => t.status === "completed" || t.status === "skipped");
    plan.status = signal.aborted ? "failed" : allOk ? "completed" : "failed";
    plan.completedAt = Date.now();
  }
}

/**
 * PlanExecutor
 *
 * Executes hierarchical plans produced by the LLM planner.
 * Tasks with no unresolved dependencies run in parallel up to
 * the configured maxParallelism limit.
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
}

export class PlanExecutor {
  private readonly deps: PlanExecutorDeps;

  constructor(deps: PlanExecutorDeps) {
    this.deps = deps;
  }

  async execute(goal: string, walletAddress?: WalletAddress): Promise<Plan> {
    const planId = randomUUID();
    const createdAt = Date.now();

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
      schemaVersion: "1.0",
    };

    // Step 2: Execute tasks respecting dependencies
    const results: Map<string, string> = new Map();

    const isReady = (task: PlanTask) =>
      task.status === "pending" &&
      task.dependsOn.every((dep) => {
        const depTask = plan.tasks.find((t) => t.id === dep);
        return depTask?.status === "completed";
      });

    let iterations = 0;
    while (plan.tasks.some((t) => t.status === "pending" || t.status === "running")) {
      if (++iterations > 20) break; // safety

      const ready = plan.tasks.filter(isReady).slice(0, this.deps.maxParallelism);
      if (ready.length === 0) {
        // Check for deadlock
        const pending = plan.tasks.filter((t) => t.status === "pending");
        if (pending.length > 0) {
          for (const t of pending) t.status = "skipped";
        }
        break;
      }

      // Mark as running
      for (const task of ready) task.status = "running";

      // Execute in parallel
      await Promise.allSettled(
        ready.map(async (task) => {
          task.startedAt = Date.now();
          try {
            // Build context from completed dependencies
            const depContext = task.dependsOn
              .map((dep) => results.get(dep))
              .filter(Boolean)
              .join("\n");

            let result: string;
            if (task.skillHint && this.deps.skillRunner.has(task.skillHint)) {
              const skillResult = await this.deps.skillRunner.execute(task.skillHint, {
                input: task.goal,
                context: depContext,
                walletAddress,
              });
              result = typeof skillResult.output === "string"
                ? skillResult.output
                : JSON.stringify(skillResult);
            } else {
              const resp = await this.deps.compute.complete({
                messages: [
                  {
                    role: "system",
                    content: "Complete the given sub-task concisely. Return only the result.",
                  },
                  {
                    role: "user",
                    content: depContext
                      ? `Context:\n${depContext}\n\nTask: ${task.goal}`
                      : task.goal,
                  },
                ],
                temperature: 0.4,
              });
              result = resp.content;
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

    // Step 3: Synthesis
    const completedResults = plan.tasks
      .filter((t) => t.status === "completed" && t.result)
      .map((t) => `[${t.id}] ${t.goal}:\n${t.result}`)
      .join("\n\n");

    if (completedResults) {
      try {
        const synthResp = await this.deps.compute.complete({
          messages: [
            {
              role: "system",
              content: "Synthesize the following task results into a single coherent answer for the original goal.",
            },
            {
              role: "user",
              content: `Goal: ${goal}\n\nResults:\n${completedResults}`,
            },
          ],
        });
        plan.synthesisResult = synthResp.content;
      } catch {
        plan.synthesisResult = completedResults;
      }
    }

    const allOk = plan.tasks.every((t) => t.status === "completed" || t.status === "skipped");
    plan.status = allOk ? "completed" : "failed";
    plan.completedAt = Date.now();

    return plan;
  }
}

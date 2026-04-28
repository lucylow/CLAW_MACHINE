/**
 * Agent Swarm Skill
 * Coordinates multiple sub-agent "workers" to decompose and execute
 * a complex task in parallel, then aggregates their outputs.
 *
 * Architecture:
 *   Orchestrator Agent
 *     ├── Worker A (research)
 *     ├── Worker B (analysis)
 *     └── Worker C (synthesis)
 */
import { randomUUID } from "crypto";
import type { LlmProvider } from "../providers/llm/types";

export interface SwarmTask {
  id: string;
  role: string;
  prompt: string;
  status: "pending" | "running" | "done" | "failed";
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface SwarmResult {
  swarmId: string;
  tasks: SwarmTask[];
  synthesis: string;
  totalMs: number;
}

export class SwarmSkill {
  readonly id = "agent.swarm";
  readonly description = "Coordinate multiple sub-agents to solve complex tasks in parallel";

  constructor(private llm: LlmProvider) {}

  async execute(input: { goal: string; maxWorkers?: number }): Promise<SwarmResult> {
    const swarmId = randomUUID();
    const startTime = Date.now();
    const maxWorkers = Math.min(input.maxWorkers ?? 3, 5);

    // Step 1: Orchestrator decomposes the goal into sub-tasks
    const decompositionResponse = await this.llm.chat({
      messages: [
        {
          role: "system",
          content: `You are an orchestrator agent. Decompose the user goal into ${maxWorkers} parallel sub-tasks.
Return ONLY a JSON array: [{"role": "...", "prompt": "..."}]
Each task should be independent and executable in parallel.`,
        },
        { role: "user", content: input.goal },
      ],
      temperature: 0.3,
      maxTokens: 600,
    });

    let subTasks: Array<{ role: string; prompt: string }> = [];
    try {
      const raw = decompositionResponse.text.trim();
      // Extract JSON array even if wrapped in markdown code block
      const match = raw.match(/\[[\s\S]*\]/);
      subTasks = match ? JSON.parse(match[0]) : [];
    } catch {
      // Fallback: create a single generic task
      subTasks = [{ role: "general", prompt: input.goal }];
    }

    // Step 2: Execute sub-tasks in parallel
    const tasks: SwarmTask[] = subTasks.slice(0, maxWorkers).map((t) => ({
      id: randomUUID(),
      role: t.role,
      prompt: t.prompt,
      status: "pending" as const,
    }));

    const workerPromises = tasks.map(async (task) => {
      task.status = "running";
      task.startedAt = Date.now();
      try {
        const response = await this.llm.chat({
          messages: [
            {
              role: "system",
              content: `You are a specialized sub-agent with role: ${task.role}. Be concise and focused.`,
            },
            { role: "user", content: task.prompt },
          ],
          temperature: 0.5,
          maxTokens: 400,
        });
        task.result = response.text;
        task.status = "done";
      } catch (err: unknown) {
        task.error = err instanceof Error ? err.message : String(err);
        task.status = "failed";
      } finally {
        task.completedAt = Date.now();
      }
      return task;
    });

    await Promise.allSettled(workerPromises);

    // Step 3: Synthesize results
    const successfulResults = tasks
      .filter((t) => t.status === "done")
      .map((t) => `[${t.role}]: ${t.result}`)
      .join("\n\n");

    let synthesis = "No successful worker results to synthesize.";
    if (successfulResults) {
      const synthResponse = await this.llm.chat({
        messages: [
          {
            role: "system",
            content: "You are a synthesis agent. Combine the worker outputs into a coherent, concise final answer.",
          },
          {
            role: "user",
            content: `Goal: ${input.goal}\n\nWorker outputs:\n${successfulResults}`,
          },
        ],
        temperature: 0.3,
        maxTokens: 600,
      });
      synthesis = synthResponse.text;
    }

    return {
      swarmId,
      tasks,
      synthesis,
      totalMs: Date.now() - startTime,
    };
  }
}

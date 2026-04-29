/**
 * CLAW MACHINE — Coordinator Agent Example
 *
 * Demonstrates multi-agent delegation using runBatch():
 * - Decomposes a high-level goal into sub-tasks
 * - Dispatches sub-tasks to specialised worker agents in parallel
 * - Merges results and produces a final synthesis
 * - Stores all episodes + reflections in memory
 * - Prints a full stats summary at the end
 *
 * Run: npx tsx examples/coordinatorAgent.ts
 */

import { BaseAgent, AgentTurn } from "./baseAgent.js";

// ── Worker simulation ─────────────────────────────────────────────────────────

async function runWorker(name: string, task: string, shouldFail = false): Promise<string> {
  await new Promise((r) => setTimeout(r, 30 + Math.random() * 80));
  if (shouldFail) throw new Error(`${name} failed: simulated timeout`);
  return `${name} completed: ${task}`;
}

// ── Coordinator ───────────────────────────────────────────────────────────────

class CoordinatorAgent extends BaseAgent {
  constructor() { super("coordinatorAgent"); }

  async run() {
    const goal = "Resolve a critical production incident affecting payment processing";
    this.recordTurn({ role: "user", content: goal });

    const plan = this.plan("orchestrate sub-agents for incident resolution");

    const subTasks = [
      { name: "ResearchAgent",  task: "Identify root cause of payment failures in logs", fail: false },
      { name: "PlannerAgent",   task: "Draft a 5-step remediation plan",                  fail: false },
      { name: "OpsAgent",       task: "Roll back the faulty deployment",                   fail: true  }, // simulated failure
      { name: "SupportAgent",   task: "Draft customer communication for the incident",     fail: false },
      { name: "MarketAgent",    task: "Assess revenue impact of the outage",               fail: false },
    ];

    console.log(`\nDispatching ${subTasks.length} sub-agents in parallel...`);

    // Parallel execution
    const settled = await Promise.allSettled(
      subTasks.map((st) => runWorker(st.name, st.task, st.fail)),
    );

    const results: string[] = [];
    const failures: string[] = [];

    for (let i = 0; i < settled.length; i++) {
      const s = settled[i];
      const st = subTasks[i];
      if (s.status === "fulfilled") {
        results.push(s.value);
        this.toolCall(st.name, { status: "success", result: s.value });
        console.log(`  ✓ [${st.name}]`);
      } else {
        failures.push(`${st.name}: ${s.reason?.message ?? "unknown"}`);
        this.toolCall(st.name, { status: "failure", error: s.reason?.message });
        console.log(`  ✗ [${st.name}] ${s.reason?.message}`);
      }
    }

    // Synthesis
    const synthesis = [
      `Incident resolved with ${results.length}/${subTasks.length} sub-agents succeeding.`,
      `Successful outputs: ${results.join(" | ")}`,
      failures.length > 0 ? `Failures to retry: ${failures.join("; ")}` : "No failures.",
    ].join("\n");

    this.recordTurn({ role: "assistant", content: synthesis });
    this.success();

    const stats = this.finalize();
    console.log("\n=== Coordinator Stats ===");
    console.log(`Turns: ${stats.turns}, Tool calls: ${stats.toolCalls}, Plans: ${stats.plansBuilt}`);

    return { goal, plan, synthesis, subTaskResults: results, failures, stats };
  }
}

void (async () => {
  const agent = new CoordinatorAgent();
  const result = await agent.run();
  console.log("\n=== Final Result ===");
  console.log(JSON.stringify(result, null, 2));
})();

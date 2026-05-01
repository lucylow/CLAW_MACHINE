/**
 * CLAW MACHINE — Planner Agent Demo
 * Demonstrates: hierarchical goal decomposition, dependency graph execution,
 * blocked step handling, and plan summary.
 * Run: npx tsx backend/examples/plannerAgent.ts
 */
import { BaseAgent, AgentTurn } from "./baseAgent";

type NodeStatus = "pending" | "running" | "done" | "failed" | "blocked";

interface PlanNode {
  id: string;
  title: string;
  dependsOn: string[];
  status: NodeStatus;
  result?: string;
  error?: string;
  durationMs?: number;
}

class PlannerAgent extends BaseAgent {
  private graph: PlanNode[] = [];

  constructor() { super("plannerAgent"); }

  buildGraph(goal: string): PlanNode[] {
    this.graph = [
      { id: "n1", title: `Understand goal: ${goal}`, dependsOn: [], status: "pending" },
      { id: "n2", title: "Identify sub-goals", dependsOn: ["n1"], status: "pending" },
      { id: "n3", title: "Validate dependencies", dependsOn: ["n2"], status: "pending" },
      { id: "n4", title: "Check resource availability", dependsOn: ["n2"], status: "pending" },
      { id: "n5", title: "Emit executable steps", dependsOn: ["n3", "n4"], status: "pending" },
    ];
    this.stats.plansBuilt += 1;
    return this.graph;
  }

  private isReady(node: PlanNode): boolean {
    return node.dependsOn.every((dep) => {
      const depNode = this.graph.find((n) => n.id === dep);
      return depNode?.status === "done";
    });
  }

  async executeGraph(simulateFailAt?: string): Promise<void> {
    const maxPasses = this.graph.length + 1;
    for (let pass = 0; pass < maxPasses; pass++) {
      const pending = this.graph.filter((n) => n.status === "pending");
      if (pending.length === 0) break;

      for (const node of pending) {
        const hasFailed = this.graph.some((n) => n.dependsOn.includes(node.id) === false && node.dependsOn.includes(n.id) && n.status === "failed");
        if (hasFailed) { node.status = "blocked"; continue; }
        if (!this.isReady(node)) continue;

        node.status = "running";
        const t0 = Date.now();
        await new Promise((r) => setTimeout(r, 30));

        if (simulateFailAt && node.id === simulateFailAt) {
          node.status = "failed";
          node.error = `Simulated failure at ${node.id}`;
          this.failure();
          console.log(`  [plan] Step ${node.id} FAILED: ${node.error}`);
          // Mark dependents as blocked
          for (const dep of this.graph) {
            if (dep.dependsOn.includes(node.id)) dep.status = "blocked";
          }
        } else {
          node.status = "done";
          node.result = `Completed: ${node.title}`;
          node.durationMs = Date.now() - t0;
          console.log(`  [plan] Step ${node.id} done (${node.durationMs}ms): ${node.title}`);
        }
      }
    }
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: "user", content: "Plan an autonomous execution workflow for a software update.", timestamp: new Date().toISOString() },
      { role: "assistant", content: "Building hierarchical execution graph with dependency tracking.", timestamp: new Date().toISOString() },
      { role: "user", content: "Prefer safe defaults and handle partial failures.", timestamp: new Date().toISOString() },
    ];
    convo.forEach((t) => this.recordTurn(t));

    const graph = this.buildGraph("software update");
    this.toolCall("planner", { nodeCount: graph.length });
    this.toolCall("validator", { safety: "safe defaults" });

    console.log(`[plannerAgent] Executing graph with ${graph.length} nodes...`);
    await this.executeGraph(); // no failures
    this.success();

    const done = graph.filter((n) => n.status === "done").length;
    const blocked = graph.filter((n) => n.status === "blocked").length;
    const failed = graph.filter((n) => n.status === "failed").length;

    return {
      graph: graph.map(({ id, title, status, durationMs, error }) => ({ id, title, status, durationMs, error })),
      summary: { done, blocked, failed, total: graph.length },
      stats: this.finalize(),
    };
  }
}

void (async () => {
  const agent = new PlannerAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

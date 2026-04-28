/**
 * Framework Demo — examples/frameworkDemo.ts
 *
 * Demonstrates the full @claw/core framework API:
 *   - AgentBuilder fluent API
 *   - defineSkill factory
 *   - definePlugin factory
 *   - zeroGPlugin (mock mode — no credentials needed)
 *   - openClawPlugin with a custom tool
 *   - agent.run() for single turns
 *   - agent.plan() for hierarchical planning
 *   - memory.search() for semantic retrieval
 *
 * Run with: npx tsx examples/frameworkDemo.ts
 */

import { AgentBuilder, defineSkill, definePlugin, MockComputeAdapter } from "../packages/core/src/index.js";
import { zeroGPlugin } from "../packages/plugin-0g/src/index.js";
import { openClawPlugin, type AnyAgentToolCompat } from "../packages/plugin-openclaw/src/index.js";

// ── 1. Define a custom skill ──────────────────────────────────────────────────

const priceSkill = defineSkill({
  manifest: {
    id: "defi.price",
    name: "Token Price Fetcher",
    description: "Returns the mock price of a token",
    tags: ["defi", "price"],
    requiresWallet: false,
    touchesChain: false,
    usesCompute: false,
    usesStorage: false,
  },
  async execute(input, ctx) {
    const token = (input.token as string) ?? "ETH";
    // Mock price data — in production, call a DEX or oracle
    const prices: Record<string, number> = { ETH: 3200, BTC: 62000, OG: 0.85 };
    const price = prices[token.toUpperCase()] ?? 1.0;

    // Save to memory for future context
    await ctx.memory.save({
      type: "task_result",
      content: `Price of ${token}: $${price}`,
      importance: 0.4,
      tags: ["price", "defi"],
      pinned: false,
    });

    return { token, price, currency: "USD", source: "mock-oracle" };
  },
});

// ── 2. Define a custom plugin ─────────────────────────────────────────────────

const auditPlugin = definePlugin({
  id: "audit-log",
  name: "Audit Log Plugin",
  version: "1.0.0",
  description: "Logs every agent turn to an audit trail in storage",
  hooks: {
    onAgentInit(agent) {
      console.log("[audit-log] Plugin initialized. Skills:", agent.listSkills().map(s => s.id).join(", "));
    },

    onBeforeTurn(input) {
      console.log(`[audit-log] Turn start | wallet: ${input.walletAddress ?? "anon"} | msg: "${input.message.slice(0, 50)}"`);
      return input;
    },

    async onAfterTurn(result) {
      console.log(`[audit-log] Turn done | ${result.durationMs}ms | skill: ${result.selectedSkill ?? "llm"}`);
      return result;
    },

    onError(error, phase) {
      console.error(`[audit-log] Error in ${phase}: ${error.message}`);
    },
  },
});

// ── 3. Define an OpenClaw-compatible tool ─────────────────────────────────────

const swapTool: AnyAgentToolCompat = {
  name: "defi.swap",
  description: "Execute a token swap (mock)",
  inputSchema: {
    type: "object",
    properties: {
      tokenIn:  { type: "string", description: "Input token symbol" },
      tokenOut: { type: "string", description: "Output token symbol" },
      amount:   { type: "string", description: "Amount to swap" },
    },
    required: ["tokenIn", "tokenOut", "amount"],
  },
  async execute(_toolCallId, params) {
    const p = params as { tokenIn: string; tokenOut: string; amount: string };
    return {
      type: "tool_result" as const,
      content: `[mock] Swapped ${p.amount} ${p.tokenIn} → ${p.tokenOut}. TxHash: 0xmock${Date.now().toString(16)}`,
    };
  },
};

// ── 4. Build the agent ────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════");
  console.log("  CLAW_MACHINE Framework Demo");
  console.log("═══════════════════════════════════════════════\n");

  const agent = await new AgentBuilder()
    .setName("DemoAgent")
    .setSystemPrompt(
      "You are a DeFi assistant running on the 0G network. " +
      "You can fetch token prices and execute swaps. " +
      "Always be concise and helpful."
    )
    // Use MockComputeAdapter explicitly (same as default, but shown for clarity)
    .withCompute(new MockComputeAdapter())
    // 0G plugin (mock mode — no PRIVATE_KEY)
    .use(zeroGPlugin({ rpc: "https://evmrpc-testnet.0g.ai" }))
    // OpenClaw compatibility plugin with the swap tool
    .use(openClawPlugin({ tools: [swapTool] }))
    // Custom audit plugin
    .use(auditPlugin)
    // Custom skill
    .skill(priceSkill)
    .enableReflection()
    .enablePruning(true, 60_000)
    .setMaxPlanParallelism(2)
    .build();

  // ── 5. List registered skills ─────────────────────────────────────────────

  console.log("\n── Registered skills ───────────────────────────");
  for (const skill of agent.listSkills()) {
    console.log(`  [${skill.enabled ? "✓" : "✗"}] ${skill.id.padEnd(20)} ${skill.description}`);
  }

  // ── 6. Single turn ────────────────────────────────────────────────────────

  console.log("\n── Turn 1: Simple question ─────────────────────");
  const r1 = await agent.run({
    message: "What is the current price of ETH?",
    walletAddress: "0xabc123def456abc123def456abc123def456abc1",
    sessionId: "demo-session",
  });
  console.log(`Agent: ${r1.output}`);
  console.log(`Skill: ${r1.selectedSkill ?? "none"} | ${r1.durationMs}ms`);
  console.log(`Trace: ${r1.trace.map(t => t.phase).join(" → ")}`);

  // ── 7. Skill disable / enable ─────────────────────────────────────────────

  console.log("\n── Disabling defi.price skill ──────────────────");
  agent.setSkillEnabled("defi.price", false);
  const r2 = await agent.run({ message: "What is the price of BTC?" });
  console.log(`Agent (no skill): ${r2.output}`);
  agent.setSkillEnabled("defi.price", true);

  // ── 8. Hierarchical plan ──────────────────────────────────────────────────

  console.log("\n── Plan: Multi-step DeFi research ──────────────");
  const plan = await agent.plan(
    "Research the best DeFi yield opportunities on 0G: check ETH price, check OG price, then recommend a strategy.",
    "0xabc123def456abc123def456abc123def456abc1",
  );
  console.log(`Plan status: ${plan.status} | Tasks: ${plan.tasks.length}`);
  for (const task of plan.tasks) {
    const icon = task.status === "completed" ? "✓" : task.status === "failed" ? "✗" : "○";
    console.log(`  [${icon}] ${task.id}: ${task.goal.slice(0, 60)}`);
  }
  if (plan.synthesisResult) {
    console.log(`\nSynthesis: ${plan.synthesisResult.slice(0, 200)}`);
  }

  // ── 9. Memory retrieval ───────────────────────────────────────────────────

  console.log("\n── Memory: Semantic search ─────────────────────");
  const memories = await agent.memory.search({ text: "ETH price", limit: 3 });
  console.log(`Found ${memories.length} relevant memory record(s):`);
  for (const m of memories) {
    console.log(`  [${m.record.type}] score=${m.score.toFixed(2)} | ${m.record.content.slice(0, 80)}`);
  }

  const stats = await agent.memory.stats();
  console.log(`\nMemory stats: ${stats.total} records | avg importance: ${stats.avgImportance.toFixed(2)}`);

  // ── 10. Shutdown ──────────────────────────────────────────────────────────

  console.log("\n── Shutting down ───────────────────────────────");
  await agent.destroy();
  console.log("Agent destroyed. Demo complete.\n");
}

main().catch(console.error);

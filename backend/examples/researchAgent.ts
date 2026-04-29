/**
 * CLAW MACHINE — Research Agent Example
 *
 * Demonstrates semantic search, multi-source synthesis, and lesson injection.
 * The agent:
 * 1. Accepts a research question
 * 2. Runs parallel "source queries" (simulated)
 * 3. Scores and ranks results by relevance
 * 4. Synthesises a final answer with citations
 * 5. Stores the episode in memory for future lesson injection
 *
 * Run: npx tsx examples/researchAgent.ts
 */

import { BaseAgent, AgentTurn } from "./baseAgent.js";

interface SearchResult {
  source: string;
  snippet: string;
  relevance: number;
}

// Simulated semantic search
async function semanticSearch(query: string, source: string): Promise<SearchResult> {
  await new Promise((r) => setTimeout(r, 20 + Math.random() * 60));
  const relevance = 0.5 + Math.random() * 0.5;
  return {
    source,
    snippet: `[${source}] Relevant finding for "${query.slice(0, 40)}…": protocol design recommends typed envelopes and correlation IDs.`,
    relevance,
  };
}

class ResearchAgent extends BaseAgent {
  constructor() { super("researchAgent"); }

  async run(question = "What is the best protocol for agent-to-agent messaging on 0G?") {
    this.recordTurn({ role: "user", content: question });
    const plan = this.plan(`research: ${question}`);

    const sources = [
      "0G Documentation",
      "OpenClaw GitHub",
      "A2A Protocol Spec",
      "EthGlobal Submissions 2025",
      "Academic Papers (arXiv)",
    ];

    console.log(`\nSearching ${sources.length} sources in parallel...`);
    this.toolCall("semanticSearch", { query: question, sources });

    const results = await Promise.all(sources.map((s) => semanticSearch(question, s)));

    // Rank by relevance
    const ranked = [...results].sort((a, b) => b.relevance - a.relevance);

    console.log("\nTop results:");
    ranked.forEach((r, i) => {
      console.log(`  ${i + 1}. [${r.relevance.toFixed(2)}] ${r.source}`);
    });

    // Synthesise
    const topK = ranked.slice(0, 3);
    const synthesis = [
      `Research synthesis for: "${question}"`,
      "",
      "Key findings:",
      ...topK.map((r, i) => `${i + 1}. ${r.snippet}`),
      "",
      "Recommendation: Use typed envelopes with conversation IDs, correlation IDs, and 0G Storage Log for durable message persistence.",
    ].join("\n");

    this.toolCall("noteSummarizer", { topK: topK.length });
    this.toolCall("citationPlanner", { format: "numbered" });
    this.recordTurn({ role: "assistant", content: synthesis });
    this.success();

    const stats = this.finalize();
    console.log("\n=== Research Agent Stats ===");
    console.log(`Turns: ${stats.turns}, Sources searched: ${sources.length}, Tool calls: ${stats.toolCalls}`);

    return { question, plan, synthesis, citations: topK.map((r) => r.source), stats };
  }
}

void (async () => {
  const agent = new ResearchAgent();
  const result = await agent.run();
  console.log("\n=== Final Result ===");
  console.log(JSON.stringify(result, null, 2));
})();

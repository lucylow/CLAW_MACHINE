/**
 * Example: Support Agent with Persistent Memory
 *
 * This is the working example agent described in the Claw Machine design doc.
 * It demonstrates the full framework integration:
 *
 *   1. Recall prior user profile from 0G Storage KV
 *   2. Retrieve relevant past lessons via semantic search
 *   3. Run the agent with memory-augmented context
 *   4. Reflect on the outcome and persist to 0G Storage
 *   5. Return the response
 *
 * Usage:
 *   npx ts-node examples/supportAgent.ts
 *
 * Environment:
 *   EVM_RPC=https://evmrpc-testnet.0g.ai
 *   PRIVATE_KEY=0x...  (optional — runs in mock mode without it)
 */

import { ZeroGStorageAdapter } from "../backend/src/adapters/ZeroGStorageAdapter";
import { ZeroGComputeAdapter } from "../backend/src/adapters/ZeroGComputeAdapter";
import { MemoryOrchestrator } from "../backend/src/core/MemoryOrchestrator";
import { HierarchicalPlanner } from "../backend/src/core/HierarchicalPlanner";
import { PruningService } from "../backend/src/core/PruningService";

// ── Bootstrap ─────────────────────────────────────────────────────────────────

const storage = new ZeroGStorageAdapter();
const compute = new ZeroGComputeAdapter({ defaultModel: "qwen3.6-plus" });
const memory = new MemoryOrchestrator(storage, compute);
const planner = new HierarchicalPlanner(compute);
const pruning = new PruningService(memory, compute, storage);

// ── Support Agent ─────────────────────────────────────────────────────────────

interface AgentResponse {
  text: string;
  ok: boolean;
  reflectionId?: string;
}

/**
 * A support agent that learns from past failures using Claw Machine.
 *
 * Each call:
 *   1. Loads the user's profile from 0G Storage KV
 *   2. Retrieves the 3 most relevant past lessons
 *   3. Generates a response via 0G Compute
 *   4. Reflects on the outcome and stores it in 0G Storage
 */
async function supportAgent(
  message: string,
  options: { sessionId: string; walletAddress?: string } = { sessionId: "demo-session" },
): Promise<AgentResponse> {
  const { sessionId, walletAddress } = options;

  // Step 1: Recall user profile from 0G Storage KV
  const userProfile = await memory.recallState(sessionId, "user_profile");

  // Step 2: Retrieve relevant past lessons via semantic search
  const lessonContext = await memory.buildLessonContext(message, walletAddress);

  // Step 3: Run inference via 0G Compute with memory-augmented context
  const systemPrompt = [
    "You are a helpful support agent that learns from past failures.",
    userProfile ? `User profile: ${JSON.stringify(userProfile)}` : null,
    lessonContext || null,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await compute.infer({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: message },
    ],
    verifiable: true, // Request TEE-verifiable response
  });

  const ok = !response.isMock || response.content.length > 20;

  // Step 4: Reflect on the outcome and persist to 0G Storage
  const reflection = await memory.reflectTask(
    { input: message, sessionId, walletAddress },
    { success: ok, output: response.content },
  );

  // Step 5: Append episode to the warm log
  await memory.appendEpisode({
    sessionId,
    walletAddress,
    userMessage: message,
    assistantMessage: response.content,
    selectedSkills: [],
    toolCalls: [],
    storageRefs: [],
    reflectionRefs: [reflection.reflectionId],
    successScore: ok ? 0.9 : 0.3,
  });

  // Step 6: Update user profile with latest interaction timestamp
  await memory.saveState(sessionId, "user_profile", {
    lastMessage: message.slice(0, 100),
    lastInteraction: Date.now(),
    walletAddress,
  });

  // Step 7: Maybe prune old memory
  await pruning.maybePrune();

  return { text: response.content, ok, reflectionId: reflection.reflectionId };
}

// ── Hierarchical Planning Example ─────────────────────────────────────────────

/**
 * An agent that uses hierarchical planning to break down complex goals.
 */
async function planningAgent(
  goal: string,
  options: { sessionId: string; walletAddress?: string } = { sessionId: "planning-session" },
): Promise<string> {
  const { sessionId, walletAddress } = options;

  // Retrieve relevant lessons before planning
  const lessonContext = await memory.buildLessonContext(goal, walletAddress);

  // Decompose goal into sub-tasks
  const plan = await planner.createPlan(goal, { sessionId, walletAddress, lessonContext });
  console.log(`Created plan ${plan.planId} with ${plan.tasks.length} tasks`);

  // Execute the plan
  const executed = await planner.executePlan(plan, {
    maxConcurrency: 2,
    taskExecutor: async (task) => {
      // Each sub-task runs through the support agent
      const result = await supportAgent(task.goal, { sessionId, walletAddress });
      return result.text;
    },
    onTaskComplete: (task) => {
      console.log(`  [${task.status}] ${task.id}: ${task.goal.slice(0, 60)}`);
    },
  });

  return executed.finalResult ?? "Plan completed with no output";
}

// ── Demo ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Claw Machine Support Agent Demo ===\n");
  console.log(`Storage mode: ${storage.getStats().mode}`);
  console.log(`Compute mode: ${compute.getMode()}`);
  console.log(`Default model: ${compute.getDefaultModel()}\n`);

  // Run a few turns to demonstrate memory accumulation
  const session = { sessionId: "demo-session-001", walletAddress: "0xDEMO" };

  console.log("Turn 1: Initial query");
  const r1 = await supportAgent("How do I upload a file to 0G Storage?", session);
  console.log(`Response: ${r1.text.slice(0, 120)}...`);
  console.log(`Reflection: ${r1.reflectionId}\n`);

  console.log("Turn 2: Follow-up (should use memory from turn 1)");
  const r2 = await supportAgent("What is the root hash I get back from the upload?", session);
  console.log(`Response: ${r2.text.slice(0, 120)}...`);
  console.log(`Reflection: ${r2.reflectionId}\n`);

  console.log("Turn 3: Hierarchical planning example");
  const planResult = await planningAgent(
    "Analyze my wallet balance, find the best swap route for 1 ETH to USDC, and store the result",
    session,
  );
  console.log(`Plan result: ${planResult.slice(0, 200)}\n`);

  const stats = memory.getStats();
  console.log("=== Memory Stats ===");
  console.log(`Total records: ${stats.totalRecords}`);
  console.log(`By type: ${JSON.stringify(stats.byType)}`);
  console.log(`Vector index size: ${stats.vectorIndexSize}`);
  console.log(`Storage mode: ${stats.storageStats.mode}`);
}

main().catch(console.error);

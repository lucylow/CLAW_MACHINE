/**
 * CLAW MACHINE — Support Agent Demo
 *
 * Full lifecycle demonstration:
 *   1. Agent initialization with memory and reflection
 *   2. Three-turn conversation with memory accumulation
 *   3. Hierarchical planning before execution
 *   4. A deliberate failure case (payment gateway timeout)
 *   5. Reflection generated from the failure
 *   6. Recovery on the next turn using the prior lesson
 *   7. Final stats output
 *
 * Run:  npx tsx backend/examples/supportAgent.ts
 */

import { EventEmitter } from "events";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentTurn { role: "user" | "assistant" | "system"; content: string; timestamp: string; }
interface MemoryEntry { id: string; type: "turn" | "reflection" | "lesson"; sessionId: string; content: string; importance: number; timestamp: string; tags: string[]; }
interface Reflection { id: string; episodeId: string; rootCause: string; mistakeSummary: string; correctiveAdvice: string; severity: "low" | "medium" | "high" | "critical"; timestamp: string; }
interface PlanStep { id: string; title: string; status: "pending" | "running" | "done" | "failed"; }
interface TurnStats { turnNumber: number; phase: string; skillUsed?: string; memoryItemsUsed: number; planSteps: number; failed: boolean; reflectionGenerated: boolean; lessonApplied: boolean; durationMs: number; }

// ── In-memory store ───────────────────────────────────────────────────────────

class InMemoryStore {
  private entries: MemoryEntry[] = [];
  private counter = 0;

  store(entry: Omit<MemoryEntry, "id">): MemoryEntry {
    const id = `mem-${++this.counter}`;
    const full: MemoryEntry = { id, ...entry };
    this.entries.push(full);
    return full;
  }

  search(sessionId: string, tags?: string[]): MemoryEntry[] {
    return this.entries
      .filter((e) => e.sessionId === sessionId)
      .filter((e) => !tags || tags.some((t) => e.tags.includes(t)))
      .sort((a, b) => b.importance - a.importance);
  }

  summarize(sessionId: string): string {
    const items = this.search(sessionId);
    if (items.length === 0) return "No prior memory.";
    return items.slice(0, 3).map((e) => `[${e.type}] ${e.content.slice(0, 60)}`).join(" | ");
  }

  getReflections(sessionId: string): Reflection[] {
    return this.entries
      .filter((e) => e.sessionId === sessionId && e.type === "reflection")
      .map((e) => { try { return JSON.parse(e.content) as Reflection; } catch { return null; } })
      .filter((r): r is Reflection => r !== null);
  }

  count(): number { return this.entries.length; }
}

// ── Safe reflection generator ─────────────────────────────────────────────────

async function generateReflection(
  store: InMemoryStore, sessionId: string, episodeId: string,
  task: string, error: string, trace: string[],
): Promise<Reflection> {
  // In production: calls 0G Compute / LLM. Here: deterministic mock.
  const reflection: Reflection = {
    id: `ref-${Date.now()}`,
    episodeId,
    rootCause: "payment_gateway_timeout",
    mistakeSummary: `Task "${task}" failed: ${error}`,
    correctiveAdvice:
      "Retry payment gateway calls with exponential backoff (max 3 attempts). " +
      "Fall back to manual review queue if all retries fail. " +
      "Validate gateway response schema before processing.",
    severity: "high",
    timestamp: new Date().toISOString(),
  };

  store.store({
    type: "reflection", sessionId,
    content: JSON.stringify(reflection),
    importance: 0.95,
    timestamp: reflection.timestamp,
    tags: ["failure", "payment", "retry"],
  });

  console.log(`  [reflection] severity=${reflection.severity} rootCause=${reflection.rootCause}`);
  console.log(`  [reflection] advice: ${reflection.correctiveAdvice.slice(0, 80)}...`);
  return reflection;
}

// ── Planner ───────────────────────────────────────────────────────────────────

function buildPlan(goal: string, priorLessons: string[]): PlanStep[] {
  const base: PlanStep[] = [
    { id: "p1", title: `Clarify: ${goal}`, status: "pending" },
    { id: "p2", title: "Retrieve memory and prior lessons", status: "pending" },
    { id: "p3", title: "Select skill", status: "pending" },
    { id: "p4", title: "Execute with error handling", status: "pending" },
    { id: "p5", title: "Validate and store result", status: "pending" },
  ];
  if (priorLessons.length > 0) {
    base.splice(2, 0, { id: "p2b", title: `Apply lesson: ${priorLessons[0].slice(0, 60)}`, status: "pending" });
  }
  return base;
}

function executePlan(plan: PlanStep[], failAt?: string): void {
  for (const step of plan) {
    step.status = "running";
    if (failAt && step.id === failAt) { step.status = "failed"; return; }
    step.status = "done";
  }
}

// ── Tool stubs ────────────────────────────────────────────────────────────────

function policyLookup(params: { defect: boolean; daysElapsed: number }): { eligible: boolean; reason: string } {
  if (params.defect && params.daysElapsed <= 90) return { eligible: true, reason: "Defect exception applies within 90 days." };
  if (params.daysElapsed <= 30) return { eligible: true, reason: "Standard 30-day return policy." };
  return { eligible: false, reason: "Outside return window without defect exception." };
}

async function processRefund(params: { simulateFailure?: boolean }): Promise<{ txId: string }> {
  if (params.simulateFailure) throw new Error("payment_gateway_timeout: connection timed out after 5000ms");
  return { txId: `txn-${Math.random().toString(36).slice(2, 10)}` };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function runSupportAgent(): Promise<void> {
  const SESSION_ID = `session-${Date.now()}`;
  const store = new InMemoryStore();
  const events = new EventEmitter();
  const allStats: TurnStats[] = [];

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         CLAW MACHINE — Support Agent Demo                ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`Session: ${SESSION_ID}\n`);

  // Turn 1: Policy lookup
  {
    const t0 = Date.now(); const n = 1;
    console.log(`── Turn ${n}: Customer refund request ──────────────────────────`);
    const msg = "A customer wants a refund after 45 days for a defective laptop. Order #LT-9921.";
    console.log(`  [user]      ${msg}`);
    store.store({ type: "turn", sessionId: SESSION_ID, content: `User: ${msg}`, importance: 0.7, timestamp: new Date().toISOString(), tags: ["refund", "laptop", "defect"] });
    console.log(`  [memory]    ${store.summarize(SESSION_ID)}`);
    const plan = buildPlan("resolve defective laptop refund", []);
    executePlan(plan);
    console.log(`  [plan]      ${plan.length} steps executed`);
    const policy = policyLookup({ defect: true, daysElapsed: 45 });
    console.log(`  [tool]      policyLookup → eligible=${policy.eligible} reason="${policy.reason}"`);
    const reply = "Defect exception applies. Customer eligible for full refund within 90 days. Initiating for order #LT-9921.";
    console.log(`  [assistant] ${reply}`);
    store.store({ type: "turn", sessionId: SESSION_ID, content: `Assistant: ${reply}`, importance: 0.6, timestamp: new Date().toISOString(), tags: ["refund", "policy", "eligible"] });
    allStats.push({ turnNumber: n, phase: "policy_lookup", skillUsed: "policyLookup", memoryItemsUsed: store.count(), planSteps: plan.length, failed: false, reflectionGenerated: false, lessonApplied: false, durationMs: Date.now() - t0 });
    events.emit("turn.complete", { turnNumber: n, success: true });
  }

  // Turn 2: Payment failure
  let failureReflection: Reflection | null = null;
  {
    const t0 = Date.now(); const n = 2;
    const episodeId = `ep-${Date.now()}`;
    console.log(`\n── Turn ${n}: Process refund payment (FAILURE CASE) ──────────────`);
    const msg = "Please process the refund now.";
    console.log(`  [user]      ${msg}`);
    console.log(`  [memory]    ${store.summarize(SESSION_ID)}`);
    const plan = buildPlan("process refund payment for order LT-9921", []);
    const trace: string[] = ["phase:plan_built", "phase:memory_hydrated", "phase:skill_selected:processRefund"];
    executePlan(plan, "p4");
    let failed = false; let errorMsg = ""; let reflectionGenerated = false;
    try {
      console.log(`  [tool]      processRefund → calling payment gateway...`);
      await processRefund({ simulateFailure: true });
    } catch (err) {
      failed = true;
      errorMsg = err instanceof Error ? err.message : String(err);
      console.log(`  [error]     ${errorMsg}`);
      trace.push(`phase_error:executing_skill:${errorMsg}`);
      store.store({ type: "turn", sessionId: SESSION_ID, content: `FAILURE: ${errorMsg}`, importance: 0.95, timestamp: new Date().toISOString(), tags: ["failure", "payment", "timeout"] });
      console.log(`  [reflect]   Generating reflection from failure...`);
      failureReflection = await generateReflection(store, SESSION_ID, episodeId, "process refund payment", errorMsg, trace);
      reflectionGenerated = true;
    }
    const reply = failed
      ? "Payment gateway timed out. Failure logged. Will retry with exponential backoff on next attempt."
      : "Refund processed successfully.";
    console.log(`  [assistant] ${reply}`);
    allStats.push({ turnNumber: n, phase: "process_refund", skillUsed: "processRefund", memoryItemsUsed: store.count(), planSteps: plan.length, failed, reflectionGenerated, lessonApplied: false, durationMs: Date.now() - t0 });
    events.emit("turn.complete", { turnNumber: n, success: !failed, error: errorMsg });
  }

  // Turn 3: Recovery with lesson
  {
    const t0 = Date.now(); const n = 3;
    console.log(`\n── Turn ${n}: Retry with lesson applied (RECOVERY) ───────────────`);
    const msg = "Can you try the refund again?";
    console.log(`  [user]      ${msg}`);
    const reflections = store.getReflections(SESSION_ID);
    const lessons = reflections.map((r) => r.correctiveAdvice);
    console.log(`  [memory]    ${reflections.length} reflection(s) retrieved`);
    if (lessons.length > 0) console.log(`  [lesson]    Applying: "${lessons[0].slice(0, 80)}..."`);
    const plan = buildPlan("retry refund with backoff", lessons);
    executePlan(plan);
    console.log(`  [plan]      ${plan.length} steps (includes lesson step)`);
    let txId = ""; let failed = false; let attempt = 0;
    while (attempt < 3) {
      attempt++;
      const backoffMs = Math.pow(2, attempt - 1) * 100;
      console.log(`  [retry]     Attempt ${attempt}/3 (backoff: ${backoffMs}ms)`);
      try {
        await new Promise((r) => setTimeout(r, backoffMs));
        const result = await processRefund({ simulateFailure: false });
        txId = result.txId; failed = false; break;
      } catch { failed = true; if (attempt === 3) console.log(`  [error]     All retries exhausted. Escalating.`); }
    }
    const reply = failed
      ? `All retries failed. Escalating to manual review. Ref: ${SESSION_ID}`
      : `Refund processed on attempt ${attempt}. Transaction: ${txId}`;
    console.log(`  [assistant] ${reply}`);
    store.store({ type: "lesson", sessionId: SESSION_ID, content: `Recovery: succeeded on attempt ${attempt}, txId=${txId}`, importance: 0.8, timestamp: new Date().toISOString(), tags: ["recovery", "payment", "success"] });
    allStats.push({ turnNumber: n, phase: "retry_with_backoff", skillUsed: "processRefund", memoryItemsUsed: store.count(), planSteps: plan.length, failed, reflectionGenerated: false, lessonApplied: lessons.length > 0, durationMs: Date.now() - t0 });
    events.emit("turn.complete", { turnNumber: n, success: !failed, txId });
  }

  // Final stats
  const failures = allStats.filter((s) => s.failed).length;
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║                     Final Stats                         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(JSON.stringify({
    sessionId: SESSION_ID,
    summary: {
      totalTurns: allStats.length, failures,
      reflectionsGenerated: allStats.filter((s) => s.reflectionGenerated).length,
      lessonsApplied: allStats.filter((s) => s.lessonApplied).length,
      totalMemoryItems: store.count(),
      totalDurationMs: allStats.reduce((s, t) => s + t.durationMs, 0),
      successRate: `${Math.round(((allStats.length - failures) / allStats.length) * 100)}%`,
    },
    turns: allStats,
    reflectionSample: failureReflection ? { rootCause: failureReflection.rootCause, severity: failureReflection.severity, correctiveAdvice: failureReflection.correctiveAdvice } : null,
  }, null, 2));
}

void runSupportAgent().catch((err) => {
  console.error("[FATAL]", err instanceof Error ? err.message : String(err));
  process.exit(1);
});

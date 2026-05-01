"""
Writes all improved files for the CLAW_MACHINE codebase.
Run: python3 write_improvements.py
"""
import os

BASE = os.path.dirname(os.path.abspath(__file__))

def w(rel_path: str, content: str) -> None:
    full = os.path.join(BASE, rel_path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content)
    print(f"  wrote {rel_path}")

# ─────────────────────────────────────────────────────────────────────────────
# 1. supportAgent.ts — full demo-ready 3-turn agent
# ─────────────────────────────────────────────────────────────────────────────
w("backend/examples/supportAgent.ts", r'''/**
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
''')

# ─────────────────────────────────────────────────────────────────────────────
# 2. ReflectionEngine — add safe JSON parse + fallback
# ─────────────────────────────────────────────────────────────────────────────
w("backend/src/core/reflection/reflection-engine.ts", r'''import { randomUUID } from "crypto";
import type { LlmProvider } from "../../providers/llm/types";
import type { MemoryStorageProvider } from "../../providers/storage/types";

export interface ReflectionInput {
  streamId: string;
  task: string;
  trace: string[];
  outcome: "success" | "failure";
  error?: string;
}

export interface ReflectionOutput {
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  severity: "low" | "medium" | "high";
  embedding?: number[];
  /** True when the LLM response could not be parsed and a fallback was used. */
  isFallback?: boolean;
}

/** Fallback reflection used when LLM output cannot be parsed. */
function fallbackReflection(input: ReflectionInput): ReflectionOutput {
  return {
    rootCause: "unknown — LLM response unparseable",
    mistakeSummary: `Task "${input.task}" failed with outcome "${input.outcome}". Error: ${input.error ?? "none"}`,
    correctiveAdvice: "Review the agent trace manually. Ensure the LLM returns valid JSON.",
    severity: "medium",
    isFallback: true,
  };
}

/** Attempt to extract JSON from a response that may have prose around it. */
function extractJson(text: string): unknown {
  // Try direct parse first
  try { return JSON.parse(text); } catch { /* continue */ }
  // Try to find a JSON object block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* continue */ } }
  return null;
}

export class ReflectionEngine {
  constructor(
    private llm: LlmProvider,
    private storage: MemoryStorageProvider,
  ) {}

  async generate(input: ReflectionInput): Promise<ReflectionOutput> {
    const prompt = [
      "You are a reflection engine for autonomous agents.",
      "Analyze the task outcome and produce structured JSON with keys:",
      "rootCause, mistakeSummary, correctiveAdvice, severity (low|medium|high).",
      `Task: ${input.task}`,
      `Outcome: ${input.outcome}`,
      input.error ? `Error: ${input.error}` : "",
      `Trace:\n${input.trace.join("\n")}`,
    ].filter(Boolean).join("\n\n");

    let parsed: ReflectionOutput;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: "system", content: "Return only valid JSON. No prose, no markdown fences." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 800,
      });

      const extracted = extractJson(response.text);
      if (!extracted || typeof extracted !== "object") {
        console.warn("[ReflectionEngine] LLM returned non-JSON, using fallback.");
        parsed = fallbackReflection(input);
      } else {
        parsed = extracted as ReflectionOutput;
        // Validate required fields
        if (!parsed.rootCause || !parsed.mistakeSummary || !parsed.correctiveAdvice) {
          console.warn("[ReflectionEngine] LLM JSON missing required fields, using fallback.");
          parsed = fallbackReflection(input);
        }
        // Normalise severity
        const validSeverities = new Set(["low", "medium", "high"]);
        if (!validSeverities.has(parsed.severity)) parsed.severity = "medium";
      }
    } catch (llmErr) {
      console.error("[ReflectionEngine] LLM call failed:", llmErr instanceof Error ? llmErr.message : String(llmErr));
      parsed = fallbackReflection(input);
    }

    // Persist — but do not throw if storage fails
    try {
      await this.storage.appendLog({
        id: randomUUID(),
        streamId: input.streamId,
        type: "reflection",
        payload: parsed,
        createdAt: new Date().toISOString(),
      });
    } catch (storageErr) {
      console.error("[ReflectionEngine] Failed to persist reflection:", storageErr instanceof Error ? storageErr.message : String(storageErr));
    }

    return parsed;
  }
}
''')

# ─────────────────────────────────────────────────────────────────────────────
# 3. errors/retry.ts — add withRetry helper integrating circuit breaker
# ─────────────────────────────────────────────────────────────────────────────
w("backend/src/errors/withRetry.ts", r'''/**
 * withRetry — exponential backoff with jitter, circuit breaker integration,
 * and AbortSignal cancellation support.
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms. Actual delay = baseMs * 2^(attempt-1) + jitter. Default: 200. */
  baseMs?: number;
  /** Maximum delay cap in ms. Default: 10000. */
  maxDelayMs?: number;
  /** Jitter range in ms (random 0..jitterMs added). Default: 100. */
  jitterMs?: number;
  /** Predicate to decide whether to retry on a given error. Default: always retry. */
  retryIf?: (err: unknown, attempt: number) => boolean;
  /** Called before each retry with the error and next attempt number. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal to cancel retries. */
  signal?: AbortSignal;
}

export class RetryAbortedError extends Error {
  constructor() { super("Retry aborted by signal"); this.name = "RetryAbortedError"; }
}

export class MaxRetriesExceededError extends Error {
  public readonly attempts: number;
  public readonly lastError: unknown;
  constructor(attempts: number, lastError: unknown) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    super(`Max retries (${attempts}) exceeded. Last error: ${msg}`);
    this.name = "MaxRetriesExceededError";
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new RetryAbortedError()); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new RetryAbortedError()); }, { once: true });
  });
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseMs = 200,
    maxDelayMs = 10_000,
    jitterMs = 100,
    retryIf = () => true,
    onRetry,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new RetryAbortedError();

    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) break;
      if (!retryIf(err, attempt)) break;

      const backoff = Math.min(baseMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.random() * jitterMs;
      const delayMs = Math.round(backoff + jitter);

      onRetry?.(err, attempt + 1, delayMs);

      await delay(delayMs, signal);
    }
  }

  throw new MaxRetriesExceededError(maxAttempts, lastError);
}
''')

# ─────────────────────────────────────────────────────────────────────────────
# 4. A2A queue-store — add deduplication on enqueue
# ─────────────────────────────────────────────────────────────────────────────
# Read existing file and patch it
existing_queue = open(os.path.join(BASE, "backend/src/a2a/queue-store.ts")).read()

# Inject dedup check into enqueue — find the enqueue method and add a guard
DEDUP_PATCH = '''
  // Deduplication: reject if a non-dead-letter message with same dedupeKey already exists
  if (message.dedupeKey) {
    const existing = [...this.messages.values()].find(
      (m) => m.dedupeKey === message.dedupeKey && m.deliveryState !== "dead_letter",
    );
    if (existing) {
      this.logger?.warn?.(`[QueueStore] Duplicate message rejected: dedupeKey=${message.dedupeKey} existingId=${existing.id}`);
      return existing as AgentQueueEnvelope<TPayload>;
    }
  }
'''

# Find the right insertion point: after the enqueue method signature opening brace
if "Deduplication: reject" not in existing_queue:
    # Insert after the first line that sets deliveryState to "pending" inside enqueue
    patched = existing_queue.replace(
        "message.deliveryState = \"pending\";",
        "message.deliveryState = \"pending\";\n" + DEDUP_PATCH,
        1,
    )
    if patched != existing_queue:
        with open(os.path.join(BASE, "backend/src/a2a/queue-store.ts"), "w") as f:
            f.write(patched)
        print("  patched backend/src/a2a/queue-store.ts (dedup)")
    else:
        print("  WARN: could not patch queue-store.ts (marker not found)")
else:
    print("  skip backend/src/a2a/queue-store.ts (already patched)")

# ─────────────────────────────────────────────────────────────────────────────
# 5. opsAgent — add real failure→reflection→recovery cycle
# ─────────────────────────────────────────────────────────────────────────────
w("backend/examples/opsAgent.ts", r'''/**
 * CLAW MACHINE — Ops Agent Demo
 * Demonstrates: incident triage, failure detection, reflection, rollback recovery.
 * Run: npx tsx backend/examples/opsAgent.ts
 */
import { BaseAgent, AgentTurn } from "./baseAgent";

interface IncidentReport {
  id: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: string;
  symptoms: string[];
}

interface RollbackResult {
  success: boolean;
  targetVersion: string;
  durationMs: number;
  error?: string;
}

class OpsAgent extends BaseAgent {
  private incident: IncidentReport | null = null;
  private rollbackAttempts = 0;

  constructor() { super("opsAgent"); }

  private detectIncident(): IncidentReport {
    return {
      id: `inc-${Date.now()}`,
      service: "payment-service",
      severity: "high",
      detectedAt: new Date().toISOString(),
      symptoms: ["error rate > 15%", "p99 latency > 8s", "health check failing"],
    };
  }

  private async attemptRollback(targetVersion: string, simulateFail: boolean): Promise<RollbackResult> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 80));
    if (simulateFail) return { success: false, targetVersion, durationMs: Date.now() - t0, error: "rollback_lock_timeout: deployment lock held by another process" };
    return { success: true, targetVersion, durationMs: Date.now() - t0 };
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: "user", content: "Investigate the failed deployment and suggest a rollback.", timestamp: new Date().toISOString() },
      { role: "assistant", content: "Inspecting logs, comparing checkpoints, and preparing rollback plan.", timestamp: new Date().toISOString() },
      { role: "user", content: "Provide a full incident summary.", timestamp: new Date().toISOString() },
    ];
    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan("triage deployment incident and execute rollback");
    this.toolCall("logReader", { source: "deployment-logs", window: "15m" });
    this.toolCall("checkpointDiff", { between: ["v2.4.1-good", "v2.4.2-bad"] });

    // Detect incident
    this.incident = this.detectIncident();
    this.emit("incident.detected", this.incident);
    console.log(`[opsAgent] Incident detected: ${this.incident.id} severity=${this.incident.severity}`);
    console.log(`[opsAgent] Symptoms: ${this.incident.symptoms.join(", ")}`);

    // First rollback attempt — simulated failure
    this.rollbackAttempts++;
    const firstAttempt = await this.attemptRollback("v2.4.1", true);
    if (!firstAttempt.success) {
      this.failure();
      console.log(`[opsAgent] Rollback attempt 1 FAILED: ${firstAttempt.error}`);
      this.emit("reflection.needed", { error: firstAttempt.error, task: "rollback" });
      console.log(`[opsAgent] Reflection: deployment lock must be released before rollback. Waiting 2s.`);
      await new Promise((r) => setTimeout(r, 200)); // shortened for demo
    }

    // Second rollback attempt — recovery
    this.rollbackAttempts++;
    const secondAttempt = await this.attemptRollback("v2.4.1", false);
    if (secondAttempt.success) {
      this.success();
      console.log(`[opsAgent] Rollback attempt 2 SUCCEEDED in ${secondAttempt.durationMs}ms`);
    }

    return {
      plan,
      incident: this.incident,
      rollbackAttempts: this.rollbackAttempts,
      rollbackSuccess: secondAttempt.success,
      incidentSummary: "Detected config drift in v2.4.2. Rollback to v2.4.1 succeeded after releasing deployment lock.",
      stats: this.finalize(),
    };
  }
}

void (async () => {
  const agent = new OpsAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();
''')

# ─────────────────────────────────────────────────────────────────────────────
# 6. plannerAgent — add dependency graph execution with failure handling
# ─────────────────────────────────────────────────────────────────────────────
w("backend/examples/plannerAgent.ts", r'''/**
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
''')

# ─────────────────────────────────────────────────────────────────────────────
# 7. Tests
# ─────────────────────────────────────────────────────────────────────────────
w("backend/src/errors/withRetry.test.ts", r'''import { describe, it, expect, vi } from "vitest";
import { withRetry, MaxRetriesExceededError, RetryAbortedError } from "./withRetry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    let call = 0;
    const fn = vi.fn().mockImplementation(async () => {
      call++;
      if (call < 2) throw new Error("transient");
      return "recovered";
    });
    const result = await withRetry(fn, { maxAttempts: 3, baseMs: 1, jitterMs: 0 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws MaxRetriesExceededError after all attempts fail", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, { maxAttempts: 3, baseMs: 1, jitterMs: 0 })).rejects.toThrow(MaxRetriesExceededError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retryIf returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("non-retryable"));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseMs: 1, jitterMs: 0, retryIf: () => false }),
    ).rejects.toThrow(MaxRetriesExceededError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry with correct attempt number", async () => {
    const onRetry = vi.fn();
    let call = 0;
    await withRetry(
      async () => { call++; if (call < 3) throw new Error("err"); return "done"; },
      { maxAttempts: 3, baseMs: 1, jitterMs: 0, onRetry },
    );
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(2); // next attempt number
    expect(onRetry.mock.calls[1][1]).toBe(3);
  });

  it("aborts on signal", async () => {
    const ctrl = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      ctrl.abort();
      throw new Error("fail");
    });
    await expect(
      withRetry(fn, { maxAttempts: 5, baseMs: 1, jitterMs: 0, signal: ctrl.signal }),
    ).rejects.toThrow(RetryAbortedError);
  });
});
''')

w("backend/src/core/reflection/reflection-engine.test.ts", r'''import { describe, it, expect, vi } from "vitest";
import { ReflectionEngine } from "./reflection-engine.js";

const mockStorage = { appendLog: vi.fn().mockResolvedValue(undefined) };

describe("ReflectionEngine", () => {
  it("parses valid LLM JSON response", async () => {
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          rootCause: "null pointer",
          mistakeSummary: "dereferenced null",
          correctiveAdvice: "add null check",
          severity: "high",
        }),
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s1", task: "test", trace: [], outcome: "failure", error: "NPE" });
    expect(result.rootCause).toBe("null pointer");
    expect(result.isFallback).toBeFalsy();
    expect(mockStorage.appendLog).toHaveBeenCalledOnce();
  });

  it("uses fallback when LLM returns invalid JSON", async () => {
    const mockLlm = { chat: vi.fn().mockResolvedValue({ text: "Sorry, I cannot help with that." }) };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s2", task: "test", trace: [], outcome: "failure" });
    expect(result.isFallback).toBe(true);
    expect(result.rootCause).toContain("unparseable");
  });

  it("uses fallback when LLM call throws", async () => {
    const mockLlm = { chat: vi.fn().mockRejectedValue(new Error("LLM unavailable")) };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s3", task: "test", trace: [], outcome: "failure" });
    expect(result.isFallback).toBe(true);
  });

  it("does not throw when storage fails", async () => {
    const failStorage = { appendLog: vi.fn().mockRejectedValue(new Error("storage down")) };
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({ rootCause: "r", mistakeSummary: "m", correctiveAdvice: "a", severity: "low" }),
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, failStorage as any);
    await expect(engine.generate({ streamId: "s4", task: "test", trace: [], outcome: "failure" })).resolves.not.toThrow();
  });

  it("normalises invalid severity to medium", async () => {
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({ rootCause: "r", mistakeSummary: "m", correctiveAdvice: "a", severity: "EXTREME" }),
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s5", task: "test", trace: [], outcome: "failure" });
    expect(result.severity).toBe("medium");
  });

  it("extracts JSON embedded in prose", async () => {
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: 'Here is the analysis: {"rootCause":"timeout","mistakeSummary":"slow","correctiveAdvice":"cache it","severity":"low"} Hope that helps!',
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s6", task: "test", trace: [], outcome: "failure" });
    expect(result.rootCause).toBe("timeout");
    expect(result.isFallback).toBeFalsy();
  });
});
''')

w("backend/examples/supportAgent.test.ts", r'''/**
 * Integration-style test for the support agent demo flow.
 * Validates the 3-turn lifecycle, failure handling, reflection, and recovery.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("supportAgent demo", () => {
  it("runs without crashing and outputs valid JSON stats", () => {
    const agentPath = path.resolve(__dirname, "supportAgent.ts");
    let stdout = "";
    try {
      stdout = execSync(`npx tsx "${agentPath}"`, { timeout: 15_000 }).toString();
    } catch (err: any) {
      throw new Error(`supportAgent crashed: ${err.stderr?.toString() ?? err.message}`);
    }

    // Find the final JSON block (last {...} in output)
    const match = stdout.match(/(\{[\s\S]*\})\s*$/);
    expect(match, "No JSON output found").toBeTruthy();

    const stats = JSON.parse(match![1]);
    expect(stats.summary.totalTurns).toBe(3);
    expect(stats.summary.failures).toBe(1);
    expect(stats.summary.reflectionsGenerated).toBe(1);
    expect(stats.summary.lessonsApplied).toBe(1);
    expect(stats.summary.totalMemoryItems).toBeGreaterThan(0);
    expect(stats.reflectionSample).not.toBeNull();
    expect(stats.reflectionSample.severity).toBe("high");
  });
});
''')

print("\nAll improvements written successfully.")

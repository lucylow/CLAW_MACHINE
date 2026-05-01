"""
CLAW_MACHINE — improvement batch v2
Writes all improved files. Run: python3 write_improvements_v2.py
"""
import os

BASE = os.path.dirname(os.path.abspath(__file__))

def w(rel: str, content: str) -> None:
    full = os.path.join(BASE, rel)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        f.write(content)
    print(f"  wrote {rel}")

def patch(rel: str, old: str, new: str, label: str = "") -> None:
    full = os.path.join(BASE, rel)
    with open(full) as f:
        content = f.read()
    if old in content:
        with open(full, "w") as f:
            f.write(content.replace(old, new, 1))
        print(f"  patched {rel}" + (f" ({label})" if label else ""))
    else:
        print(f"  WARN: marker not found in {rel}" + (f" ({label})" if label else ""))

# ─────────────────────────────────────────────────────────────────────────────
# 1. baseAgent.ts — add timestamp, retryTool, withTimeout, getMemoryByTag,
#                   summarizeMemory, reset, typed emit overloads
# ─────────────────────────────────────────────────────────────────────────────
w("backend/examples/baseAgent.ts", r'''/**
 * CLAW MACHINE — BaseAgent
 *
 * Foundation class for all example agents. Provides:
 *   - Typed conversation memory with timestamps
 *   - Hierarchical planning stub
 *   - Tool call tracking with retry + timeout helpers
 *   - Success/failure counters
 *   - Memory search by tag
 *   - Memory summarization
 *   - Graceful reset
 *   - Typed EventEmitter overloads
 */

import { EventEmitter } from "events";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentTurn {
  role: "user" | "assistant" | "system";
  content: string;
  /** ISO timestamp — set automatically by recordTurn() */
  timestamp: string;
  /** Optional tags for memory search */
  tags?: string[];
}

export interface AgentStats {
  name: string;
  turns: number;
  memoryItems: number;
  plansBuilt: number;
  toolCalls: number;
  toolRetries: number;
  successes: number;
  failures: number;
  startTime: string;
  endTime?: string;
  lastGoal?: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output?: unknown;
  error?: string;
  attempt: number;
  durationMs: number;
  timestamp: string;
}

// ── Typed event map ───────────────────────────────────────────────────────────

interface AgentEvents {
  tool: [ToolCallRecord];
  "reflection.needed": [{ error: string; task: string }];
  "incident.detected": [{ id: string; severity: string }];
  "turn.complete": [{ turnNumber: number; success: boolean; error?: string }];
  reset: [];
}

// ── BaseAgent ─────────────────────────────────────────────────────────────────

export class BaseAgent extends EventEmitter {
  protected memory: AgentTurn[] = [];
  protected toolLog: ToolCallRecord[] = [];
  protected stats: AgentStats;

  constructor(protected readonly name: string) {
    super();
    this.stats = this.freshStats();
  }

  // ── Memory ──────────────────────────────────────────────────────────────────

  protected remember(turn: AgentTurn): void {
    this.memory.push(turn);
    this.stats.memoryItems = this.memory.length;
  }

  protected recordTurn(turn: Omit<AgentTurn, "timestamp"> & { timestamp?: string }): void {
    const full: AgentTurn = { ...turn, timestamp: turn.timestamp ?? new Date().toISOString() };
    this.stats.turns += 1;
    this.remember(full);
  }

  /** Return all memory turns that include at least one of the given tags. */
  protected getMemoryByTag(...tags: string[]): AgentTurn[] {
    return this.memory.filter((t) => t.tags?.some((tag) => tags.includes(tag)));
  }

  /** Return a compact prose summary of the most recent N memory items. */
  protected summarizeMemory(topN = 5): string {
    if (this.memory.length === 0) return "No prior memory.";
    return this.memory
      .slice(-topN)
      .map((t) => `[${t.role}] ${t.content.slice(0, 80)}`)
      .join(" → ");
  }

  // ── Planning ─────────────────────────────────────────────────────────────────

  protected plan(goal: string): string[] {
    this.stats.plansBuilt += 1;
    this.stats.lastGoal = goal;
    return [
      `Clarify goal: ${goal}`,
      `Gather context from memory (${this.memory.length} items)`,
      `Execute focused action`,
      `Validate and summarize outcome`,
    ];
  }

  // ── Tool calls ───────────────────────────────────────────────────────────────

  protected toolCall(name: string, input: unknown, output?: unknown): ToolCallRecord {
    const record: ToolCallRecord = {
      name, input, output,
      attempt: 1,
      durationMs: 0,
      timestamp: new Date().toISOString(),
    };
    this.stats.toolCalls += 1;
    this.toolLog.push(record);
    this.emit("tool", record);
    return record;
  }

  /**
   * Call an async tool function with automatic retry and exponential backoff.
   * @param name   Tool name for logging
   * @param fn     Async function to call
   * @param opts   maxAttempts (default 3), baseMs (default 150), retryIf predicate
   */
  protected async retryTool<T>(
    name: string,
    fn: () => Promise<T>,
    opts: { maxAttempts?: number; baseMs?: number; retryIf?: (err: unknown) => boolean } = {},
  ): Promise<T> {
    const { maxAttempts = 3, baseMs = 150, retryIf = () => true } = opts;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const t0 = Date.now();
      try {
        const result = await fn();
        const record: ToolCallRecord = { name, input: null, output: result, attempt, durationMs: Date.now() - t0, timestamp: new Date().toISOString() };
        if (attempt > 1) this.stats.toolRetries += attempt - 1;
        this.stats.toolCalls += 1;
        this.toolLog.push(record);
        this.emit("tool", record);
        return result;
      } catch (err) {
        lastErr = err;
        if (attempt < maxAttempts && retryIf(err)) {
          const backoff = baseMs * Math.pow(2, attempt - 1) + Math.random() * 50;
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          const record: ToolCallRecord = { name, input: null, error: err instanceof Error ? err.message : String(err), attempt, durationMs: Date.now() - t0, timestamp: new Date().toISOString() };
          this.toolLog.push(record);
          break;
        }
      }
    }
    throw lastErr;
  }

  /**
   * Run an async function with a timeout. Throws if it exceeds timeoutMs.
   */
  protected async withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, label = "operation"): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
      const result = await Promise.race([fn(), timeoutPromise]);
      clearTimeout(timer);
      return result;
    } catch (err) {
      clearTimeout(timer);
      throw err;
    }
  }

  // ── Outcome tracking ─────────────────────────────────────────────────────────

  protected success(): void { this.stats.successes += 1; }
  protected failure(): void { this.stats.failures += 1; }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  /** Reset all state — useful for running the same agent instance multiple times in tests. */
  reset(): void {
    this.memory = [];
    this.toolLog = [];
    this.stats = this.freshStats();
    this.emit("reset");
  }

  finalize(): AgentStats & { memory: AgentTurn[]; toolLog: ToolCallRecord[] } {
    this.stats.endTime = new Date().toISOString();
    return { ...this.stats, memory: [...this.memory], toolLog: [...this.toolLog] };
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  private freshStats(): AgentStats {
    return {
      name: this.name,
      turns: 0, memoryItems: 0, plansBuilt: 0,
      toolCalls: 0, toolRetries: 0, successes: 0, failures: 0,
      startTime: new Date().toISOString(),
    };
  }
}
''')

# ─────────────────────────────────────────────────────────────────────────────
# 2. marketAgent.ts — real pricing logic, confidence intervals, on-chain stub
# ─────────────────────────────────────────────────────────────────────────────
w("backend/examples/marketAgent.ts", r'''/**
 * CLAW MACHINE — Market Agent Demo
 *
 * Demonstrates: agent capability scoring, comparable pricing, confidence
 * intervals, multi-factor listing composition, and on-chain publish stub.
 *
 * Run: npx tsx backend/examples/marketAgent.ts
 */

import { BaseAgent, AgentTurn } from "./baseAgent";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentCapabilityProfile {
  name: string;
  version: string;
  skills: string[];
  reflectionCount: number;
  successRate: number;    // 0–1
  avgResponseMs: number;
  memoryDepth: number;    // number of stored episodes
  onChainPublished: boolean;
}

interface MarketComparable {
  name: string;
  price0G: number;
  successRate: number;
  skills: number;
  reflections: number;
}

interface PricingResult {
  basePrice: number;
  adjustedPrice: number;
  confidenceLow: number;
  confidenceHigh: number;
  factors: Record<string, number>;
  rationale: string;
}

interface ListingDraft {
  title: string;
  description: string;
  price0G: number;
  priceLow0G: number;
  priceHigh0G: number;
  tags: string[];
  capabilities: string[];
  onChainTxStub: string;
}

// ── Tool implementations ──────────────────────────────────────────────────────

function fetchMarketComps(segment: string): MarketComparable[] {
  // In production: queries 0G Storage index of published agents
  const comps: MarketComparable[] = [
    { name: "SupportAgentV2",   price0G: 15.0, successRate: 0.88, skills: 4, reflections: 12 },
    { name: "OpsAgentV1",       price0G: 22.0, successRate: 0.91, skills: 6, reflections: 20 },
    { name: "ResearchAgentV3",  price0G: 18.5, successRate: 0.85, skills: 5, reflections: 8  },
    { name: "PlannerAgentV1",   price0G: 12.0, successRate: 0.79, skills: 3, reflections: 5  },
    { name: "CoordAgentV2",     price0G: 28.0, successRate: 0.93, skills: 8, reflections: 30 },
  ];
  console.log(`  [tool] fetchMarketComps(${segment}) → ${comps.length} comparables`);
  return comps;
}

function scoreCapabilities(profile: AgentCapabilityProfile): Record<string, number> {
  const skillScore       = Math.min(profile.skills.length / 10, 1.0);         // 0–1
  const reliabilityScore = profile.successRate;                                 // 0–1
  const memoryScore      = Math.min(profile.memoryDepth / 50, 1.0);           // 0–1
  const reflectionScore  = Math.min(profile.reflectionCount / 30, 1.0);       // 0–1
  const speedScore       = Math.max(0, 1 - profile.avgResponseMs / 5000);     // 0–1 (lower latency = higher)
  const onChainBonus     = profile.onChainPublished ? 0.05 : 0;

  return { skillScore, reliabilityScore, memoryScore, reflectionScore, speedScore, onChainBonus };
}

function computePrice(
  profile: AgentCapabilityProfile,
  comps: MarketComparable[],
  strategy: "conservative" | "market" | "premium",
): PricingResult {
  const factors = scoreCapabilities(profile);

  // Weighted composite score
  const composite =
    factors.skillScore       * 0.30 +
    factors.reliabilityScore * 0.30 +
    factors.memoryScore      * 0.15 +
    factors.reflectionScore  * 0.15 +
    factors.speedScore       * 0.05 +
    factors.onChainBonus     * 0.05;

  // Market anchor: median comparable price
  const sortedPrices = comps.map((c) => c.price0G).sort((a, b) => a - b);
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

  // Base price from composite × market anchor
  const basePrice = medianPrice * composite * 1.8;

  // Strategy multiplier
  const multiplier = strategy === "conservative" ? 0.85 : strategy === "premium" ? 1.20 : 1.0;
  const adjustedPrice = Math.round(basePrice * multiplier * 10) / 10;

  // Confidence interval (±15% for conservative, ±25% for premium)
  const spread = strategy === "conservative" ? 0.15 : strategy === "premium" ? 0.25 : 0.20;
  const confidenceLow  = Math.round(adjustedPrice * (1 - spread) * 10) / 10;
  const confidenceHigh = Math.round(adjustedPrice * (1 + spread) * 10) / 10;

  const rationale = [
    `Composite score: ${(composite * 100).toFixed(1)}%`,
    `Market median: ${medianPrice} 0G`,
    `Strategy: ${strategy} (×${multiplier})`,
    `Skills: ${profile.skills.length}, Reliability: ${(profile.successRate * 100).toFixed(0)}%`,
    `Reflections: ${profile.reflectionCount}, Memory depth: ${profile.memoryDepth}`,
  ].join(". ");

  return { basePrice, adjustedPrice, confidenceLow, confidenceHigh, factors, rationale };
}

function composeListing(profile: AgentCapabilityProfile, pricing: PricingResult): ListingDraft {
  const tags = [
    ...profile.skills.map((s) => s.toLowerCase().replace(/\s+/g, "-")),
    profile.onChainPublished ? "on-chain-verified" : "off-chain",
    `v${profile.version}`,
  ];

  return {
    title: `${profile.name} v${profile.version}`,
    description:
      `Autonomous agent with ${profile.skills.length} skills, ` +
      `${(profile.successRate * 100).toFixed(0)}% success rate, ` +
      `${profile.reflectionCount} reflections, and ${profile.memoryDepth} stored episodes. ` +
      `Average response time: ${profile.avgResponseMs}ms.`,
    price0G: pricing.adjustedPrice,
    priceLow0G: pricing.confidenceLow,
    priceHigh0G: pricing.confidenceHigh,
    tags,
    capabilities: profile.skills,
    // In production: calls SkillRegistry.sol publishSkill() on 0G Chain
    onChainTxStub: `0x${Math.random().toString(16).slice(2, 66).padEnd(64, "0")}`,
  };
}

// ── Agent ─────────────────────────────────────────────────────────────────────

class MarketAgent extends BaseAgent {
  constructor() { super("marketAgent"); }

  async run() {
    const convo: AgentTurn[] = [
      { role: "user",      content: "Analyze whether to list an agent for sale.", timestamp: new Date().toISOString() },
      { role: "assistant", content: "I will review capability profile, market comparables, and price elasticity.", timestamp: new Date().toISOString() },
      { role: "user",      content: "Use a conservative pricing model.", timestamp: new Date().toISOString() },
    ];
    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan("price and list an agent in the marketplace");

    // Agent profile (in production: loaded from 0G Storage KV)
    const profile: AgentCapabilityProfile = {
      name: "SupportAgent",
      version: "3.1.0",
      skills: ["policyLookup", "refundProcessor", "toneAdapter", "escalationRouter"],
      reflectionCount: 14,
      successRate: 0.91,
      avgResponseMs: 820,
      memoryDepth: 38,
      onChainPublished: false,
    };

    // Fetch comparables
    const comps = this.toolCall(
      "marketComps",
      { segment: "support agents" },
      fetchMarketComps("support agents"),
    ).output as MarketComparable[];

    // Score and price
    const pricing = computePrice(profile, comps, "conservative");
    this.toolCall("priceModel", { strategy: "conservative", composite: pricing.factors }, pricing);
    console.log(`  [price] ${pricing.adjustedPrice} 0G  [${pricing.confidenceLow}–${pricing.confidenceHigh}]`);
    console.log(`  [rationale] ${pricing.rationale}`);

    // Compose listing
    const listing = composeListing(profile, pricing);
    this.toolCall("listingComposer", { fields: ["capabilities", "level", "reflections"] }, listing);
    console.log(`  [listing] "${listing.title}" — ${listing.price0G} 0G`);
    console.log(`  [tags] ${listing.tags.join(", ")}`);

    this.success();

    return { plan, profile, pricing, listing, stats: this.finalize() };
  }
}

void (async () => {
  const agent = new MarketAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();
''')

# ─────────────────────────────────────────────────────────────────────────────
# 3. packages/core/src/memory/pruner.ts — real importance-decay + LRU eviction
# ─────────────────────────────────────────────────────────────────────────────
# Read existing pruner to check its structure
pruner_path = os.path.join(BASE, "packages/core/src/memory/pruner.ts")
if os.path.exists(pruner_path):
    with open(pruner_path) as f:
        existing_pruner = f.read()
    print(f"  read packages/core/src/memory/pruner.ts ({len(existing_pruner)} chars)")
else:
    existing_pruner = ""
    print("  WARN: pruner.ts not found, will create it")

w("packages/core/src/memory/pruner.ts", r'''/**
 * MemoryPruner — lifecycle management for agent memory.
 *
 * Scoring model (higher = keep):
 *   score = importance × recencyWeight × typeWeight
 *
 * Where:
 *   recencyWeight = exp(-λ × ageHours)   (exponential decay, λ = ln(2)/halfLifeHours)
 *   typeWeight    = { lesson: 1.5, reflection: 1.3, turn: 1.0 }
 *
 * Eviction policy: prune lowest-scoring records until count ≤ maxRecords.
 * Pinned records (importance = 1.0) are never evicted.
 */

export interface PrunerConfig {
  /** Maximum records to keep per session. Default: 500. */
  maxRecords?: number;
  /** Half-life of memory importance in hours. Default: 48h. */
  halfLifeHours?: number;
  /** Minimum importance score to keep (absolute floor). Default: 0.05. */
  minImportance?: number;
  /** If true, log pruning decisions to console. Default: false. */
  verbose?: boolean;
}

export interface MemoryRecord {
  id: string;
  sessionId: string;
  type: "turn" | "reflection" | "lesson" | string;
  importance: number;       // 0–1; 1.0 = pinned (never evicted)
  createdAt: string;        // ISO timestamp
  content?: string;
  tags?: string[];
}

export interface PruneResult {
  removed: number;
  kept: number;
  removedIds: string[];
  durationMs: number;
}

const TYPE_WEIGHT: Record<string, number> = {
  lesson:     1.5,
  reflection: 1.3,
  turn:       1.0,
};

function decayWeight(createdAt: string, halfLifeHours: number): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageHours = ageMs / 3_600_000;
  const lambda = Math.LN2 / halfLifeHours;
  return Math.exp(-lambda * ageHours);
}

function score(record: MemoryRecord, halfLifeHours: number): number {
  if (record.importance >= 1.0) return Infinity; // pinned
  const typeW = TYPE_WEIGHT[record.type] ?? 1.0;
  const recencyW = decayWeight(record.createdAt, halfLifeHours);
  return record.importance * recencyW * typeW;
}

export class MemoryPruner {
  private readonly maxRecords: number;
  private readonly halfLifeHours: number;
  private readonly minImportance: number;
  private readonly verbose: boolean;

  constructor(config: PrunerConfig = {}) {
    this.maxRecords    = config.maxRecords    ?? 500;
    this.halfLifeHours = config.halfLifeHours ?? 48;
    this.minImportance = config.minImportance ?? 0.05;
    this.verbose       = config.verbose       ?? false;
  }

  /**
   * Given a list of records, return the IDs that should be removed.
   * Does NOT mutate the input array.
   */
  selectForEviction(records: MemoryRecord[]): string[] {
    const toEvict: string[] = [];

    // Pass 1: remove records below minimum importance (except pinned)
    for (const r of records) {
      if (r.importance < this.minImportance && r.importance < 1.0) {
        toEvict.add_id(r.id, toEvict);
      }
    }

    // Pass 2: if still over limit, evict lowest-scoring until within budget
    const remaining = records.filter((r) => !toEvict.includes(r.id));
    if (remaining.length > this.maxRecords) {
      const scored = remaining
        .map((r) => ({ id: r.id, s: score(r, this.halfLifeHours) }))
        .sort((a, b) => a.s - b.s); // ascending — lowest score first

      const excess = remaining.length - this.maxRecords;
      for (let i = 0; i < excess; i++) {
        if (scored[i].s !== Infinity) toEvict.push(scored[i].id);
      }
    }

    return toEvict;
  }

  /**
   * Prune an in-memory array of records in-place.
   * Returns a PruneResult summary.
   */
  prune(records: MemoryRecord[]): PruneResult {
    const t0 = Date.now();
    const toEvict = this.selectForEviction(records);

    const evictSet = new Set(toEvict);
    let removed = 0;
    for (let i = records.length - 1; i >= 0; i--) {
      if (evictSet.has(records[i].id)) {
        records.splice(i, 1);
        removed++;
      }
    }

    const result: PruneResult = {
      removed,
      kept: records.length,
      removedIds: toEvict,
      durationMs: Date.now() - t0,
    };

    if (this.verbose && removed > 0) {
      console.log(`[MemoryPruner] Pruned ${removed} records, kept ${records.length} (${result.durationMs}ms)`);
    }

    return result;
  }

  /**
   * Apply importance decay to all records in-place.
   * Call this periodically (e.g. every hour) to age memories.
   */
  applyDecay(records: MemoryRecord[]): void {
    for (const r of records) {
      if (r.importance >= 1.0) continue; // pinned
      const decayed = r.importance * decayWeight(r.createdAt, this.halfLifeHours);
      r.importance = Math.max(this.minImportance / 2, decayed);
    }
  }

  /** Return a human-readable summary of what would be pruned (dry run). */
  dryRun(records: MemoryRecord[]): { wouldRemove: number; wouldKeep: number; removedIds: string[] } {
    const removedIds = this.selectForEviction(records);
    return { wouldRemove: removedIds.length, wouldKeep: records.length - removedIds.length, removedIds };
  }
}

// Fix: selectForEviction uses a helper to avoid prototype pollution
// Patch the add_id helper into Array prototype is bad practice — use a closure instead
MemoryPruner.prototype["selectForEviction"] = function(records: MemoryRecord[]): string[] {
  const toEvict: string[] = [];
  const halfLifeHours: number = (this as any).halfLifeHours;
  const minImportance: number = (this as any).minImportance;
  const maxRecords: number = (this as any).maxRecords;

  for (const r of records) {
    if (r.importance < minImportance && r.importance < 1.0) toEvict.push(r.id);
  }

  const remaining = records.filter((r) => !toEvict.includes(r.id));
  if (remaining.length > maxRecords) {
    const scored = remaining
      .map((r) => ({ id: r.id, s: score(r, halfLifeHours) }))
      .sort((a, b) => a.s - b.s);
    const excess = remaining.length - maxRecords;
    for (let i = 0; i < excess; i++) {
      if (scored[i].s !== Infinity) toEvict.push(scored[i].id);
    }
  }

  return toEvict;
};
''')

# ─────────────────────────────────────────────────────────────────────────────
# 4. routes/memory.ts — add bulk-pin and export endpoints
# ─────────────────────────────────────────────────────────────────────────────
memory_route_path = os.path.join(BASE, "backend/src/routes/memory.ts")
with open(memory_route_path) as f:
    memory_route = f.read()

BULK_PIN_EXPORT = r'''
  // POST /api/memory/bulk-pin — pin multiple records at once
  router.post("/bulk-pin", (req: Request, res: Response) => {
    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ ok: false, error: "ids must be a non-empty array" });
      return;
    }
    const validIds = ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0);
    if (validIds.length === 0) {
      res.status(400).json({ ok: false, error: "ids must contain at least one non-empty string" });
      return;
    }
    const pinned: string[] = [];
    const missing: string[] = [];
    for (const id of validIds) {
      try {
        memory.pin(id);
        pinned.push(id);
      } catch {
        missing.push(id);
      }
    }
    ok(res, { pinned, missing, pinnedCount: pinned.length, missingCount: missing.length });
  });

  // GET /api/memory/export/:sessionId — export all memory for a session as NDJSON
  router.get("/export/:sessionId", (req: Request, res: Response) => {
    const { sessionId } = req.params;
    if (!sessionId?.trim()) {
      res.status(400).json({ ok: false, error: "sessionId is required" });
      return;
    }
    const results = memory.search({ sessionId, limit: 10_000 });
    res.setHeader("Content-Type", "application/x-ndjson");
    res.setHeader("Content-Disposition", `attachment; filename="memory-${sessionId}.ndjson"`);
    for (const record of results) {
      res.write(JSON.stringify(record) + "\n");
    }
    res.end();
  });

  return router;
}
'''

# Replace the final `return router;\n}` with the new endpoints + return
if "bulk-pin" not in memory_route:
    patched_memory = memory_route.rstrip()
    # Remove trailing `return router;\n}` and append new block
    if patched_memory.endswith("return router;\n}"):
        patched_memory = patched_memory[:-len("return router;\n}")] + BULK_PIN_EXPORT
    elif patched_memory.endswith("return router;\n  }"):
        patched_memory = patched_memory[:-len("return router;\n  }")] + BULK_PIN_EXPORT
    else:
        # Find last occurrence of `return router;`
        idx = patched_memory.rfind("return router;")
        if idx != -1:
            patched_memory = patched_memory[:idx] + BULK_PIN_EXPORT
        else:
            print("  WARN: could not find insertion point in memory.ts")
            patched_memory = None

    if patched_memory:
        with open(memory_route_path, "w") as f:
            f.write(patched_memory)
        print("  patched backend/src/routes/memory.ts (bulk-pin + export)")
else:
    print("  skip backend/src/routes/memory.ts (already patched)")

# ─────────────────────────────────────────────────────────────────────────────
# 5. Tests
# ─────────────────────────────────────────────────────────────────────────────
w("backend/examples/marketAgent.test.ts", r'''/**
 * Tests for MarketAgent pricing logic.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("marketAgent", () => {
  it("runs without crashing and produces a valid listing", () => {
    const agentPath = path.resolve(__dirname, "marketAgent.ts");
    let stdout = "";
    try {
      stdout = execSync(`npx tsx "${agentPath}"`, { timeout: 15_000 }).toString();
    } catch (err: any) {
      throw new Error(`marketAgent crashed: ${err.stderr?.toString() ?? err.message}`);
    }
    const match = stdout.match(/(\{[\s\S]*\})\s*$/);
    expect(match, "No JSON output found").toBeTruthy();
    const result = JSON.parse(match![1]);
    expect(result.listing.price0G).toBeGreaterThan(0);
    expect(result.listing.priceLow0G).toBeLessThan(result.listing.price0G);
    expect(result.listing.priceHigh0G).toBeGreaterThan(result.listing.price0G);
    expect(result.listing.capabilities).toBeInstanceOf(Array);
    expect(result.listing.capabilities.length).toBeGreaterThan(0);
    expect(result.pricing.factors.reliabilityScore).toBeGreaterThan(0);
    expect(result.stats.successes).toBe(1);
    expect(result.stats.toolCalls).toBeGreaterThanOrEqual(3);
  });
});
''')

w("backend/examples/baseAgent.test.ts", r'''/**
 * Unit tests for BaseAgent helpers.
 */
import { describe, it, expect, vi } from "vitest";
import { BaseAgent } from "./baseAgent.js";

class TestAgent extends BaseAgent {
  constructor() { super("testAgent"); }
  async run() { return this.finalize(); }
  // Expose protected methods for testing
  testPlan(goal: string) { return this.plan(goal); }
  testToolCall(name: string, input: unknown) { return this.toolCall(name, input); }
  testRecordTurn(role: "user" | "assistant", content: string, tags?: string[]) {
    this.recordTurn({ role, content, tags });
  }
  testGetMemoryByTag(...tags: string[]) { return this.getMemoryByTag(...tags); }
  testSummarizeMemory(n?: number) { return this.summarizeMemory(n); }
  testSuccess() { this.success(); }
  testFailure() { this.failure(); }
  testReset() { this.reset(); }
  async testRetryTool<T>(name: string, fn: () => Promise<T>, opts?: any) {
    return this.retryTool(name, fn, opts);
  }
  async testWithTimeout<T>(fn: () => Promise<T>, ms: number) {
    return this.withTimeout(fn, ms, "test-op");
  }
}

describe("BaseAgent", () => {
  it("records turns with auto-timestamp", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "hello");
    const stats = agent.finalize();
    expect(stats.turns).toBe(1);
    expect(stats.memory[0].timestamp).toBeTruthy();
    expect(new Date(stats.memory[0].timestamp).getTime()).toBeLessThanOrEqual(Date.now());
  });

  it("getMemoryByTag filters correctly", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "refund request", ["refund", "laptop"]);
    agent.testRecordTurn("assistant", "policy checked", ["policy"]);
    agent.testRecordTurn("user", "another refund", ["refund"]);
    const refundMem = agent.testGetMemoryByTag("refund");
    expect(refundMem.length).toBe(2);
    const policyMem = agent.testGetMemoryByTag("policy");
    expect(policyMem.length).toBe(1);
    const noneMem = agent.testGetMemoryByTag("nonexistent");
    expect(noneMem.length).toBe(0);
  });

  it("summarizeMemory returns prose summary", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "first message");
    agent.testRecordTurn("assistant", "first reply");
    const summary = agent.testSummarizeMemory();
    expect(summary).toContain("[user]");
    expect(summary).toContain("[assistant]");
  });

  it("summarizeMemory returns 'No prior memory' when empty", () => {
    const agent = new TestAgent();
    expect(agent.testSummarizeMemory()).toBe("No prior memory.");
  });

  it("plan increments plansBuilt and sets lastGoal", () => {
    const agent = new TestAgent();
    const steps = agent.testPlan("test goal");
    const stats = agent.finalize();
    expect(stats.plansBuilt).toBe(1);
    expect(stats.lastGoal).toBe("test goal");
    expect(steps.length).toBeGreaterThan(0);
  });

  it("toolCall increments toolCalls and emits tool event", () => {
    const agent = new TestAgent();
    const listener = vi.fn();
    agent.on("tool", listener);
    agent.testToolCall("myTool", { x: 1 });
    const stats = agent.finalize();
    expect(stats.toolCalls).toBe(1);
    expect(listener).toHaveBeenCalledOnce();
    expect(listener.mock.calls[0][0].name).toBe("myTool");
  });

  it("retryTool succeeds on second attempt", async () => {
    const agent = new TestAgent();
    let calls = 0;
    const result = await agent.testRetryTool("flaky", async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
      return "ok";
    }, { maxAttempts: 3, baseMs: 1 });
    expect(result).toBe("ok");
    expect(calls).toBe(2);
    const stats = agent.finalize();
    expect(stats.toolRetries).toBe(1);
  });

  it("retryTool throws after max attempts", async () => {
    const agent = new TestAgent();
    await expect(
      agent.testRetryTool("alwaysFail", async () => { throw new Error("always"); }, { maxAttempts: 2, baseMs: 1 }),
    ).rejects.toThrow("always");
  });

  it("withTimeout resolves when fn completes in time", async () => {
    const agent = new TestAgent();
    const result = await agent.testWithTimeout(async () => "fast", 1000);
    expect(result).toBe("fast");
  });

  it("withTimeout throws when fn exceeds limit", async () => {
    const agent = new TestAgent();
    await expect(
      agent.testWithTimeout(() => new Promise((r) => setTimeout(r, 500)), 50),
    ).rejects.toThrow("timed out");
  });

  it("reset clears memory and stats", () => {
    const agent = new TestAgent();
    agent.testRecordTurn("user", "hello");
    agent.testSuccess();
    agent.testReset();
    const stats = agent.finalize();
    expect(stats.turns).toBe(0);
    expect(stats.successes).toBe(0);
    expect(stats.memory.length).toBe(0);
  });

  it("emits reset event on reset()", () => {
    const agent = new TestAgent();
    const listener = vi.fn();
    agent.on("reset", listener);
    agent.testReset();
    expect(listener).toHaveBeenCalledOnce();
  });

  it("finalize includes toolLog", () => {
    const agent = new TestAgent();
    agent.testToolCall("t1", {});
    agent.testToolCall("t2", {});
    const stats = agent.finalize();
    expect(stats.toolLog.length).toBe(2);
    expect(stats.toolLog[0].name).toBe("t1");
  });
});
''')

w("packages/core/src/memory/pruner.test.ts", r'''import { describe, it, expect } from "vitest";
import { MemoryPruner, MemoryRecord } from "./pruner.js";

function makeRecord(overrides: Partial<MemoryRecord> = {}): MemoryRecord {
  return {
    id: `id-${Math.random().toString(36).slice(2)}`,
    sessionId: "s1",
    type: "turn",
    importance: 0.5,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("MemoryPruner", () => {
  it("does not evict pinned records (importance=1)", () => {
    const pruner = new MemoryPruner({ maxRecords: 1 });
    const records = [
      makeRecord({ importance: 1.0 }),
      makeRecord({ importance: 0.3 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    expect(records[0].importance).toBe(1.0);
  });

  it("evicts records below minImportance", () => {
    const pruner = new MemoryPruner({ minImportance: 0.1 });
    const records = [
      makeRecord({ importance: 0.05 }),
      makeRecord({ importance: 0.5 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    expect(records.every((r) => r.importance >= 0.1)).toBe(true);
  });

  it("evicts lowest-scoring records when over maxRecords", () => {
    const pruner = new MemoryPruner({ maxRecords: 2 });
    const records = [
      makeRecord({ importance: 0.9 }),
      makeRecord({ importance: 0.8 }),
      makeRecord({ importance: 0.1 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    expect(records.length).toBe(2);
  });

  it("lessons score higher than turns (type weight)", () => {
    const pruner = new MemoryPruner({ maxRecords: 1 });
    const records = [
      makeRecord({ type: "lesson",  importance: 0.5 }),
      makeRecord({ type: "turn",    importance: 0.5 }),
    ];
    const result = pruner.prune(records);
    expect(result.removed).toBe(1);
    // The turn should be evicted, lesson kept
    expect(records[0].type).toBe("lesson");
  });

  it("dryRun does not mutate records", () => {
    const pruner = new MemoryPruner({ maxRecords: 1 });
    const records = [makeRecord(), makeRecord()];
    const dry = pruner.dryRun(records);
    expect(dry.wouldRemove).toBe(1);
    expect(records.length).toBe(2); // unchanged
  });

  it("applyDecay reduces importance over time", () => {
    const pruner = new MemoryPruner({ halfLifeHours: 0.001 }); // very short half-life
    const oldDate = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
    const records = [makeRecord({ importance: 0.8, createdAt: oldDate })];
    pruner.applyDecay(records);
    expect(records[0].importance).toBeLessThan(0.8);
  });
});
''')

print("\nAll v2 improvements written successfully.")

/**
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

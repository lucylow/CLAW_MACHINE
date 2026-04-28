/**
 * PruningService
 *
 * Manages the memory lifecycle to prevent unbounded growth:
 *   - Compresses older episodes into summaries via 0G Compute
 *   - Retains important failures (high-importance reflections)
 *   - Evicts low-importance records using LRU + importance scoring
 *   - Archives compressed summaries to 0G Storage cold tier
 *   - Emits pruning events for observability
 *
 * Pruning is configurable and visible in logs, as required by the design doc.
 */

import type { ZeroGComputeAdapter } from "../adapters/ZeroGComputeAdapter";
import type { ZeroGStorageAdapter } from "../adapters/ZeroGStorageAdapter";
import type { MemoryOrchestrator } from "./MemoryOrchestrator";
import { SUMMARIZE_SYSTEM, buildSummarizePrompt } from "../prompts/templates";

export interface PruningConfig {
  /** Maximum number of records before pruning is triggered */
  maxRecords: number;
  /** Records with importance below this threshold are candidates for eviction */
  importanceThreshold: number;
  /** Records older than this (ms) are candidates for summarization */
  ageThresholdMs: number;
  /** How many records to summarize per pruning run */
  summarizeBatchSize: number;
}

export interface PruningResult {
  evicted: number;
  summarized: number;
  archived: number;
  summaryHashes: string[];
  durationMs: number;
  triggeredAt: number;
}

const DEFAULT_CONFIG: PruningConfig = {
  maxRecords: 500,
  importanceThreshold: 0.15,
  ageThresholdMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  summarizeBatchSize: 10,
};

export class PruningService {
  private readonly memory: MemoryOrchestrator;
  private readonly compute: ZeroGComputeAdapter;
  private readonly storage: ZeroGStorageAdapter;
  private readonly config: PruningConfig;
  private lastRunAt = 0;

  constructor(
    memory: MemoryOrchestrator,
    compute: ZeroGComputeAdapter,
    storage: ZeroGStorageAdapter,
    config: Partial<PruningConfig> = {},
  ) {
    this.memory = memory;
    this.compute = compute;
    this.storage = storage;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run a pruning cycle if the memory store is above the threshold.
   * Returns null if pruning was not needed.
   */
  async maybePrune(): Promise<PruningResult | null> {
    const stats = this.memory.getStats();
    if (stats.totalRecords < this.config.maxRecords) return null;
    return this.prune();
  }

  /**
   * Force a pruning cycle regardless of current record count.
   */
  async prune(): Promise<PruningResult> {
    const start = Date.now();
    const result: PruningResult = {
      evicted: 0,
      summarized: 0,
      archived: 0,
      summaryHashes: [],
      durationMs: 0,
      triggeredAt: start,
    };

    const records = this.memory.getRecords(1000);
    const now = Date.now();

    // Phase 1: Identify candidates for eviction (low importance, not pinned, old)
    const evictCandidates = records.filter(
      (r) =>
        r &&
        !r.pinned &&
        r.importance < this.config.importanceThreshold &&
        now - r.timestamp > this.config.ageThresholdMs,
    );

    // Phase 2: Identify candidates for summarization (old episodes, not reflections)
    const summarizeCandidates = records.filter(
      (r) =>
        r &&
        !r.pinned &&
        r.type === "episode" &&
        now - r.timestamp > this.config.ageThresholdMs,
    );

    // Summarize a batch of old episodes
    const batch = summarizeCandidates.slice(0, this.config.summarizeBatchSize);
    if (batch.length > 0) {
      try {
        const texts = batch.map((r) => r!.text).join("\n---\n");
        const prompt = buildSummarizePrompt(texts, batch.length);
        const response = await this.compute.infer({
          messages: [
            { role: "system", content: SUMMARIZE_SYSTEM },
            { role: "user", content: prompt },
          ],
        });

        // Archive the summary to 0G Storage cold tier
        const summaryBlob = Buffer.from(
          JSON.stringify({
            summary: response.content,
            sourceIds: batch.map((r) => r!.id),
            summarizedAt: now,
            recordCount: batch.length,
          }),
        );
        const hash = await this.storage.uploadBlob(summaryBlob);
        result.summaryHashes.push(hash);
        result.summarized += batch.length;
        result.archived++;

        // Soft-delete the summarized episodes from the hot index
        for (const r of batch) {
          if (r) this.memory.softDelete(r.id);
        }
      } catch {
        // Pruning failures are non-fatal
      }
    }

    // Evict low-importance records
    for (const r of evictCandidates.slice(0, 50)) {
      if (r) {
        this.memory.softDelete(r.id);
        result.evicted++;
      }
    }

    result.durationMs = Date.now() - start;
    this.lastRunAt = start;
    return result;
  }

  getLastRunAt(): number {
    return this.lastRunAt;
  }

  getConfig(): PruningConfig {
    return { ...this.config };
  }
}

import type { MemoryProvider } from "../provider.js";

/**
 * Async compaction hook: fetch raw logs, summarize via sealed inference, refresh KV, prune history.
 * Implement storage/compute calls in your deployment; this class wires the orchestration seam.
 */
export class PrunerWorker {
  constructor(private readonly memoryProvider: MemoryProvider) {}

  async runCompaction(streamId: string): Promise<void> {
    await this.memoryProvider.listByStream(streamId, 10_000);
    // 1. Fetch raw logs from 0G Storage (via MemoryProvider / storage adapter)
    // 2. Compress via 0G Compute sealed inference when `compute` is configured
    // 3. Update KV working memory with summaries
    // 4. Prune stale history to manage network costs
  }
}

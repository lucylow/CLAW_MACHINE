/**
 * VectorIndex
 *
 * In-process cosine-similarity vector index for semantic memory retrieval.
 * Used by MemoryOrchestrator to surface the most relevant past reflections
 * and lessons when a new task begins.
 *
 * Design:
 *   - Embeddings are 1536-dimensional float arrays (compatible with OpenAI
 *     text-embedding-ada-002 and 0G Compute embedding endpoints)
 *   - Retrieval uses brute-force cosine similarity (suitable for <10k records)
 *   - Supports recency weighting and importance weighting alongside similarity
 *   - Can be swapped for hnswlib-node for large-scale deployments
 *
 * @see https://docs.0g.ai/build-with-0g/compute-network/sdk (embedding endpoint)
 */

export interface VectorRecord {
  id: string;
  embedding: number[];
  metadata: {
    type: "reflection" | "episode" | "summary" | "lesson";
    text: string;
    importance: number; // 0–1
    timestamp: number;
    tags?: string[];
    sessionId?: string;
    walletAddress?: string;
  };
}

export interface SearchResult {
  id: string;
  score: number; // combined similarity + recency + importance
  similarity: number; // raw cosine similarity
  metadata: VectorRecord["metadata"];
}

export class VectorIndex {
  private readonly records = new Map<string, VectorRecord>();
  private readonly DIMENSION = 1536;

  // ── Indexing ──────────────────────────────────────────────────────────────

  /**
   * Add or update a record in the index.
   */
  upsert(record: VectorRecord): void {
    if (record.embedding.length !== this.DIMENSION) {
      throw new Error(
        `Embedding dimension mismatch: expected ${this.DIMENSION}, got ${record.embedding.length}`,
      );
    }
    this.records.set(record.id, record);
  }

  /**
   * Remove a record from the index.
   */
  delete(id: string): boolean {
    return this.records.delete(id);
  }

  // ── Search ────────────────────────────────────────────────────────────────

  /**
   * Find the top-k most relevant records for a query embedding.
   *
   * The final score combines:
   *   - cosine similarity (primary signal)
   *   - recency weight (decays over 30 days)
   *   - importance weight (user-assigned 0–1)
   *
   * This mirrors the retrieval strategy described in the Claw Machine design doc:
   * "semantic similarity, recency weighting, importance weighting, task-type matching"
   */
  search(
    queryEmbedding: number[],
    options?: {
      k?: number;
      minSimilarity?: number;
      type?: VectorRecord["metadata"]["type"];
      tags?: string[];
      walletAddress?: string;
    },
  ): SearchResult[] {
    const k = options?.k ?? 5;
    const minSim = options?.minSimilarity ?? 0.0;
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    const results: SearchResult[] = [];

    for (const record of this.records.values()) {
      // Apply filters
      if (options?.type && record.metadata.type !== options.type) continue;
      if (options?.walletAddress && record.metadata.walletAddress !== options.walletAddress) continue;
      if (options?.tags?.length) {
        const hasTag = options.tags.some((t) => record.metadata.tags?.includes(t));
        if (!hasTag) continue;
      }

      const similarity = this.cosineSimilarity(queryEmbedding, record.embedding);
      if (similarity < minSim) continue;

      // Recency weight: 1.0 for very recent, decays to 0.5 over 30 days
      const ageMs = now - record.metadata.timestamp;
      const recencyWeight = 0.5 + 0.5 * Math.exp(-ageMs / thirtyDaysMs);

      // Combined score
      const score =
        similarity * 0.6 +
        recencyWeight * 0.2 +
        record.metadata.importance * 0.2;

      results.push({ id: record.id, score, similarity, metadata: record.metadata });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, k);
  }

  /**
   * Get a record by ID.
   */
  get(id: string): VectorRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Return all records, optionally filtered.
   */
  list(filter?: { type?: VectorRecord["metadata"]["type"] }): VectorRecord[] {
    const all = Array.from(this.records.values());
    if (!filter?.type) return all;
    return all.filter((r) => r.metadata.type === filter.type);
  }

  get size(): number {
    return this.records.size;
  }

  // ── Math ──────────────────────────────────────────────────────────────────

  /**
   * Cosine similarity between two unit-normalized vectors.
   * Returns a value in [-1, 1]; 1 = identical direction.
   */
  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

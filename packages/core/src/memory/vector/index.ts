/**
 * Lightweight in-process vector index (scaffold-compatible API).
 * For payload-aware search, prefer {@link SimpleVectorIndex} in `../vector-index.js`.
 */
export class VectorIndex {
  private readonly store: Array<{ id: string; vector: number[] }> = [];

  add(id: string, vector: number[]): void {
    this.store.push({ id, vector });
  }

  search(queryVector: number[], k: number): Array<{ id: string; score: number }> {
    return this.store
      .map((item) => ({ id: item.id, score: cosine(item.vector, queryVector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
}

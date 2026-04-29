export interface IndexedItem<T> {
  id: string;
  vector: number[];
  payload: T;
}

export class SimpleVectorIndex<T> {
  private readonly items: IndexedItem<T>[] = [];

  add(item: IndexedItem<T>): void {
    this.items.push(item);
  }

  search(vector: number[], topK = 5): Array<{ item: IndexedItem<T>; score: number }> {
    return this.items
      .map((item) => ({
        item,
        score: cosineSimilarity(vector, item.vector),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-9);
}

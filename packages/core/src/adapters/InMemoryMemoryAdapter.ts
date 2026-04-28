/**
 * InMemoryMemoryAdapter
 *
 * In-process memory adapter for development and testing.
 * Uses simple keyword overlap for "semantic" search.
 */

import { randomUUID } from "crypto";
import type {
  MemoryAdapter,
  MemoryRecord,
  MemorySearchQuery,
  MemorySearchResult,
  MemoryStats,
  MemoryType,
} from "../types.js";

export class InMemoryMemoryAdapter implements MemoryAdapter {
  private readonly records: Map<string, MemoryRecord> = new Map();

  async save(
    record: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<MemoryRecord> {
    const now = Date.now();
    const full: MemoryRecord = {
      ...record,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
    };
    this.records.set(full.id, full);
    return full;
  }

  async search(query: MemorySearchQuery): Promise<MemorySearchResult[]> {
    const limit = query.limit ?? 10;
    let results = [...this.records.values()];

    if (query.types?.length) {
      results = results.filter((r) => query.types!.includes(r.type));
    }
    if (query.walletAddress) {
      results = results.filter((r) => r.walletAddress === query.walletAddress);
    }
    if (query.minImportance !== undefined) {
      results = results.filter((r) => r.importance >= query.minImportance!);
    }
    if (query.tags?.length) {
      results = results.filter((r) => query.tags!.some((t) => r.tags.includes(t)));
    }

    // Simple keyword scoring
    const keywords = (query.text ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    const scored: MemorySearchResult[] = results.map((record) => {
      let score = record.importance * 0.3;
      if (keywords.length > 0) {
        const content = record.content.toLowerCase();
        const matches = keywords.filter((k) => content.includes(k)).length;
        score += (matches / keywords.length) * 0.7;
      }
      return { record, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async get(id: string): Promise<MemoryRecord | null> {
    return this.records.get(id) ?? null;
  }

  async pin(id: string): Promise<void> {
    const r = this.records.get(id);
    if (r) { r.pinned = true; r.updatedAt = Date.now(); }
  }

  async delete(id: string): Promise<void> {
    this.records.delete(id);
  }

  async stats(): Promise<MemoryStats> {
    const all = [...this.records.values()];
    const byType: Partial<Record<MemoryType, number>> = {};
    let importanceSum = 0;
    let pinned = 0;
    for (const r of all) {
      byType[r.type] = (byType[r.type] ?? 0) + 1;
      importanceSum += r.importance;
      if (r.pinned) pinned++;
    }
    return {
      total: all.length,
      byType,
      pinned,
      avgImportance: all.length > 0 ? importanceSum / all.length : 0,
    };
  }
}

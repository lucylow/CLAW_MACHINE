import { randomUUID } from "crypto";
import { MemoryRecord, MemoryType } from "../types/runtime";

export class MemoryStore {
  private readonly records = new Map<string, MemoryRecord>();
  private readonly schemaVersion = "memory.v1";

  store(input: Omit<MemoryRecord, "id" | "createdAt" | "updatedAt" | "version">): MemoryRecord {
    const now = Date.now();
    const record: MemoryRecord = {
      ...input,
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      version: this.schemaVersion,
    };
    this.records.set(record.id, record);
    return record;
  }

  retrieve(id: string): MemoryRecord | undefined {
    return this.records.get(id);
  }

  listBySession(sessionId: string): MemoryRecord[] {
    return [...this.records.values()].filter((r) => r.sessionId === sessionId);
  }

  search(params: {
    sessionId?: string;
    walletAddress?: string;
    type?: MemoryType;
    tags?: string[];
    limit?: number;
  }): MemoryRecord[] {
    const limit = params.limit || 20;
    const tags = params.tags || [];
    return [...this.records.values()]
      .filter((r) => (params.sessionId ? r.sessionId === params.sessionId : true))
      .filter((r) => (params.walletAddress ? r.walletAddress === params.walletAddress : true))
      .filter((r) => (params.type ? r.type === params.type : true))
      .filter((r) => (tags.length ? tags.some((tag) => r.tags.includes(tag)) : true))
      .sort((a, b) => (b.importance - a.importance) || (b.updatedAt - a.updatedAt))
      .slice(0, limit);
  }

  summarize(sessionId: string): string {
    const recent = this.listBySession(sessionId).slice(-10);
    if (!recent.length) return "No memory stored yet.";
    return recent.map((r) => `[${r.type}] ${r.summary}`).join("\n");
  }

  prune(maxRecordsPerSession = 150): number {
    const grouped = new Map<string, MemoryRecord[]>();
    for (const record of this.records.values()) {
      if (!grouped.has(record.sessionId)) grouped.set(record.sessionId, []);
      grouped.get(record.sessionId)!.push(record);
    }
    let removed = 0;
    for (const list of grouped.values()) {
      if (list.length <= maxRecordsPerSession) continue;
      const candidates = list
        .filter((r) => !r.pinned)
        .sort((a, b) => (a.importance - b.importance) || (a.updatedAt - b.updatedAt));
      const toDelete = Math.min(candidates.length, list.length - maxRecordsPerSession);
      for (let i = 0; i < toDelete; i++) {
        this.records.delete(candidates[i].id);
        removed++;
      }
    }
    return removed;
  }
}

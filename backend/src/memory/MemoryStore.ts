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
    query?: string;
    limit?: number;
  }): MemoryRecord[] {
    const limit = params.limit || 20;
    const tags = params.tags || [];
    const query = params.query?.toLowerCase();

    return [...this.records.values()]
      .filter((r) => (params.sessionId ? r.sessionId === params.sessionId : true))
      .filter((r) => (params.walletAddress ? r.walletAddress === params.walletAddress : true))
      .filter((r) => (params.type ? r.type === params.type : true))
      .filter((r) => (tags.length ? tags.some((tag) => r.tags.includes(tag)) : true))
      .map(r => {
        // Calculate a relevance score based on query match and importance
        let score = r.importance;
        if (query) {
          if (r.summary.toLowerCase().includes(query)) score += 0.5;
          if (r.tags.some(t => t.toLowerCase().includes(query))) score += 0.3;
        }
        return { record: r, score };
      })
      .sort((a, b) => b.score - a.score || b.record.updatedAt - a.record.updatedAt)
      .map(item => item.record)
      .slice(0, limit);
  }

  summarize(sessionId: string): string {
    const records = this.listBySession(sessionId);
    if (!records.length) return "No memory stored yet.";

    // Prioritize reflections and important turns
    const reflections = records.filter(r => r.type === 'reflection').slice(-5);
    const importantTurns = records.filter(r => r.type === 'conversation_turn' && r.importance > 0.7).slice(-5);
    const recentTurns = records.filter(r => r.type === 'conversation_turn').slice(-3);

    const summaryParts = [
      "### Recent Reflections & Lessons Learned",
      ...reflections.map(r => `- ${r.summary}`),
      "\n### Key Past Actions",
      ...importantTurns.map(r => `- ${r.summary}`),
      "\n### Recent Context",
      ...recentTurns.map(r => `- ${r.summary}`)
    ];

    return summaryParts.join("\n");
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

import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { EvolutionAttempt, EvolutionHistoryQuery, EvolutionHistorySnapshot } from "./types.js";

export interface EvolutionStore {
  saveAttempt(attempt: EvolutionAttempt): Promise<void>;
  updateAttempt(attempt: EvolutionAttempt): Promise<void>;
  getAttempt(id: string): Promise<EvolutionAttempt | undefined>;
  listAttempts(query?: EvolutionHistoryQuery): Promise<EvolutionAttempt[]>;
  exportSnapshot(): Promise<EvolutionHistorySnapshot>;
  importSnapshot(snapshot: EvolutionHistorySnapshot): Promise<void>;
}

export class InMemoryEvolutionStore implements EvolutionStore {
  private readonly attempts = new Map<string, EvolutionAttempt>();

  async saveAttempt(attempt: EvolutionAttempt): Promise<void> {
    this.attempts.set(attempt.id, JSON.parse(JSON.stringify(attempt)));
  }

  async updateAttempt(attempt: EvolutionAttempt): Promise<void> {
    this.attempts.set(attempt.id, JSON.parse(JSON.stringify(attempt)));
  }

  async getAttempt(id: string): Promise<EvolutionAttempt | undefined> {
    const item = this.attempts.get(id);
    return item ? JSON.parse(JSON.stringify(item)) : undefined;
  }

  async listAttempts(query: EvolutionHistoryQuery = {}): Promise<EvolutionAttempt[]> {
    const rows = [...this.attempts.values()];
    const filtered = rows.filter((a) => {
      if (query.status && a.status !== query.status) return false;
      if (query.stage && a.stage !== query.stage) return false;
      if (query.skillId && a.promotedSkillId !== query.skillId) return false;
      if (query.taskContains && !a.task.toLowerCase().includes(query.taskContains.toLowerCase())) return false;
      return true;
    });
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return JSON.parse(JSON.stringify(filtered.slice(offset, offset + limit)));
  }

  async exportSnapshot(): Promise<EvolutionHistorySnapshot> {
    const attempts = await this.listAttempts({ limit: 10_000 });
    return {
      version: "evolution.history.v1",
      createdAt: Date.now(),
      attempts,
    };
  }

  async importSnapshot(snapshot: EvolutionHistorySnapshot): Promise<void> {
    this.attempts.clear();
    for (const attempt of snapshot.attempts ?? []) this.attempts.set(attempt.id, JSON.parse(JSON.stringify(attempt)));
  }
}

export class JsonFileEvolutionStore implements EvolutionStore {
  constructor(private readonly filePath: string) {}

  async saveAttempt(attempt: EvolutionAttempt): Promise<void> {
    const rows = await this.readAll();
    rows.set(attempt.id, attempt);
    await this.writeAll(rows);
  }

  async updateAttempt(attempt: EvolutionAttempt): Promise<void> {
    return this.saveAttempt(attempt);
  }

  async getAttempt(id: string): Promise<EvolutionAttempt | undefined> {
    const rows = await this.readAll();
    return rows.get(id);
  }

  async listAttempts(query: EvolutionHistoryQuery = {}): Promise<EvolutionAttempt[]> {
    const rows = [...(await this.readAll()).values()];
    const filtered = rows.filter((a) => {
      if (query.status && a.status !== query.status) return false;
      if (query.stage && a.stage !== query.stage) return false;
      if (query.skillId && a.promotedSkillId !== query.skillId) return false;
      if (query.taskContains && !a.task.toLowerCase().includes(query.taskContains.toLowerCase())) return false;
      return true;
    });
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return filtered.slice(offset, offset + limit);
  }

  async exportSnapshot(): Promise<EvolutionHistorySnapshot> {
    return {
      version: "evolution.history.v1",
      createdAt: Date.now(),
      attempts: await this.listAttempts({ limit: 10_000 }),
    };
  }

  async importSnapshot(snapshot: EvolutionHistorySnapshot): Promise<void> {
    const map = new Map<string, EvolutionAttempt>();
    for (const attempt of snapshot.attempts ?? []) map.set(attempt.id, attempt);
    await this.writeAll(map);
  }

  private async readAll(): Promise<Map<string, EvolutionAttempt>> {
    try {
      if (!fs.existsSync(this.filePath)) return new Map();
      const raw = await fs.promises.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as EvolutionHistorySnapshot;
      const map = new Map<string, EvolutionAttempt>();
      for (const attempt of parsed.attempts ?? []) map.set(attempt.id, attempt);
      return map;
    } catch {
      return new Map();
    }
  }

  private async writeAll(map: Map<string, EvolutionAttempt>): Promise<void> {
    await fs.promises.mkdir(path.dirname(this.filePath), { recursive: true });
    const payload: EvolutionHistorySnapshot = {
      version: "evolution.history.v1",
      createdAt: Date.now(),
      attempts: [...map.values()],
    };
    await fs.promises.writeFile(this.filePath, JSON.stringify(payload, null, 2), "utf8");
  }
}

export class ZeroGStorageEvolutionStore implements EvolutionStore {
  constructor(
    private readonly storage: {
      put(
        key: string,
        value: unknown,
        opts?: { contentType?: string; compress?: boolean; encrypt?: boolean; ttlMs?: number; metadata?: Record<string, unknown> }
      ): Promise<{
        key: string;
        checksum: string;
        createdAt: number;
        updatedAt: number;
        ttlMs?: number;
        contentType?: string;
        metadata?: Record<string, unknown>;
        bytes: number;
      }>;
      get<T = unknown>(key: string): Promise<T | undefined>;
      list(prefix?: string): Promise<
        Array<{
          key: string;
          checksum: string;
          createdAt: number;
          updatedAt: number;
          ttlMs?: number;
          contentType?: string;
          metadata?: Record<string, unknown>;
          bytes: number;
        }>
      >;
      del(key: string): Promise<boolean>;
    },
    private readonly prefix = "evolution"
  ) {}

  async saveAttempt(attempt: EvolutionAttempt): Promise<void> {
    await this.storage.put(`${this.prefix}/attempts/${attempt.id}.json`, attempt, {
      contentType: "application/json",
      compress: true,
      encrypt: false,
      ttlMs: undefined,
      metadata: {
        kind: "evolution_attempt",
        attemptId: attempt.id,
        stage: attempt.stage,
        status: attempt.status,
      },
    });
  }

  async updateAttempt(attempt: EvolutionAttempt): Promise<void> {
    return this.saveAttempt(attempt);
  }

  async getAttempt(id: string): Promise<EvolutionAttempt | undefined> {
    return this.storage.get<EvolutionAttempt>(`${this.prefix}/attempts/${id}.json`);
  }

  async listAttempts(query: EvolutionHistoryQuery = {}): Promise<EvolutionAttempt[]> {
    const items = await this.storage.list(`${this.prefix}/attempts/`);
    const attempts: EvolutionAttempt[] = [];
    for (const item of items) {
      const row = await this.storage.get<EvolutionAttempt>(item.key);
      if (row) attempts.push(row);
    }
    const filtered = attempts.filter((a) => {
      if (query.status && a.status !== query.status) return false;
      if (query.stage && a.stage !== query.stage) return false;
      if (query.skillId && a.promotedSkillId !== query.skillId) return false;
      if (query.taskContains && !a.task.toLowerCase().includes(query.taskContains.toLowerCase())) return false;
      return true;
    });
    const offset = query.offset ?? 0;
    const limit = query.limit ?? 100;
    return filtered.slice(offset, offset + limit);
  }

  async exportSnapshot(): Promise<EvolutionHistorySnapshot> {
    return {
      version: "evolution.history.v1",
      createdAt: Date.now(),
      attempts: await this.listAttempts({ limit: 10_000 }),
    };
  }

  async importSnapshot(snapshot: EvolutionHistorySnapshot): Promise<void> {
    for (const attempt of snapshot.attempts ?? []) {
      await this.saveAttempt(attempt);
    }
  }
}

export function hashAttempt(attempt: EvolutionAttempt): string {
  return crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        task: attempt.task,
        spec: attempt.spec,
        sourceHash: attempt.sourceHash,
        score: attempt.score,
      })
    )
    .digest("hex");
}

import Redis from "ioredis";
import type { MemoryStorageProvider } from "../../providers/storage/types";
import type { LogEntry, MemoryRecord, StorageQuery, StorageWriteResult } from "../../schemas/storage";

export class RedisStorageAdapter implements MemoryStorageProvider {
  name = "redis-storage";
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl);
  }

  async saveRecord<T>(record: MemoryRecord<T>): Promise<StorageWriteResult> {
    const key = `cm:kv:${record.streamId}:${record.key}`;
    await this.redis.set(key, JSON.stringify(record));
    return { ok: true, id: record.id };
  }

  async getRecord<T>(streamId: string, key: string): Promise<MemoryRecord<T> | null> {
    const val = await this.redis.get(`cm:kv:${streamId}:${key}`);
    return val ? (JSON.parse(val) as MemoryRecord<T>) : null;
  }

  async listRecords(query: StorageQuery): Promise<MemoryRecord[]> {
    const pattern = query.streamId ? `cm:kv:${query.streamId}:*` : "cm:kv:*";
    const keys = await this.redis.keys(pattern);
    if (!keys.length) return [];
    const values = await this.redis.mget(keys);
    const rows = values.filter((v): v is string => typeof v === "string").map((v) => JSON.parse(v) as MemoryRecord);
    return query.limit ? rows.slice(0, query.limit) : rows;
  }

  async appendLog(entry: LogEntry): Promise<StorageWriteResult> {
    await this.redis.lpush(`cm:log:${entry.streamId}`, JSON.stringify(entry));
    return { ok: true, id: entry.id };
  }

  async getLog(streamId: string, limit = 100): Promise<LogEntry[]> {
    const entries = await this.redis.lrange(`cm:log:${streamId}`, 0, limit - 1);
    return entries.map((e) => JSON.parse(e) as LogEntry);
  }
}

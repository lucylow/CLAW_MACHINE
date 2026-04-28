/**
 * InMemoryStorageAdapter
 *
 * In-process storage adapter for development and testing.
 * Data does not persist across process restarts.
 */

import { createHash } from "crypto";
import type {
  StorageAdapter,
  StorageWriteOptions,
  StorageReadResult,
} from "../types.js";

export class InMemoryStorageAdapter implements StorageAdapter {
  readonly mode = "mock" as const;
  private readonly kv: Map<string, { data: unknown; hash: string }> = new Map();
  private readonly logs: Map<string, unknown[]> = new Map();

  isAvailable(): boolean { return true; }

  async write<T>(key: string, value: T, _options?: StorageWriteOptions): Promise<string> {
    const json = JSON.stringify(value);
    const hash = createHash("sha256").update(json).digest("hex");
    this.kv.set(key, { data: value, hash });
    return hash;
  }

  async read<T>(key: string): Promise<StorageReadResult<T> | null> {
    const entry = this.kv.get(key);
    if (!entry) return null;
    return {
      data: entry.data as T,
      hash: entry.hash,
      tier: "hot",
      retrievedAt: Date.now(),
    };
  }

  async append(streamId: string, entry: unknown): Promise<void> {
    const log = this.logs.get(streamId) ?? [];
    log.push(entry);
    this.logs.set(streamId, log);
  }

  async readLog(streamId: string, limit = 100): Promise<unknown[]> {
    const log = this.logs.get(streamId) ?? [];
    return log.slice(-limit);
  }
}

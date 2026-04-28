/**
 * ZeroGStorageAdapterShim
 *
 * Implements the @claw/core StorageAdapter interface using 0G Storage.
 * Falls back to in-memory mode when no private key is provided.
 */

import { createHash } from "crypto";
import type { StorageAdapter, StorageWriteOptions, StorageReadResult } from "../../core/src/types.js";

interface Config {
  rpc: string;
  indexerRpc: string;
  privateKey?: string;
}

export class ZeroGStorageAdapterShim implements StorageAdapter {
  readonly mode: "production" | "mock";
  private readonly config: Config;
  // In-memory fallback
  private readonly kv: Map<string, { data: unknown; hash: string }> = new Map();
  private readonly logs: Map<string, unknown[]> = new Map();

  constructor(config: Config) {
    this.config = config;
    this.mode = config.privateKey ? "production" : "mock";
  }

  isAvailable(): boolean { return true; }

  async write<T>(key: string, value: T, _options?: StorageWriteOptions): Promise<string> {
    const json = JSON.stringify(value);
    const hash = createHash("sha256").update(json).digest("hex");

    if (this.mode === "production") {
      try {
        // 0G Storage KV write via indexer API
        const resp = await fetch(`${this.config.indexerRpc}/kv/set`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value: json, signer: this.config.privateKey }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!resp.ok) throw new Error(`0G KV write error ${resp.status}`);
        const data = await resp.json() as { hash?: string };
        return data.hash ?? hash;
      } catch (err) {
        console.warn("[ZeroGStorageAdapterShim] KV write fallback:", (err as Error).message);
      }
    }

    this.kv.set(key, { data: value, hash });
    return hash;
  }

  async read<T>(key: string): Promise<StorageReadResult<T> | null> {
    if (this.mode === "production") {
      try {
        const resp = await fetch(`${this.config.indexerRpc}/kv/get?key=${encodeURIComponent(key)}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) {
          const data = await resp.json() as { value?: string; hash?: string };
          if (data.value) {
            return {
              data: JSON.parse(data.value) as T,
              hash: data.hash ?? "",
              tier: "hot",
              retrievedAt: Date.now(),
            };
          }
        }
      } catch (err) {
        console.warn("[ZeroGStorageAdapterShim] KV read fallback:", (err as Error).message);
      }
    }

    const entry = this.kv.get(key);
    if (!entry) return null;
    return { data: entry.data as T, hash: entry.hash, tier: "hot", retrievedAt: Date.now() };
  }

  async append(streamId: string, entry: unknown): Promise<void> {
    if (this.mode === "production") {
      try {
        await fetch(`${this.config.indexerRpc}/log/append`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ streamId, entry: JSON.stringify(entry), signer: this.config.privateKey }),
          signal: AbortSignal.timeout(10_000),
        });
        return;
      } catch (err) {
        console.warn("[ZeroGStorageAdapterShim] Log append fallback:", (err as Error).message);
      }
    }
    const log = this.logs.get(streamId) ?? [];
    log.push(entry);
    this.logs.set(streamId, log);
  }

  async readLog(streamId: string, limit = 100): Promise<unknown[]> {
    if (this.mode === "production") {
      try {
        const resp = await fetch(`${this.config.indexerRpc}/log/read?streamId=${encodeURIComponent(streamId)}&limit=${limit}`, {
          signal: AbortSignal.timeout(10_000),
        });
        if (resp.ok) {
          const data = await resp.json() as { entries?: unknown[] };
          if (data.entries) return data.entries;
        }
      } catch (err) {
        console.warn("[ZeroGStorageAdapterShim] Log read fallback:", (err as Error).message);
      }
    }
    const log = this.logs.get(streamId) ?? [];
    return log.slice(-limit);
  }
}

import type { MemoryStorageProvider } from "../../providers/storage/types";
import type { LogEntry, MemoryRecord, StorageQuery, StorageWriteResult } from "../../schemas/storage";

export interface ZeroGStorageConfig {
  rpcUrl: string;
  privateKey: string;
  namespace?: string;
}

export class ZeroGStorageAdapter implements MemoryStorageProvider {
  name = "zero-g-storage";

  private rpcUrl: string;
  private privateKey: string;
  private namespace: string;

  constructor(config: ZeroGStorageConfig) {
    this.rpcUrl = config.rpcUrl;
    this.privateKey = config.privateKey;
    this.namespace = config.namespace ?? "claw-machine";
  }

  async saveRecord<T>(record: MemoryRecord<T>): Promise<StorageWriteResult> {
    const payload = { namespace: this.namespace, type: "kv-save", record, signer: this.privateKey.slice(0, 10) };
    const res = await fetch(`${this.rpcUrl}/kv/save`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`0G storage save failed: ${res.statusText}`);
    const data = (await res.json()) as { id?: string; hash?: string };
    return { ok: true, id: data.id ?? record.id, hash: data.hash };
  }

  async getRecord<T>(streamId: string, key: string): Promise<MemoryRecord<T> | null> {
    const url = new URL(`${this.rpcUrl}/kv/get`);
    url.searchParams.set("namespace", this.namespace);
    url.searchParams.set("streamId", streamId);
    url.searchParams.set("key", key);

    const res = await fetch(url);
    if (!res.ok) return null;
    return (await res.json()) as MemoryRecord<T>;
  }

  async listRecords(query: StorageQuery): Promise<MemoryRecord[]> {
    const url = new URL(`${this.rpcUrl}/kv/list`);
    url.searchParams.set("namespace", this.namespace);
    if (query.streamId) url.searchParams.set("streamId", query.streamId);
    if (query.key) url.searchParams.set("key", query.key);
    if (query.limit) url.searchParams.set("limit", String(query.limit));

    const res = await fetch(url);
    if (!res.ok) return [];
    return (await res.json()) as MemoryRecord[];
  }

  async appendLog(entry: LogEntry): Promise<StorageWriteResult> {
    const res = await fetch(`${this.rpcUrl}/log/append`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ namespace: this.namespace, entry, signer: this.privateKey.slice(0, 10) }),
    });
    if (!res.ok) throw new Error(`0G log append failed: ${res.statusText}`);
    const data = (await res.json()) as { id?: string; hash?: string };
    return { ok: true, id: data.id ?? entry.id, hash: data.hash };
  }

  async getLog(streamId: string, limit = 100): Promise<LogEntry[]> {
    const url = new URL(`${this.rpcUrl}/log/list`);
    url.searchParams.set("namespace", this.namespace);
    url.searchParams.set("streamId", streamId);
    url.searchParams.set("limit", String(limit));

    const res = await fetch(url);
    if (!res.ok) return [];
    return (await res.json()) as LogEntry[];
  }
}

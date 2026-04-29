import fs from "node:fs/promises";
import path from "node:path";
import type {
  AgentQueueEnvelope,
  DeliveryState,
  MessagePriority,
  QueueBackend,
  QueueLogger,
  QueueName,
  QueueQuery,
  QueueStats,
  QueueStore,
  ZeroGStorageQueueClient,
} from "./types";

function nowMs(): number {
  return Date.now();
}

function messageAddressList(recipient: string | string[]): string[] {
  return Array.isArray(recipient) ? recipient : [recipient];
}

function comparePriority(a: MessagePriority, b: MessagePriority): number {
  const rank: Record<MessagePriority, number> = { urgent: 4, high: 3, normal: 2, low: 1 };
  return rank[b] - rank[a];
}

function queueKeyForMessage(message: AgentQueueEnvelope): string {
  return `queue:${message.queue}:${message.id}`;
}

function matchesState(messageState: DeliveryState, queryState?: DeliveryState): boolean {
  return !queryState || messageState === queryState;
}

function matchesQuery<TPayload>(message: AgentQueueEnvelope<TPayload>, query: QueueQuery): boolean {
  if (query.queue && message.queue !== query.queue) return false;
  if (query.recipient && !messageAddressList(message.recipient).includes(query.recipient)) return false;
  if (query.sender && message.sender !== query.sender) return false;
  if (query.type && message.type !== query.type) return false;
  if (!matchesState(message.deliveryState, query.deliveryState)) return false;
  if (query.conversationId && message.conversationId !== query.conversationId) return false;
  if (query.correlationId && message.correlationId !== query.correlationId) return false;
  if (query.dedupeKey && message.dedupeKey !== query.dedupeKey) return false;
  if (query.availableOnly && Date.parse(message.availableAt) > nowMs()) return false;
  const tags = new Set(message.tags);
  if (query.tagsAnyOf?.length && !query.tagsAnyOf.some((tag) => tags.has(tag))) return false;
  if (query.tagsAllOf?.length && !query.tagsAllOf.every((tag) => tags.has(tag))) return false;
  return true;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

interface FileQueueStoreOptions {
  directory: string;
  backend?: QueueBackend;
  namespace?: string;
  logger?: QueueLogger;
}

interface StoredQueueIndexEntry {
  id: string;
  queue: QueueName;
  file: string;
}

interface QueueStateFile {
  version: number;
  messages: Array<AgentQueueEnvelope>;
}

export class FileQueueStore implements QueueStore {
  private readonly directory: string;
  private readonly backend: QueueBackend;
  private readonly namespace: string;
  private readonly logger?: QueueLogger;
  private initialized = false;
  private indexFile = "queue-index.json";

  constructor(options: FileQueueStoreOptions) {
    this.directory = options.directory;
    this.backend = options.backend ?? "file";
    this.namespace = options.namespace ?? "claw-machine";
    this.logger = options.logger;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.directory, { recursive: true });
    await this.ensureIndex();
    this.initialized = true;
    this.logger?.debug("A2A file queue store initialized", { directory: this.directory, namespace: this.namespace });
  }

  async enqueue<TPayload>(message: AgentQueueEnvelope<TPayload>): Promise<void> {
    await this.init();
    const file = this.fileForQueue(message.queue);
    const state = await this.readState(file);
    const existing = state.messages.findIndex((msg) => msg.id === message.id);
    if (existing >= 0) state.messages[existing] = message as AgentQueueEnvelope;
    else state.messages.push(message as AgentQueueEnvelope);
    await this.writeState(file, state);
    await this.upsertIndex(message.id, message.queue, file);
  }

  async update<TPayload>(message: AgentQueueEnvelope<TPayload>): Promise<void> {
    await this.enqueue(message);
  }

  async getById<TPayload = unknown>(id: string): Promise<AgentQueueEnvelope<TPayload> | null> {
    await this.init();
    const index = await this.readIndex();
    const hit = index.entries.find((entry) => entry.id === id);
    if (!hit) return null;
    const state = await this.readState(hit.file);
    return (state.messages.find((msg) => msg.id === id) as AgentQueueEnvelope<TPayload> | undefined) ?? null;
  }

  async query<TPayload = unknown>(query: QueueQuery): Promise<AgentQueueEnvelope<TPayload>[]> {
    await this.init();
    const files = query.queue ? [this.fileForQueue(query.queue)] : await this.listStateFiles();
    const results: AgentQueueEnvelope<TPayload>[] = [];
    for (const file of files) {
      const state = await this.readState(file);
      for (const message of state.messages) {
        if (matchesQuery(message, query)) results.push(message as AgentQueueEnvelope<TPayload>);
      }
    }
    results.sort((a, b) => {
      const priorityDelta = comparePriority(a.priority, b.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
    return typeof query.limit === "number" ? results.slice(0, query.limit) : results;
  }

  async delete(id: string): Promise<boolean> {
    await this.init();
    const index = await this.readIndex();
    const hit = index.entries.find((entry) => entry.id === id);
    if (!hit) return false;
    const state = await this.readState(hit.file);
    const before = state.messages.length;
    state.messages = state.messages.filter((msg) => msg.id !== id);
    await this.writeState(hit.file, state);
    await this.removeIndex(id);
    return state.messages.length < before;
  }

  async stats(queue?: QueueName): Promise<QueueStats[]> {
    await this.init();
    const files = queue ? [this.fileForQueue(queue)] : await this.listStateFiles();
    const stats: QueueStats[] = [];
    for (const file of files) {
      const queueName = this.queueFromFile(file);
      const messages = (await this.readState(file)).messages;
      const sortedAsc = [...messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      stats.push({
        queue: queueName,
        backend: this.backend,
        queued: messages.filter((m) => m.deliveryState === "queued").length,
        leased: messages.filter((m) => m.deliveryState === "leased").length,
        delivered: messages.filter((m) => m.deliveryState === "delivered").length,
        acked: messages.filter((m) => m.deliveryState === "acked").length,
        failed: messages.filter((m) => m.deliveryState === "failed").length,
        deadLettered: messages.filter((m) => m.deliveryState === "dead-lettered").length,
        expired: messages.filter((m) => m.deliveryState === "expired").length,
        oldestMessageAt: sortedAsc.length ? sortedAsc[0].createdAt : null,
        newestMessageAt: sortedAsc.length ? sortedAsc[sortedAsc.length - 1].createdAt : null,
      });
    }
    return stats;
  }

  async compact(queue?: QueueName): Promise<void> {
    await this.init();
    const files = queue ? [this.fileForQueue(queue)] : await this.listStateFiles();
    for (const file of files) {
      const state = await this.readState(file);
      const deduped = new Map<string, AgentQueueEnvelope>();
      for (const message of state.messages) deduped.set(message.id, message);
      state.messages = [...deduped.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      await this.writeState(file, state);
    }
  }

  private fileForQueue(queue: QueueName): string {
    return path.join(this.directory, `${this.namespace}-${queue}.json`);
  }

  private queueFromFile(file: string): QueueName {
    return path.basename(file, ".json").replace(`${this.namespace}-`, "");
  }

  private async ensureIndex(): Promise<void> {
    try {
      await fs.access(path.join(this.directory, this.indexFile));
    } catch {
      await this.writeIndex({ entries: [] });
    }
  }

  private async listStateFiles(): Promise<string[]> {
    const entries = await fs.readdir(this.directory);
    return entries
      .filter((name) => name.endsWith(".json") && name !== this.indexFile && name.startsWith(this.namespace))
      .map((name) => path.join(this.directory, name));
  }

  private async readState(file: string): Promise<QueueStateFile> {
    try {
      const parsed = JSON.parse(await fs.readFile(file, "utf8")) as QueueStateFile;
      return { version: parsed.version ?? 1, messages: Array.isArray(parsed.messages) ? parsed.messages : [] };
    } catch {
      return { version: 1, messages: [] };
    }
  }

  private async writeState(file: string, state: QueueStateFile): Promise<void> {
    await fs.writeFile(file, JSON.stringify(state, null, 2), "utf8");
  }

  private async readIndex(): Promise<{ entries: StoredQueueIndexEntry[] }> {
    try {
      return JSON.parse(await fs.readFile(path.join(this.directory, this.indexFile), "utf8")) as { entries: StoredQueueIndexEntry[] };
    } catch {
      return { entries: [] };
    }
  }

  private async writeIndex(index: { entries: StoredQueueIndexEntry[] }): Promise<void> {
    await fs.writeFile(path.join(this.directory, this.indexFile), JSON.stringify(index, null, 2), "utf8");
  }

  private async upsertIndex(id: string, queue: QueueName, file: string): Promise<void> {
    const index = await this.readIndex();
    const existing = index.entries.findIndex((entry) => entry.id === id);
    if (existing >= 0) index.entries[existing] = { id, queue, file };
    else index.entries.push({ id, queue, file });
    await this.writeIndex(index);
  }

  private async removeIndex(id: string): Promise<void> {
    const index = await this.readIndex();
    index.entries = index.entries.filter((entry) => entry.id !== id);
    await this.writeIndex(index);
  }
}

interface ZeroGQueueStoreOptions {
  storage: ZeroGStorageQueueClient;
  namespace?: string;
  backend?: QueueBackend;
  logger?: QueueLogger;
}

export class ZeroGQueueStore implements QueueStore {
  private readonly storage: ZeroGStorageQueueClient;
  private readonly namespace: string;
  private readonly backend: QueueBackend;
  private readonly logger?: QueueLogger;

  constructor(options: ZeroGQueueStoreOptions) {
    this.storage = options.storage;
    this.namespace = options.namespace ?? "claw-machine-a2a";
    this.backend = options.backend ?? "0g-storage";
    this.logger = options.logger;
  }

  async init(): Promise<void> {}

  async enqueue<TPayload>(message: AgentQueueEnvelope<TPayload>): Promise<void> {
    const key = queueKeyForMessage(message as AgentQueueEnvelope);
    const result = await this.storage.put({
      namespace: this.queueNamespace(message.queue),
      key,
      value: JSON.stringify(message),
      metadata: {
        queue: message.queue,
        sender: message.sender,
        recipient: messageAddressList(message.recipient),
        type: message.type,
        deliveryState: message.deliveryState,
        attemptCount: message.attemptCount,
      },
    });
    if (!result.ok) throw new Error(`0G Storage queue write failed for ${message.id}`);
    this.logger?.debug("A2A 0G enqueue", { id: message.id, namespace: this.queueNamespace(message.queue) });
  }

  async update<TPayload>(message: AgentQueueEnvelope<TPayload>): Promise<void> {
    await this.enqueue(message);
  }

  async getById<TPayload = unknown>(id: string): Promise<AgentQueueEnvelope<TPayload> | null> {
    const all = await this.query<TPayload>({});
    return all.find((m) => m.id === id) ?? null;
  }

  async query<TPayload = unknown>(query: QueueQuery): Promise<AgentQueueEnvelope<TPayload>[]> {
    const namespaces = query.queue
      ? [this.queueNamespace(query.queue)]
      : [this.queueNamespace("inbox"), this.queueNamespace("outbox"), this.queueNamespace("shared")];
    const results: AgentQueueEnvelope<TPayload>[] = [];
    for (const namespace of namespaces) {
      const keys = await this.storage.list({ namespace, prefix: "queue:", limit: 1000 });
      if (!keys.ok) continue;
      for (const key of keys.keys) {
        const record = await this.storage.get({ namespace, key });
        if (!record.ok || !record.value) continue;
        const message = JSON.parse(record.value) as AgentQueueEnvelope<TPayload>;
        if (matchesQuery(message, query)) results.push(message);
      }
    }
    results.sort((a, b) => {
      const priorityDelta = comparePriority(a.priority, b.priority);
      if (priorityDelta !== 0) return priorityDelta;
      return Date.parse(a.createdAt) - Date.parse(b.createdAt);
    });
    return typeof query.limit === "number" ? results.slice(0, query.limit) : results;
  }

  async delete(id: string): Promise<boolean> {
    const msg = await this.getById(id);
    if (!msg) return false;
    if (!this.storage.delete) return false;
    const response = await this.storage.delete({
      namespace: this.queueNamespace(msg.queue),
      key: queueKeyForMessage(msg as AgentQueueEnvelope),
    });
    return response.ok;
  }

  async stats(queue?: QueueName): Promise<QueueStats[]> {
    const messages = await this.query({ queue });
    const queues = uniqueValues(messages.map((m) => m.queue));
    return queues.map((q) => {
      const rows = messages.filter((m) => m.queue === q);
      const sortedAsc = [...rows].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      return {
        queue: q,
        backend: this.backend,
        queued: rows.filter((m) => m.deliveryState === "queued").length,
        leased: rows.filter((m) => m.deliveryState === "leased").length,
        delivered: rows.filter((m) => m.deliveryState === "delivered").length,
        acked: rows.filter((m) => m.deliveryState === "acked").length,
        failed: rows.filter((m) => m.deliveryState === "failed").length,
        deadLettered: rows.filter((m) => m.deliveryState === "dead-lettered").length,
        expired: rows.filter((m) => m.deliveryState === "expired").length,
        oldestMessageAt: sortedAsc.length ? sortedAsc[0].createdAt : null,
        newestMessageAt: sortedAsc.length ? sortedAsc[sortedAsc.length - 1].createdAt : null,
      };
    });
  }

  async compact(): Promise<void> {}

  private queueNamespace(queue: QueueName): string {
    return `${this.namespace}:${queue}`;
  }
}

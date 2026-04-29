import type {
  AgentBusAckInput,
  AgentBusEnvelope,
  AgentBusListOptions,
  AgentBusNackInput,
  AgentBusPriority,
  AgentBusReceiveOptions,
  AgentBusSendInput,
  AgentBusSnapshot,
  AgentBusStats,
  AgentBusTopic,
  MultimodalStorageClient,
} from "./types.js";
import { normalizeTags, now, sha256, uuid } from "./utils.js";

export interface AgentBusOptions {
  prefix?: string;
  leaseMs?: number;
  defaultMaxAttempts?: number;
  deadLetterAfterAttempts?: number;
  dedupeTtlMs?: number;
  storageTtlMs?: number;
}

export interface AgentBusEvent {
  type: "send" | "receive" | "ack" | "nack" | "lease" | "dead_letter" | "sync" | "dedupe";
  messageId: string;
  topic?: AgentBusTopic;
  agent?: string;
  createdAt: number;
  data?: Record<string, unknown>;
}

export class AgentBus {
  private readonly storage: MultimodalStorageClient;
  private readonly opts: Required<AgentBusOptions>;
  private readonly queue = new Map<string, AgentBusEnvelope>();
  private readonly dedupe = new Map<string, number>();
  private readonly events: AgentBusEvent[] = [];
  private statsState: AgentBusStats = {
    topics: 0,
    messages: 0,
    queued: 0,
    leased: 0,
    acked: 0,
    nacked: 0,
    deadLettered: 0,
    expired: 0,
    deduped: 0,
    byTopic: {},
    lastUpdatedAt: undefined,
  };

  constructor(deps: { storage: MultimodalStorageClient; options?: AgentBusOptions }) {
    this.storage = deps.storage;
    this.opts = {
      prefix: deps.options?.prefix ?? "agentbus",
      leaseMs: deps.options?.leaseMs ?? 30_000,
      defaultMaxAttempts: deps.options?.defaultMaxAttempts ?? 5,
      deadLetterAfterAttempts: deps.options?.deadLetterAfterAttempts ?? 5,
      dedupeTtlMs: deps.options?.dedupeTtlMs ?? 1000 * 60 * 10,
      storageTtlMs: deps.options?.storageTtlMs ?? 1000 * 60 * 60 * 24 * 30,
    };
  }

  async init(): Promise<void> {
    await this.syncFromStorage();
    this.recomputeStats();
  }

  async send<T = unknown>(input: AgentBusSendInput<T>): Promise<AgentBusEnvelope<T>> {
    const messageId = uuid("msg");
    const createdAt = now();
    const availableAt = input.availableAt ?? createdAt;
    const expiresAt = input.expiresAt ?? createdAt + this.opts.storageTtlMs;
    const dedupeKey = input.dedupeKey || this.computeDedupeKey(input);

    if (this.isDuplicate(dedupeKey)) {
      const existing = this.findByDedupeKey(dedupeKey);
      this.statsState.deduped++;
      this.logEvent("dedupe", existing?.id || messageId, { dedupeKey });
      return (existing || this.queue.get(messageId)) as AgentBusEnvelope<T>;
    }

    this.dedupe.set(dedupeKey, createdAt + this.opts.dedupeTtlMs);
    const envelope: AgentBusEnvelope<T> = {
      id: messageId,
      topic: input.topic,
      fromAgent: input.fromAgent,
      toAgent: input.toAgent,
      sessionId: input.sessionId,
      requestId: input.requestId,
      walletAddress: input.walletAddress,
      priority: input.priority ?? "normal",
      deliveryMode: input.deliveryMode ?? "at_least_once",
      status: "queued",
      createdAt,
      updatedAt: createdAt,
      availableAt,
      expiresAt,
      attempts: 0,
      maxAttempts: input.maxAttempts ?? this.opts.defaultMaxAttempts,
      correlationId: input.correlationId,
      replyTo: input.replyTo,
      dedupeKey,
      tags: normalizeTags(input.tags || []),
      payload: input.payload,
      metadata: input.metadata || {},
    };

    this.queue.set(envelope.id, envelope);
    await this.persistEnvelope(envelope);
    this.recomputeStats();
    this.logEvent("send", envelope.id, {
      topic: envelope.topic,
      fromAgent: envelope.fromAgent,
      toAgent: envelope.toAgent,
      priority: envelope.priority,
    });
    return envelope;
  }

  async receive(options: AgentBusReceiveOptions = {}): Promise<AgentBusEnvelope[]> {
    const limit = options.limit ?? 10;
    const leaseMs = options.leaseMs ?? this.opts.leaseMs;
    const nowTs = now();
    const eligible = this.filterEnvelopes({
      topic: options.topic,
      agent: options.agent,
      sessionId: options.sessionId,
      tags: options.tags,
      status: "queued",
      limit: 10_000,
      offset: 0,
    })
      .filter((msg) => msg.availableAt <= nowTs)
      .sort((a, b) => this.priorityWeight(b.priority) - this.priorityWeight(a.priority) || a.createdAt - b.createdAt)
      .slice(0, limit);

    const leased: AgentBusEnvelope[] = [];
    for (const msg of eligible) {
      const next: AgentBusEnvelope = {
        ...msg,
        status: "leased",
        attempts: msg.attempts + 1,
        leaseUntil: nowTs + leaseMs,
        updatedAt: nowTs,
      };
      this.queue.set(next.id, next);
      await this.persistEnvelope(next);
      leased.push(next);
      this.logEvent("lease", next.id, { topic: next.topic, leaseUntil: next.leaseUntil, attempts: next.attempts });
    }

    this.recomputeStats();
    this.logEvent("receive", "batch", { count: leased.length });
    return leased;
  }

  async ack(input: AgentBusAckInput): Promise<boolean> {
    const msg = this.queue.get(input.id);
    if (!msg) return false;
    const next: AgentBusEnvelope = { ...msg, status: "acked", updatedAt: now(), leaseUntil: undefined };
    this.queue.set(next.id, next);
    await this.persistEnvelope(next);
    this.recomputeStats();
    this.logEvent("ack", next.id, { topic: input.topic || next.topic, agent: input.agent, metadata: input.metadata || {} });
    return true;
  }

  async nack(input: AgentBusNackInput): Promise<boolean> {
    const msg = this.queue.get(input.id);
    if (!msg) return false;

    const nextAttempts = msg.attempts + 1;
    const retryDelayMs = input.retryDelayMs ?? 5000;
    const overLimit = nextAttempts >= (msg.maxAttempts || this.opts.deadLetterAfterAttempts);
    const t = now();

    const next: AgentBusEnvelope = {
      ...msg,
      attempts: nextAttempts,
      updatedAt: t,
      leaseUntil: undefined,
      status: overLimit ? "dead_lettered" : "nacked",
      availableAt: overLimit ? t : t + retryDelayMs,
      metadata: { ...(msg.metadata || {}), lastNackReason: input.reason || "nack", ...(input.metadata || {}) },
    };

    this.queue.set(next.id, next);
    await this.persistEnvelope(next);
    this.recomputeStats();
    this.logEvent(overLimit ? "dead_letter" : "nack", next.id, {
      topic: input.topic || next.topic,
      agent: input.agent,
      reason: input.reason || "nack",
      retryDelayMs,
      attempts: nextAttempts,
      deadLettered: overLimit,
    });
    return true;
  }

  async list(options: AgentBusListOptions = {}): Promise<AgentBusEnvelope[]> {
    return this.filterEnvelopes(options).sort((a, b) => b.createdAt - a.createdAt);
  }

  stats(): AgentBusStats {
    this.recomputeStats();
    return { ...this.statsState, byTopic: { ...this.statsState.byTopic } };
  }

  async syncFromStorage(): Promise<number> {
    const items = await this.storage.list(`${this.opts.prefix}/messages/`);
    let loaded = 0;
    for (const item of items) {
      const msg = await this.storage.get<AgentBusEnvelope>(item.key);
      if (!msg) continue;
      this.queue.set(msg.id, msg);
      loaded++;
    }
    this.recomputeStats();
    this.logEvent("sync", "sync", { loaded });
    return loaded;
  }

  async snapshot(): Promise<AgentBusSnapshot> {
    return {
      version: "agentbus.v1",
      createdAt: now(),
      updatedAt: now(),
      messages: [...this.queue.values()].sort((a, b) => a.createdAt - b.createdAt),
      stats: this.stats(),
    };
  }

  private filterEnvelopes(options: AgentBusListOptions): AgentBusEnvelope[] {
    const rows = [...this.queue.values()];
    const filtered = rows.filter((msg) => {
      if (options.topic && msg.topic !== options.topic) return false;
      if (options.agent && msg.toAgent !== options.agent && msg.fromAgent !== options.agent) return false;
      if (options.sessionId && msg.sessionId !== options.sessionId) return false;
      if (options.status && msg.status !== options.status) return false;
      if (options.tags?.length && !options.tags.every((tag) => msg.tags.includes(tag.toLowerCase()))) return false;
      return true;
    });
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 100;
    return filtered.sort((a, b) => b.createdAt - a.createdAt).slice(offset, offset + limit);
  }

  private priorityWeight(priority: AgentBusPriority): number {
    switch (priority) {
      case "critical":
        return 4;
      case "high":
        return 3;
      case "normal":
        return 2;
      default:
        return 1;
    }
  }

  private messageKey(id: string): string {
    return `${this.opts.prefix}/messages/${id}.json`;
  }

  private async persistEnvelope(msg: AgentBusEnvelope): Promise<void> {
    await this.storage.put(this.messageKey(msg.id), msg, {
      contentType: "application/json",
      compress: true,
      encrypt: false,
      ttlMs: msg.expiresAt ? Math.max(0, msg.expiresAt - now()) : this.opts.storageTtlMs,
      metadata: {
        kind: "agent_bus_message",
        topic: msg.topic,
        fromAgent: msg.fromAgent,
        toAgent: msg.toAgent || "",
        status: msg.status,
        sessionId: msg.sessionId,
        priority: msg.priority,
      },
    });
  }

  private recomputeStats(): void {
    const messages = [...this.queue.values()];
    const byTopic: Record<string, number> = {};
    let queued = 0;
    let leased = 0;
    let acked = 0;
    let nacked = 0;
    let deadLettered = 0;
    let expired = 0;
    for (const msg of messages) {
      byTopic[msg.topic] = (byTopic[msg.topic] || 0) + 1;
      if (msg.status === "queued") queued++;
      else if (msg.status === "leased") leased++;
      else if (msg.status === "acked") acked++;
      else if (msg.status === "nacked") nacked++;
      else if (msg.status === "dead_lettered") deadLettered++;
      else if (msg.status === "expired") expired++;
    }
    this.statsState = {
      topics: Object.keys(byTopic).length,
      messages: messages.length,
      queued,
      leased,
      acked,
      nacked,
      deadLettered,
      expired,
      deduped: this.statsState.deduped,
      byTopic,
      lastUpdatedAt: now(),
    };
  }

  private computeDedupeKey<T>(input: AgentBusSendInput<T>): string {
    return sha256(
      JSON.stringify({
        topic: input.topic,
        fromAgent: input.fromAgent,
        toAgent: input.toAgent || "",
        sessionId: input.sessionId,
        requestId: input.requestId || "",
        payload: input.payload,
        tags: normalizeTags(input.tags || []),
        correlationId: input.correlationId || "",
      }),
    );
  }

  private isDuplicate(dedupeKey: string): boolean {
    const t = now();
    const expiresAt = this.dedupe.get(dedupeKey);
    if (!expiresAt) return false;
    if (expiresAt <= t) {
      this.dedupe.delete(dedupeKey);
      return false;
    }
    return true;
  }

  private findByDedupeKey(dedupeKey: string): AgentBusEnvelope | undefined {
    for (const msg of this.queue.values()) {
      if (msg.dedupeKey === dedupeKey) return msg;
    }
    return undefined;
  }

  private logEvent(type: AgentBusEvent["type"], messageId: string, data?: Record<string, unknown>): void {
    this.events.push({ type, messageId, createdAt: now(), data });
    if (this.events.length > 1000) this.events.splice(0, this.events.length - 1000);
  }
}

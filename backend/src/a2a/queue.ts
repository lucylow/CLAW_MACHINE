import crypto from "node:crypto";
import type {
  AgentAddress,
  AgentMessageMetadata,
  AgentQueueEnvelope,
  AgentRegistryRecord,
  MessagePriority,
  QueueAckResult,
  QueueEventBus,
  QueueLeaseOptions,
  QueueLogger,
  QueueNackResult,
  QueuePollResult,
  QueueQuery,
  QueueSendOptions,
  QueueStats,
  QueueStore,
} from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

function nowMs(): number {
  return Date.now();
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

function checksumOf(value: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeTags(tags?: string[]): string[] {
  return [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean))];
}

function retryDelayMs(attemptCount: number): number {
  const base = 1000;
  const exponential = Math.min(60_000, base * Math.pow(2, Math.max(0, attemptCount - 1)));
  const jitter = Math.floor(Math.random() * 250);
  return exponential + jitter;
}

function messageAddressList(recipient: AgentAddress | AgentAddress[]): AgentAddress[] {
  return Array.isArray(recipient) ? recipient : [recipient];
}

function defaultMetadata(input?: Partial<AgentMessageMetadata>): AgentMessageMetadata {
  return {
    sessionId: input?.sessionId,
    turnId: input?.turnId,
    taskId: input?.taskId,
    traceId: input?.traceId,
    requestId: input?.requestId,
    sourceVersion: input?.sourceVersion,
    sourceModel: input?.sourceModel,
    schemaVersion: input?.schemaVersion ?? 1,
    ttlMs: input?.ttlMs,
    priorityHint: input?.priorityHint ?? 0,
    parentMessageId: input?.parentMessageId,
    threadId: input?.threadId,
    urgencyReason: input?.urgencyReason,
    isBroadcast: input?.isBroadcast ?? false,
    deliveredTo: input?.deliveredTo ?? [],
    failedAt: input?.failedAt ?? null,
    errorCode: input?.errorCode ?? null,
    errorMessage: input?.errorMessage ?? null,
    leaseOwner: input?.leaseOwner ?? null,
    leaseNonce: input?.leaseNonce ?? null,
    path: input?.path ?? [],
    notes: input?.notes ?? [],
  };
}

export interface CreateMessageInput<TPayload> {
  queue: string;
  direction: "inbox" | "outbox" | "shared";
  sender: AgentAddress;
  recipient: AgentAddress | AgentAddress[];
  type: import("./types").MessageType;
  payload: TPayload;
  options?: QueueSendOptions;
}

export class AgentQueueMessageFactory {
  static create<TPayload>(input: CreateMessageInput<TPayload>): AgentQueueEnvelope<TPayload> {
    const createdAt = nowIso();
    const availableAt = input.options?.availableAt
      ? input.options.availableAt instanceof Date
        ? input.options.availableAt.toISOString()
        : new Date(input.options.availableAt).toISOString()
      : createdAt;
    const message: AgentQueueEnvelope<TPayload> = {
      id: createId("msg"),
      queue: input.queue,
      direction: input.direction,
      sender: input.sender,
      recipient: input.recipient,
      type: input.type,
      priority: input.options?.priority ?? "normal",
      dedupeKey: input.options?.dedupeKey,
      correlationId: input.options?.correlationId,
      replyTo: input.options?.replyTo,
      conversationId: input.options?.conversationId,
      createdAt,
      updatedAt: createdAt,
      availableAt,
      leaseUntil: null,
      deliveryState: "queued",
      attemptCount: 0,
      maxAttempts: input.options?.maxAttempts ?? 5,
      payload: input.payload,
      metadata: defaultMetadata({
        sessionId: input.options?.sessionId,
        turnId: input.options?.turnId,
        taskId: input.options?.taskId,
        requestId: input.options?.requestId,
        traceId: input.options?.traceId,
        sourceVersion: input.options?.sourceVersion,
        sourceModel: input.options?.sourceModel,
        schemaVersion: input.options?.schemaVersion ?? 1,
        ttlMs: input.options?.ttlMs,
        parentMessageId: input.options?.parentMessageId,
        threadId: input.options?.threadId,
        urgencyReason: input.options?.urgencyReason,
        notes: input.options?.notes,
        isBroadcast: Array.isArray(input.recipient),
      }),
      tags: normalizeTags(input.options?.tags),
      routingKey: input.options?.routingKey,
      checksum: "",
    };
    message.checksum = checksumOf({
      queue: message.queue,
      direction: message.direction,
      sender: message.sender,
      recipient: message.recipient,
      type: message.type,
      priority: message.priority,
      dedupeKey: message.dedupeKey,
      correlationId: message.correlationId,
      replyTo: message.replyTo,
      conversationId: message.conversationId,
      createdAt: message.createdAt,
      availableAt: message.availableAt,
      payload: message.payload,
      metadata: message.metadata,
      tags: message.tags,
      routingKey: message.routingKey,
    });
    return message;
  }
}

export interface AgentRegistryOptions {
  logger?: QueueLogger;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

export class AgentRegistry {
  private readonly agents = new Map<AgentAddress, AgentRegistryRecord>();
  private readonly logger?: QueueLogger;

  constructor(options?: AgentRegistryOptions) {
    this.logger = options?.logger;
  }

  register(agent: AgentRegistryRecord): void {
    this.agents.set(agent.address, { ...agent, lastSeenAt: agent.lastSeenAt ?? nowIso(), status: agent.status ?? "idle" });
    this.logger?.info("Agent registered", { address: agent.address, name: agent.name });
  }

  update(address: AgentAddress, patch: Partial<AgentRegistryRecord>): AgentRegistryRecord | null {
    const current = this.agents.get(address);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      tags: normalizeTags([...(current.tags ?? []), ...(patch.tags ?? [])]),
      capabilities: uniqueValues([...(current.capabilities ?? []), ...(patch.capabilities ?? [])]),
      lastSeenAt: nowIso(),
    };
    this.agents.set(address, next);
    return next;
  }

  get(address: AgentAddress): AgentRegistryRecord | null {
    return this.agents.get(address) ?? null;
  }

  list(): AgentRegistryRecord[] {
    return [...this.agents.values()];
  }

  findByCapability(capability: string): AgentRegistryRecord[] {
    return this.list().filter((agent) => agent.capabilities.includes(capability));
  }

  findOnline(capability?: string): AgentRegistryRecord[] {
    return this.list().filter((agent) => agent.online && (!capability || agent.capabilities.includes(capability)));
  }

  markHeartbeat(address: AgentAddress): void {
    const current = this.agents.get(address);
    if (!current) return;
    current.lastSeenAt = nowIso();
    current.online = true;
    current.status = "idle";
    this.agents.set(address, current);
  }

  markOffline(address: AgentAddress): void {
    const current = this.agents.get(address);
    if (!current) return;
    current.online = false;
    current.status = "offline";
    current.lastSeenAt = nowIso();
    this.agents.set(address, current);
  }

  resolveQueue(address: AgentAddress): { inboxQueue: string; outboxQueue: string; sharedQueues: string[] } | null {
    const agent = this.get(address);
    if (!agent) return null;
    return {
      inboxQueue: agent.inboxQueue,
      outboxQueue: agent.outboxQueue,
      sharedQueues: agent.sharedQueues ?? [],
    };
  }
}

export interface QueueServiceOptions {
  store: QueueStore;
  registry: AgentRegistry;
  logger?: QueueLogger;
  events?: QueueEventBus;
  defaultLeaseMs?: number;
  defaultMaxAttempts?: number;
}

export class AgentQueueService {
  private readonly store: QueueStore;
  private readonly registry: AgentRegistry;
  private readonly logger?: QueueLogger;
  private readonly events?: QueueEventBus;
  private readonly defaultLeaseMs: number;
  private readonly defaultMaxAttempts: number;

  constructor(options: QueueServiceOptions) {
    this.store = options.store;
    this.registry = options.registry;
    this.logger = options.logger;
    this.events = options.events;
    this.defaultLeaseMs = options.defaultLeaseMs ?? 60_000;
    this.defaultMaxAttempts = options.defaultMaxAttempts ?? 5;
  }

  async init(): Promise<void> {
    await this.store.init();
  }

  async send<TPayload>(input: CreateMessageInput<TPayload>): Promise<AgentQueueEnvelope<TPayload>> {
    await this.init();
    if (input.options?.dedupeKey) {
      const existing = await this.store.query<TPayload>({
        queue: input.queue,
        dedupeKey: input.options.dedupeKey,
        limit: 1,
      });
      if (existing[0] && existing[0].deliveryState !== "dead-lettered" && existing[0].deliveryState !== "expired") {
        this.logger?.debug("A2A message deduplicated", {
          dedupeKey: input.options.dedupeKey,
          queue: input.queue,
          existingId: existing[0].id,
        });
        return existing[0];
      }
    }

    const message = AgentQueueMessageFactory.create(input);
    message.maxAttempts = input.options?.maxAttempts ?? this.defaultMaxAttempts;
    await this.store.enqueue(message);
    this.emit("a2a.message.enqueued", { messageId: message.id, queue: message.queue, type: message.type });
    return message;
  }

  async broadcast<TPayload>(input: Omit<CreateMessageInput<TPayload>, "recipient"> & { recipients?: AgentAddress[] }): Promise<AgentQueueEnvelope<TPayload>[]> {
    const recipients = input.recipients ?? this.registry.list().map((agent) => agent.address);
    const out: AgentQueueEnvelope<TPayload>[] = [];
    for (const recipient of recipients) {
      out.push(
        await this.send({
          ...input,
          recipient,
          options: { ...(input.options ?? {}), tags: normalizeTags([...(input.options?.tags ?? []), "broadcast"]) },
        }),
      );
    }
    return out;
  }

  async poll<TPayload = unknown>(query: QueueQuery): Promise<QueuePollResult<TPayload>> {
    return { items: await this.store.query<TPayload>(query), nextCursor: null };
  }

  async stats(queue?: string): Promise<QueueStats[]> {
    return this.store.stats(queue);
  }

  async lease<TPayload = unknown>(query: QueueQuery, options?: QueueLeaseOptions): Promise<AgentQueueEnvelope<TPayload> | null> {
    const leaseMs = options?.leaseMs ?? this.defaultLeaseMs;
    const maxAttempts = options?.maxAttempts ?? this.defaultMaxAttempts;
    const ownerId = options?.ownerId ?? "processor";
    const message = (await this.store.query<TPayload>({ ...query, availableOnly: true, deliveryState: "queued", limit: 1 }))[0];
    if (!message) return null;
    if (message.attemptCount >= maxAttempts) {
      await this.deadLetter(message, "max attempts exceeded");
      return null;
    }
    message.deliveryState = "leased";
    message.attemptCount += 1;
    message.leaseUntil = new Date(nowMs() + leaseMs).toISOString();
    message.metadata.leaseOwner = ownerId;
    message.metadata.leaseNonce = createId("lease");
    message.updatedAt = nowIso();
    await this.store.update(message);
    return message;
  }

  async ack(messageId: string): Promise<QueueAckResult> {
    const message = await this.store.getById(messageId);
    if (!message) return { ok: false, id: messageId, state: "failed", updatedAt: nowIso() };
    message.deliveryState = "acked";
    message.leaseUntil = null;
    message.updatedAt = nowIso();
    message.metadata.failedAt = null;
    message.metadata.errorCode = null;
    message.metadata.errorMessage = null;
    await this.store.update(message);
    return { ok: true, id: message.id, state: message.deliveryState, updatedAt: message.updatedAt };
  }

  async nack(messageId: string, reason: string, retry = true): Promise<QueueNackResult> {
    const message = await this.store.getById(messageId);
    if (!message) return { ok: false, id: messageId, retryScheduled: false, state: "failed", updatedAt: nowIso() };
    message.updatedAt = nowIso();
    message.metadata.failedAt = message.updatedAt;
    message.metadata.errorMessage = reason;
    message.metadata.errorCode = "A2A_NACK";
    message.leaseUntil = null;
    if (retry && message.attemptCount < message.maxAttempts) {
      message.deliveryState = "queued";
      message.availableAt = new Date(nowMs() + retryDelayMs(message.attemptCount)).toISOString();
      await this.store.update(message);
      return { ok: true, id: message.id, retryScheduled: true, state: message.deliveryState, updatedAt: message.updatedAt };
    }
    await this.deadLetter(message, reason);
    return { ok: true, id: message.id, retryScheduled: false, state: message.deliveryState, updatedAt: message.updatedAt };
  }

  async reply<TPayload>(message: AgentQueueEnvelope, payload: TPayload, options?: QueueSendOptions): Promise<AgentQueueEnvelope<TPayload>> {
    const replyTo = options?.replyTo ?? message.replyTo ?? message.queue;
    const sender = Array.isArray(message.recipient) ? message.recipient[0] : message.recipient;
    return this.send<TPayload>({
      queue: replyTo,
      direction: "outbox",
      sender,
      recipient: message.sender,
      type: "task.response",
      payload,
      options: {
        ...options,
        correlationId: options?.correlationId ?? message.correlationId ?? message.id,
        conversationId: options?.conversationId ?? message.conversationId,
        parentMessageId: message.id,
        sessionId: message.metadata.sessionId,
        turnId: message.metadata.turnId,
        taskId: message.metadata.taskId,
      },
    });
  }

  async progress<TPayload>(message: AgentQueueEnvelope, payload: TPayload, tags?: string[]): Promise<AgentQueueEnvelope<TPayload>> {
    const sender = Array.isArray(message.recipient) ? message.recipient[0] : message.recipient;
    return this.send<TPayload>({
      queue: message.queue,
      direction: "shared",
      sender,
      recipient: message.sender,
      type: "task.progress",
      payload,
      options: {
        replyTo: message.queue,
        correlationId: message.correlationId ?? message.id,
        conversationId: message.conversationId,
        parentMessageId: message.id,
        sessionId: message.metadata.sessionId,
        turnId: message.metadata.turnId,
        taskId: message.metadata.taskId,
        tags: normalizeTags([...(tags ?? []), "progress"]),
      },
    });
  }

  async route<TPayload>(input: {
    sender: AgentAddress;
    recipient: AgentAddress | AgentAddress[];
    type: import("./types").MessageType;
    payload: TPayload;
    options?: QueueSendOptions;
  }): Promise<AgentQueueEnvelope<TPayload>[]> {
    const recipients = messageAddressList(input.recipient);
    const sent: AgentQueueEnvelope<TPayload>[] = [];
    for (const recipient of recipients) {
      const identity = this.registry.get(recipient);
      const queue = identity?.inboxQueue ?? input.options?.queue ?? "shared";
      sent.push(
        await this.send({
          queue,
          direction: input.options?.direction ?? "shared",
          sender: input.sender,
          recipient,
          type: input.type,
          payload: input.payload,
          options: { ...input.options, queue, tags: normalizeTags([...(input.options?.tags ?? []), "routed"]) },
        }),
      );
    }
    return sent;
  }

  async fanout<TPayload>(input: {
    sender: AgentAddress;
    recipients: AgentAddress[];
    type: import("./types").MessageType;
    payload: TPayload;
    options?: QueueSendOptions;
  }): Promise<AgentQueueEnvelope<TPayload>[]> {
    return this.broadcast({
      sender: input.sender,
      recipients: input.recipients,
      queue: input.options?.queue ?? "shared",
      direction: input.options?.direction ?? "shared",
      type: input.type,
      payload: input.payload,
      options: {
        ...input.options,
        tags: normalizeTags([...(input.options?.tags ?? []), "fanout"]),
      },
    });
  }

  async deadLetter<TPayload>(message: AgentQueueEnvelope<TPayload>, reason: string): Promise<AgentQueueEnvelope<TPayload>> {
    message.deliveryState = "dead-lettered";
    message.updatedAt = nowIso();
    message.metadata.failedAt = message.updatedAt;
    message.metadata.errorMessage = reason;
    message.metadata.errorCode = "A2A_DEAD_LETTER";
    message.leaseUntil = null;
    await this.store.update(message);
    return message;
  }

  private emit(eventName: string, payload: Record<string, unknown>): void {
    try {
      this.events?.emit(eventName, payload);
    } catch (error) {
      this.logger?.warn("Queue event emission failed", { eventName, error: safeString(error) });
    }
  }
}

export function buildA2ASessionTopic(sessionId: string, conversationId?: string): string {
  return [sessionId, conversationId].filter(Boolean).join(":");
}

export function summarizeMessage(message: AgentQueueEnvelope): string {
  return normalizeTags([
    `${message.type}`,
    `${message.queue}`,
    `from:${message.sender}`,
    `to:${messageAddressList(message.recipient).join(",")}`,
    message.conversationId ? `conversation:${message.conversationId}` : "",
    message.correlationId ? `correlation:${message.correlationId}` : "",
  ]).join(" | ");
}

export function isBroadcastMessage(message: AgentQueueEnvelope): boolean {
  return Array.isArray(message.recipient) || message.metadata.isBroadcast === true;
}

export function shouldRetryMessage(message: AgentQueueEnvelope, maxRetries: number): boolean {
  return message.attemptCount < Math.min(message.maxAttempts, maxRetries);
}

export function markDelivered<TPayload>(message: AgentQueueEnvelope<TPayload>, deliveredTo: AgentAddress): AgentQueueEnvelope<TPayload> {
  message.deliveryState = "delivered";
  message.updatedAt = nowIso();
  message.metadata.deliveredTo = normalizeTags([...(message.metadata.deliveredTo ?? []), deliveredTo]);
  message.metadata.path = normalizeTags([...(message.metadata.path ?? []), deliveredTo]);
  return message;
}

export function markExpired<TPayload>(message: AgentQueueEnvelope<TPayload>): AgentQueueEnvelope<TPayload> {
  message.deliveryState = "expired";
  message.updatedAt = nowIso();
  return message;
}

export function cloneMessage<TPayload>(message: AgentQueueEnvelope<TPayload>): AgentQueueEnvelope<TPayload> {
  return JSON.parse(JSON.stringify(message)) as AgentQueueEnvelope<TPayload>;
}

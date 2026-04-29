export type AgentAddress = string;
export type QueueName = string;
export type MessageType =
  | "task.request"
  | "task.response"
  | "task.progress"
  | "task.error"
  | "memory.share"
  | "reflection.share"
  | "status.heartbeat"
  | "status.ping"
  | "status.pong"
  | "fanout.request"
  | "fanout.partial"
  | "fanout.complete"
  | "control.pause"
  | "control.resume"
  | "control.shutdown"
  | "approval.request"
  | "approval.response"
  | "artifact.share"
  | "signal.alert";

export type MessagePriority = "low" | "normal" | "high" | "urgent";
export type DeliveryState = "queued" | "leased" | "delivered" | "acked" | "failed" | "dead-lettered" | "expired";
export type QueueDirection = "inbox" | "outbox" | "shared";
export type QueueBackend = "0g-storage" | "file" | "memory";

export interface AgentMessageMetadata {
  sessionId?: string;
  turnId?: string;
  taskId?: string;
  traceId?: string;
  requestId?: string;
  sourceVersion?: string;
  sourceModel?: string;
  schemaVersion: number;
  ttlMs?: number;
  priorityHint?: number;
  parentMessageId?: string;
  threadId?: string;
  urgencyReason?: string;
  isBroadcast?: boolean;
  deliveredTo?: AgentAddress[];
  failedAt?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  leaseOwner?: string | null;
  leaseNonce?: string | null;
  path?: string[];
  notes?: string[];
}

export interface AgentQueueEnvelope<TPayload = unknown> {
  id: string;
  queue: QueueName;
  direction: QueueDirection;
  sender: AgentAddress;
  recipient: AgentAddress | AgentAddress[];
  type: MessageType;
  priority: MessagePriority;
  dedupeKey?: string;
  correlationId?: string;
  replyTo?: string;
  conversationId?: string;
  createdAt: string;
  updatedAt: string;
  availableAt: string;
  leaseUntil?: string | null;
  deliveryState: DeliveryState;
  attemptCount: number;
  maxAttempts: number;
  payload: TPayload;
  metadata: AgentMessageMetadata;
  tags: string[];
  routingKey?: string;
  checksum: string;
}

export interface AgentIdentity {
  address: AgentAddress;
  name: string;
  namespace?: string;
  capabilities: string[];
  version?: string;
  tags: string[];
  online: boolean;
  inboxQueue: QueueName;
  outboxQueue: QueueName;
  sharedQueues?: QueueName[];
}

export interface AgentRegistryRecord extends AgentIdentity {
  lastSeenAt?: string | null;
  status?: "idle" | "busy" | "offline" | "degraded";
  endpoint?: string | null;
  publicKey?: string | null;
  metadata?: Record<string, unknown>;
}

export interface QueueQuery {
  queue?: QueueName;
  recipient?: AgentAddress;
  sender?: AgentAddress;
  type?: MessageType;
  deliveryState?: DeliveryState;
  conversationId?: string;
  correlationId?: string;
  dedupeKey?: string;
  tagsAnyOf?: string[];
  tagsAllOf?: string[];
  availableOnly?: boolean;
  limit?: number;
}

export interface QueueLeaseOptions {
  leaseMs?: number;
  maxAttempts?: number;
  ownerId?: string;
}

export interface QueueSendOptions {
  queue?: QueueName;
  direction?: QueueDirection;
  priority?: MessagePriority;
  dedupeKey?: string;
  correlationId?: string;
  replyTo?: string;
  conversationId?: string;
  availableAt?: string | Date;
  ttlMs?: number;
  maxAttempts?: number;
  tags?: string[];
  routingKey?: string;
  schemaVersion?: number;
  requestId?: string;
  traceId?: string;
  sessionId?: string;
  turnId?: string;
  taskId?: string;
  sourceVersion?: string;
  sourceModel?: string;
  parentMessageId?: string;
  threadId?: string;
  urgencyReason?: string;
  notes?: string[];
}

export interface QueueAckResult {
  ok: boolean;
  id: string;
  state: DeliveryState;
  updatedAt: string;
}

export interface QueueNackResult {
  ok: boolean;
  id: string;
  retryScheduled: boolean;
  state: DeliveryState;
  updatedAt: string;
}

export interface QueuePollResult<TPayload = unknown> {
  items: Array<AgentQueueEnvelope<TPayload>>;
  nextCursor?: string | null;
}

export interface QueueStats {
  queue: QueueName;
  backend: QueueBackend;
  queued: number;
  leased: number;
  delivered: number;
  acked: number;
  failed: number;
  deadLettered: number;
  expired: number;
  oldestMessageAt?: string | null;
  newestMessageAt?: string | null;
}

export interface QueueEventBus {
  emit(eventName: string, payload: Record<string, unknown>): void;
}

export interface QueueLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface ZeroGStorageQueueClient {
  put(input: {
    namespace: string;
    key: string;
    value: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: boolean; key: string; version?: string; checksum?: string }>;

  get(input: {
    namespace: string;
    key: string;
  }): Promise<{ ok: boolean; value?: string | null; version?: string | null; metadata?: Record<string, unknown> | null }>;

  list(input: {
    namespace: string;
    prefix?: string;
    limit?: number;
  }): Promise<{ ok: boolean; keys: string[] }>;

  delete?(input: {
    namespace: string;
    key: string;
  }): Promise<{ ok: boolean }>;
}

export interface QueueStore {
  init(): Promise<void>;
  enqueue<TPayload>(message: AgentQueueEnvelope<TPayload>): Promise<void>;
  update<TPayload>(message: AgentQueueEnvelope<TPayload>): Promise<void>;
  getById<TPayload = unknown>(id: string): Promise<AgentQueueEnvelope<TPayload> | null>;
  query<TPayload = unknown>(query: QueueQuery): Promise<AgentQueueEnvelope<TPayload>[]>;
  delete(id: string): Promise<boolean>;
  stats(queue?: QueueName): Promise<QueueStats[]>;
  compact?(queue?: QueueName): Promise<void>;
}

export interface QueueProcessorOptions {
  leaseMs?: number;
  pollIntervalMs?: number;
  batchSize?: number;
  ownerId?: string;
  maxRetries?: number;
}

export interface A2AHandlerContext {
  message: AgentQueueEnvelope;
  registry: import("./queue").AgentRegistry;
  queue: import("./queue").AgentQueueService;
  reply: <TPayload>(payload: TPayload, options?: QueueSendOptions) => Promise<AgentQueueEnvelope<TPayload>>;
  ack: () => Promise<QueueAckResult>;
  nack: (reason: string, retry?: boolean) => Promise<QueueNackResult>;
  sendProgress: (payload: Record<string, unknown>, tags?: string[]) => Promise<AgentQueueEnvelope<Record<string, unknown>>>;
}

export type A2AHandler = (ctx: A2AHandlerContext) => Promise<void>;

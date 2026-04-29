import type { AgentAddress, AgentQueueEnvelope, MessagePriority, QueueEventBus, QueueLogger } from "./types";
import { AgentQueueService, AgentRegistry, normalizeTags } from "./queue";

export interface A2ARouterOptions {
  service: AgentQueueService;
  registry: AgentRegistry;
  logger?: QueueLogger;
  events?: QueueEventBus;
}

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export class AgentMessageRouter {
  private readonly service: AgentQueueService;
  private readonly registry: AgentRegistry;
  private readonly logger?: QueueLogger;
  private readonly events?: QueueEventBus;

  constructor(options: A2ARouterOptions) {
    this.service = options.service;
    this.registry = options.registry;
    this.logger = options.logger;
    this.events = options.events;
  }

  async sendTask<TPayload>(input: {
    sender: AgentAddress;
    recipient: AgentAddress;
    taskType: string;
    payload: TPayload;
    conversationId?: string;
    correlationId?: string;
    priority?: MessagePriority;
    tags?: string[];
    requestId?: string;
    traceId?: string;
  }): Promise<AgentQueueEnvelope<TPayload>> {
    const target = this.registry.get(input.recipient);
    const queue = target?.inboxQueue ?? `${input.recipient}.inbox`;
    return this.service.send({
      queue,
      direction: "outbox",
      sender: input.sender,
      recipient: input.recipient,
      type: "task.request",
      payload: input.payload,
      options: {
        conversationId: input.conversationId,
        correlationId: input.correlationId,
        priority: input.priority ?? "normal",
        tags: normalizeTags([...(input.tags ?? []), "task", input.taskType]),
        requestId: input.requestId,
        traceId: input.traceId,
        sessionId: input.conversationId,
        schemaVersion: 1,
      },
    });
  }

  async sendBroadcast<TPayload>(input: {
    sender: AgentAddress;
    taskType: string;
    payload: TPayload;
    tags?: string[];
    conversationId?: string;
    correlationId?: string;
  }): Promise<AgentQueueEnvelope<TPayload>[]> {
    const recipients = this.registry.findOnline().map((agent) => agent.address);
    return this.service.broadcast({
      sender: input.sender,
      recipients,
      queue: "shared",
      direction: "shared",
      type: "fanout.request",
      payload: input.payload,
      options: {
        conversationId: input.conversationId,
        correlationId: input.correlationId,
        tags: normalizeTags([...(input.tags ?? []), "broadcast", input.taskType]),
      },
    });
  }

  async requestApproval<TPayload>(input: {
    sender: AgentAddress;
    approver: AgentAddress;
    payload: TPayload;
    reason: string;
    conversationId?: string;
    correlationId?: string;
  }): Promise<AgentQueueEnvelope<TPayload>> {
    return this.service.send({
      queue: this.registry.get(input.approver)?.inboxQueue ?? `${input.approver}.inbox`,
      direction: "shared",
      sender: input.sender,
      recipient: input.approver,
      type: "approval.request",
      payload: input.payload,
      options: {
        conversationId: input.conversationId,
        correlationId: input.correlationId,
        urgencyReason: input.reason,
        tags: ["approval", "review"],
        priority: "high",
      },
    });
  }

  private emit(eventName: string, payload: Record<string, unknown>): void {
    try {
      this.events?.emit(eventName, payload);
    } catch (error) {
      this.logger?.warn("A2A router event failed", { eventName, error: safeString(error) });
    }
  }
}

export interface AgentRunA2AAdapterOptions {
  service: AgentQueueService;
  registry: AgentRegistry;
  localAgentAddress: AgentAddress;
  logger?: QueueLogger;
  events?: QueueEventBus;
}

export class AgentRunA2AAdapter {
  private readonly service: AgentQueueService;
  private readonly registry: AgentRegistry;
  private readonly localAgentAddress: AgentAddress;

  constructor(options: AgentRunA2AAdapterOptions) {
    this.service = options.service;
    this.registry = options.registry;
    this.localAgentAddress = options.localAgentAddress;
  }

  async sendToAgent<TPayload>(input: {
    recipient: AgentAddress;
    payload: TPayload;
    conversationId?: string;
    taskType: string;
    priority?: MessagePriority;
    correlationId?: string;
    tags?: string[];
    requestId?: string;
    traceId?: string;
  }): Promise<AgentQueueEnvelope<TPayload>> {
    const target = this.registry.get(input.recipient);
    const queue = target?.inboxQueue ?? `${input.recipient}.inbox`;
    return this.service.send({
      queue,
      direction: "outbox",
      sender: this.localAgentAddress,
      recipient: input.recipient,
      type: "task.request",
      payload: input.payload,
      options: {
        conversationId: input.conversationId,
        correlationId: input.correlationId,
        priority: input.priority ?? "normal",
        tags: normalizeTags([...(input.tags ?? []), "agent-run", input.taskType]),
        requestId: input.requestId,
        traceId: input.traceId,
        sessionId: input.conversationId,
        taskId: input.correlationId,
      },
    });
  }
}

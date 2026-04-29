import type { AgentAddress, AgentQueueEnvelope, A2AHandler, A2AHandlerContext, QueueEventBus, QueueLogger, QueueProcessorOptions, QueueQuery, QueueSendOptions } from "./types";
import { AgentQueueService, AgentRegistry, nowIso } from "./queue";

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function messageAddressList(recipient: AgentAddress | AgentAddress[]): AgentAddress[] {
  return Array.isArray(recipient) ? recipient : [recipient];
}

export interface QueueProcessorRuntimeOptions extends QueueProcessorOptions {
  onMessage: A2AHandler;
  capabilityFilter?: string;
  recipient?: AgentAddress;
}

export class AgentQueueProcessor {
  private readonly service: AgentQueueService;
  private readonly registry: AgentRegistry;
  private readonly onMessage: A2AHandler;
  private readonly logger?: QueueLogger;
  private readonly events?: QueueEventBus;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;
  private readonly leaseMs: number;
  private readonly maxRetries: number;
  private readonly ownerId: string;
  private readonly capabilityFilter?: string;
  private readonly recipient?: AgentAddress;
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(service: AgentQueueService, registry: AgentRegistry, options: QueueProcessorRuntimeOptions, logger?: QueueLogger, events?: QueueEventBus) {
    this.service = service;
    this.registry = registry;
    this.onMessage = options.onMessage;
    this.logger = logger;
    this.events = events;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.batchSize = options.batchSize ?? 10;
    this.leaseMs = options.leaseMs ?? 60_000;
    this.maxRetries = options.maxRetries ?? 5;
    this.ownerId = options.ownerId ?? "processor";
    this.capabilityFilter = options.capabilityFilter;
    this.recipient = options.recipient;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.emit("a2a.processor.started", { ownerId: this.ownerId, pollIntervalMs: this.pollIntervalMs });
    await this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.emit("a2a.processor.stopped", { ownerId: this.ownerId });
  }

  async tick(): Promise<number> {
    if (!this.running) return 0;
    const query: QueueQuery = { recipient: this.recipient, availableOnly: true, deliveryState: "queued", limit: this.batchSize };
    const leased = await Promise.all(
      Array.from({ length: this.batchSize }, async () =>
        this.service.lease(query, { leaseMs: this.leaseMs, maxAttempts: this.maxRetries, ownerId: this.ownerId }),
      ),
    );
    const messages = leased.filter(Boolean) as AgentQueueEnvelope[];
    let processed = 0;

    for (const message of messages) {
      if (this.capabilityFilter) {
        const recipientId = messageAddressList(message.recipient)[0];
        const agent = this.registry.get(recipientId);
        if (!agent || !agent.capabilities.includes(this.capabilityFilter)) {
          await this.service.nack(message.id, `Recipient does not support capability ${this.capabilityFilter}`, true);
          continue;
        }
      }

      try {
        await this.handleMessage(message);
        processed += 1;
      } catch (error) {
        const reason = error instanceof Error ? error.message : safeString(error) || "Unhandled processor error";
        this.logger?.error("A2A message handler failed", { messageId: message.id, queue: message.queue, reason });
        await this.service.nack(message.id, reason, true);
      }
    }

    return processed;
  }

  private async handleMessage(message: AgentQueueEnvelope): Promise<void> {
    const ack = async () => this.service.ack(message.id);
    const nack = async (reason: string, retry = true) => this.service.nack(message.id, reason, retry);
    const reply = async <TPayload>(payload: TPayload, options?: QueueSendOptions) => this.service.reply(message, payload, options);
    const sendProgress = async (payload: Record<string, unknown>, tags?: string[]) => this.service.progress(message, payload, tags);
    const ctx: A2AHandlerContext = { message, registry: this.registry, queue: this.service, reply, ack, nack, sendProgress };

    this.emit("a2a.message.processing", {
      messageId: message.id,
      queue: message.queue,
      sender: message.sender,
      recipient: message.recipient,
      type: message.type,
      attemptCount: message.attemptCount,
    });

    await this.onMessage(ctx);
    await ack();
    this.emit("a2a.message.processed", { messageId: message.id, queue: message.queue, sender: message.sender, recipient: message.recipient, type: message.type });
  }

  private async loop(): Promise<void> {
    if (!this.running) return;
    const count = await this.tick();
    this.logger?.debug("A2A processor tick complete", { ownerId: this.ownerId, processed: count });
    this.timer = setTimeout(() => {
      void this.loop();
    }, this.pollIntervalMs);
  }

  private emit(eventName: string, payload: Record<string, unknown>): void {
    try {
      this.events?.emit(eventName, payload);
    } catch (error) {
      this.logger?.warn("Queue processor event failed", { eventName, error: safeString(error) });
    }
  }
}

export interface QueueWorkerOptions {
  service: AgentQueueService;
  registry: AgentRegistry;
  processor: AgentQueueProcessor;
  logger?: QueueLogger;
  events?: QueueEventBus;
}

export class AgentQueueWorker {
  private readonly service: AgentQueueService;
  private readonly registry: AgentRegistry;
  private readonly processor: AgentQueueProcessor;
  private readonly logger?: QueueLogger;
  private readonly events?: QueueEventBus;

  constructor(options: QueueWorkerOptions) {
    this.service = options.service;
    this.registry = options.registry;
    this.processor = options.processor;
    this.logger = options.logger;
    this.events = options.events;
  }

  async start(): Promise<void> {
    await this.service.init();
    this.emit("a2a.worker.starting", { agents: this.registry.list().length });
    await this.processor.start();
  }

  stop(): void {
    this.processor.stop();
    this.emit("a2a.worker.stopped", {});
  }

  async drain(queue?: string): Promise<number> {
    const items = await this.service.poll({ queue, availableOnly: true, deliveryState: "queued", limit: 1000 });
    let processed = 0;
    for (const _message of items.items) {
      try {
        await this.processor.tick();
        processed += 1;
      } catch (error) {
        this.logger?.error("Queue worker drain failed", { error: safeString(error) });
      }
    }
    return processed;
  }

  private emit(eventName: string, payload: Record<string, unknown>): void {
    try {
      this.events?.emit(eventName, payload);
    } catch (error) {
      this.logger?.warn("Queue worker event failed", { eventName, error: safeString(error) });
    }
  }
}

export function createExampleA2AHandler(deps: {
  logger?: QueueLogger;
  events?: QueueEventBus;
  onTask?: (input: { message: AgentQueueEnvelope; context: A2AHandlerContext }) => Promise<Record<string, unknown>>;
}): A2AHandler {
  return async (ctx: A2AHandlerContext) => {
    const { message } = ctx;
    deps.logger?.info("A2A handler received message", { id: message.id, type: message.type, sender: message.sender, recipient: message.recipient, queue: message.queue });

    if (message.type === "status.ping") {
      await ctx.reply({ ok: true, timestamp: nowIso(), status: "pong", address: message.recipient }, { tags: ["status", "reply"], priority: "low" });
      await ctx.ack();
      return;
    }

    if (message.type === "task.request") {
      await ctx.sendProgress({ stage: "started", messageId: message.id, taskId: message.metadata.taskId }, ["progress", "started"]);
      const result = deps.onTask
        ? await deps.onTask({ message, context: ctx })
        : { ok: true, agent: message.recipient, handledType: message.type, echoedPayload: message.payload, note: "Default handler executed." };
      await ctx.reply(result, { tags: ["task", "response"], priority: "normal" });
      await ctx.sendProgress({ stage: "completed", messageId: message.id, taskId: message.metadata.taskId }, ["progress", "completed"]);
      await ctx.ack();
      return;
    }

    if (message.type === "memory.share" || message.type === "reflection.share") {
      await ctx.sendProgress({ stage: "ingested", messageId: message.id, kind: message.type }, ["memory", "ingest"]);
      await ctx.ack();
      return;
    }

    if (message.type === "approval.request") {
      await ctx.reply({ approved: true, reviewedAt: nowIso(), messageId: message.id, reason: "default-approval" }, { tags: ["approval", "response"] });
      await ctx.ack();
      return;
    }

    await ctx.nack(`Unhandled A2A message type: ${message.type}`, true);
  };
}

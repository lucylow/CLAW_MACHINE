import path from "node:path";
import { AgentMessageRouter, AgentRunA2AAdapter } from "./agent-router";
import { AgentQueueService, AgentRegistry, nowIso } from "./queue";
import { FileQueueStore, ZeroGQueueStore } from "./queue-store";
import { AgentQueueProcessor, AgentQueueWorker, createExampleA2AHandler } from "./processor";
import type { A2AHandler, AgentAddress, AgentRegistryRecord, QueueBackend, QueueEventBus, QueueLogger, QueueStore, ZeroGStorageQueueClient } from "./types";

export * from "./types";
export * from "./queue";
export * from "./queue-store";
export * from "./agent-router";
export * from "./processor";
export * from "./routes";
export * from "./protocol";
export * from "./registry";
export * from "./router";
export * from "./worker";
export * from "./handlers";
export * from "./queueStore";
export * from "./fileQueueStore";
export * from "./zeroGQueueStore";

export interface A2ABootstrapOptions {
  backend: QueueBackend;
  queueDirectory?: string;
  zeroGStorage?: ZeroGStorageQueueClient;
  namespace?: string;
  logger?: QueueLogger;
  events?: QueueEventBus;
  localAgentAddress: AgentAddress;
  localAgentName?: string;
}

export interface A2ABootstrapResult {
  registry: AgentRegistry;
  service: AgentQueueService;
  router: AgentMessageRouter;
  processor: AgentQueueProcessor;
  adapter: AgentRunA2AAdapter;
  worker: AgentQueueWorker;
  handler: A2AHandler;
}

export async function bootstrapA2AMessaging(options: A2ABootstrapOptions): Promise<A2ABootstrapResult> {
  const registry = new AgentRegistry({ logger: options.logger });
  const localIdentity: AgentRegistryRecord = {
    address: options.localAgentAddress,
    name: options.localAgentName ?? "CLAW MACHINE Agent",
    capabilities: ["task", "memory-share", "reflection-share", "status", "approval"],
    version: "1.0.0",
    tags: ["local", "claw-machine"],
    online: true,
    inboxQueue: `${options.localAgentAddress}.inbox`,
    outboxQueue: `${options.localAgentAddress}.outbox`,
    sharedQueues: [`${options.localAgentAddress}.shared`],
    lastSeenAt: nowIso(),
    status: "idle",
  };
  registry.register(localIdentity);

  const store: QueueStore =
    options.backend === "0g-storage"
      ? new ZeroGQueueStore({
          storage: options.zeroGStorage as ZeroGStorageQueueClient,
          namespace: options.namespace ?? "claw-machine-a2a",
          backend: options.backend,
          logger: options.logger,
        })
      : new FileQueueStore({
          directory: options.queueDirectory ?? path.join(process.cwd(), "data", "a2a-queues"),
          backend: options.backend,
          namespace: options.namespace ?? "claw-machine-a2a",
          logger: options.logger,
        });

  const service = new AgentQueueService({
    store,
    registry,
    logger: options.logger,
    events: options.events,
    defaultLeaseMs: 45_000,
    defaultMaxAttempts: 5,
  });

  const router = new AgentMessageRouter({ service, registry, logger: options.logger, events: options.events });
  const handler = createExampleA2AHandler({
    logger: options.logger,
    events: options.events,
    onTask: async ({ message }) => ({
      ok: true,
      handledBy: options.localAgentAddress,
      messageId: message.id,
      type: message.type,
      summary: `Handled ${message.type} for ${message.sender}`,
      payloadEcho: message.payload,
    }),
  });

  const processor = new AgentQueueProcessor(
    service,
    registry,
    { onMessage: handler, ownerId: `${options.localAgentAddress}.processor`, leaseMs: 45_000, pollIntervalMs: 1_500, batchSize: 8, maxRetries: 5 },
    options.logger,
    options.events,
  );
  const adapter = new AgentRunA2AAdapter({ service, registry, localAgentAddress: options.localAgentAddress, logger: options.logger, events: options.events });
  const worker = new AgentQueueWorker({ service, registry, processor, logger: options.logger, events: options.events });

  await service.init();
  return { registry, service, router, processor, adapter, worker, handler };
}

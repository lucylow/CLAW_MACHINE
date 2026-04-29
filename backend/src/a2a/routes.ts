import express, { type Request, type Response } from "express";
import type { AgentRegistryRecord, DeliveryState, MessageType, MessagePriority, QueueEventBus, QueueLogger, QueueQuery } from "./types";
import { AgentQueueService, AgentRegistry } from "./queue";
import { AgentMessageRouter } from "./agent-router";

function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface A2ARouteDeps {
  service: AgentQueueService;
  registry: AgentRegistry;
  router?: AgentMessageRouter;
  logger?: QueueLogger;
  events?: QueueEventBus;
}

export function createA2ARoutes(deps: A2ARouteDeps) {
  const router = express.Router();
  router.use(express.json({ limit: "25mb" }));

  router.post("/send", async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        sender?: string;
        recipient?: string;
        type?: MessageType;
        payload?: unknown;
        queue?: string;
        conversationId?: string;
        correlationId?: string;
        priority?: MessagePriority;
        tags?: string[];
      };
      if (!body.sender || !body.recipient || !body.type) return res.status(400).json({ ok: false, error: "sender, recipient, and type are required" });
      const target = deps.registry.get(body.recipient);
      const queue = body.queue ?? target?.inboxQueue ?? `${body.recipient}.inbox`;
      const message = await deps.service.send({
        queue,
        direction: "outbox",
        sender: body.sender,
        recipient: body.recipient,
        type: body.type,
        payload: body.payload,
        options: {
          conversationId: body.conversationId,
          correlationId: body.correlationId,
          priority: body.priority ?? "normal",
          tags: body.tags,
        },
      });
      return res.json({ ok: true, message });
    } catch (error) {
      const message = error instanceof Error ? error.message : safeString(error);
      deps.logger?.error("A2A send route failed", { error: message });
      return res.status(500).json({ ok: false, error: message });
    }
  });

  router.post("/broadcast", async (req: Request, res: Response) => {
    try {
      const body = req.body as {
        sender?: string;
        taskType?: string;
        payload?: unknown;
        tags?: string[];
        conversationId?: string;
        correlationId?: string;
      };
      if (!body.sender || !body.taskType) return res.status(400).json({ ok: false, error: "sender and taskType are required" });
      if (!deps.router) return res.status(500).json({ ok: false, error: "router dependency is required for broadcast" });
      const messages = await deps.router.sendBroadcast({
        sender: body.sender,
        taskType: body.taskType,
        payload: body.payload,
        tags: body.tags,
        conversationId: body.conversationId,
        correlationId: body.correlationId,
      });
      return res.json({ ok: true, messages });
    } catch (error) {
      const message = error instanceof Error ? error.message : safeString(error);
      deps.logger?.error("A2A broadcast route failed", { error: message });
      return res.status(500).json({ ok: false, error: message });
    }
  });

  router.get("/inbox/:agentAddress", async (req: Request, res: Response) => {
    try {
      const agentAddress = String(req.params.agentAddress);
      const agent = deps.registry.get(agentAddress);
      const queue = agent?.inboxQueue ?? `${agentAddress}.inbox`;
      const items = await deps.service.poll({ queue, recipient: agentAddress, availableOnly: true, limit: 100 });
      return res.json({ ok: true, queue, items: items.items });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });

  router.get("/outbox/:agentAddress", async (req: Request, res: Response) => {
    try {
      const agentAddress = String(req.params.agentAddress);
      const items = await deps.service.poll({ sender: agentAddress, limit: 100 });
      return res.json({ ok: true, items: items.items });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });

  router.post("/ack/:messageId", async (req: Request, res: Response) => {
    try {
      const result = await deps.service.ack(String(req.params.messageId));
      return res.json({ ok: true, result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });

  router.post("/nack/:messageId", async (req: Request, res: Response) => {
    try {
      const body = req.body as { reason?: string; retry?: boolean };
      if (!body.reason) return res.status(400).json({ ok: false, error: "reason is required" });
      const result = await deps.service.nack(String(req.params.messageId), body.reason, body.retry ?? true);
      return res.json({ ok: true, result });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });

  router.post("/heartbeat", async (req: Request, res: Response) => {
    try {
      const body = req.body as { address?: string; status?: AgentRegistryRecord["status"]; online?: boolean; metadata?: Record<string, unknown> };
      if (!body.address) return res.status(400).json({ ok: false, error: "address is required" });
      deps.registry.update(body.address, {
        online: body.online ?? true,
        status: body.status ?? "idle",
        metadata: body.metadata ?? {},
      });
      deps.registry.markHeartbeat(body.address);
      return res.json({ ok: true });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });

  router.get("/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await deps.service.stats();
      return res.json({ ok: true, stats });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });

  return router;
}

export function createA2ADebugRoutes(deps: { registry: AgentRegistry; service: AgentQueueService; logger?: QueueLogger }) {
  const router = express.Router();
  router.get("/agents", (_req: Request, res: Response) => res.json({ ok: true, agents: deps.registry.list() }));
  router.get("/agents/:address", (req: Request, res: Response) => {
    const agent = deps.registry.get(String(req.params.address));
    if (!agent) return res.status(404).json({ ok: false, error: "agent not found" });
    return res.json({ ok: true, agent });
  });
  router.get("/messages", async (req: Request, res: Response) => {
    try {
      const query: QueueQuery = {
        queue: req.query.queue ? String(req.query.queue) : undefined,
        recipient: req.query.recipient ? String(req.query.recipient) : undefined,
        sender: req.query.sender ? String(req.query.sender) : undefined,
        type: req.query.type as MessageType | undefined,
        deliveryState: req.query.deliveryState as DeliveryState | undefined,
        conversationId: req.query.conversationId ? String(req.query.conversationId) : undefined,
        correlationId: req.query.correlationId ? String(req.query.correlationId) : undefined,
        dedupeKey: req.query.dedupeKey ? String(req.query.dedupeKey) : undefined,
        availableOnly: req.query.availableOnly === "true",
        limit: req.query.limit ? Number(req.query.limit) : 100,
      };
      const items = await deps.service.poll(query);
      return res.json({ ok: true, items: items.items });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });
  router.get("/stats", async (_req: Request, res: Response) => {
    try {
      const stats = await deps.service.stats();
      return res.json({ ok: true, stats });
    } catch (error) {
      return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : safeString(error) });
    }
  });
  return router;
}

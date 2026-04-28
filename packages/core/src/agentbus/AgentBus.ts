/**
 * AgentBus
 *
 * Agent-to-agent messaging system backed by 0G Storage Log streams.
 *
 * Each agent has an inbox — a 0G Storage Log stream identified by its wallet address.
 * Agents can send tasks, results, and notifications to each other asynchronously.
 * The bus polls the inbox at a configurable interval and fires callbacks.
 *
 * This enables multi-agent architectures where specialized agents collaborate:
 *   - Orchestrator agent decomposes a goal and sends sub-tasks to worker agents
 *   - Worker agents complete tasks and send results back
 *   - Any agent can broadcast to a shared channel
 *
 * Message delivery is eventually consistent (0G Storage Log guarantees ordering
 * within a stream but not across streams).
 */

import { randomUUID } from "crypto";
import { EventEmitter } from "events";
import type { StorageAdapter } from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type MessageType =
  | "task"        // Request another agent to perform a task
  | "result"      // Return a task result to the sender
  | "notification" // One-way notification (no reply expected)
  | "heartbeat"   // Liveness ping
  | "broadcast";  // Message to all agents on a shared channel

export interface AgentMessage {
  id: string;
  type: MessageType;
  from: string;       // Sender agent id or wallet address
  to: string;         // Recipient agent id, wallet address, or "broadcast"
  channel?: string;   // Optional named channel for broadcast messages
  payload: Record<string, unknown>;
  replyTo?: string;   // Message id this is a reply to
  createdAt: number;
  expiresAt?: number; // Optional TTL
}

export interface SendOptions {
  replyTo?: string;
  expiresAt?: number;
  channel?: string;
}

export interface AgentBusConfig {
  agentId: string;
  storage: StorageAdapter;
  pollIntervalMs?: number;
  maxMessageAge?: number; // ms, default 24h
}

// ── AgentBus ──────────────────────────────────────────────────────────────────

export class AgentBus extends EventEmitter {
  private readonly agentId: string;
  private readonly storage: StorageAdapter;
  private readonly pollIntervalMs: number;
  private readonly maxMessageAge: number;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private lastReadOffset = 0;
  private readonly subscriptions: Map<string, Set<(msg: AgentMessage) => void>> = new Map();
  private running = false;

  constructor(config: AgentBusConfig) {
    super();
    this.agentId = config.agentId;
    this.storage = config.storage;
    this.pollIntervalMs = config.pollIntervalMs ?? 5000;
    this.maxMessageAge = config.maxMessageAge ?? 24 * 60 * 60 * 1000;
  }

  /**
   * Start polling the inbox for new messages.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.pollTimer = setInterval(() => this._poll(), this.pollIntervalMs);
    // Initial poll
    this._poll().catch(() => {});
  }

  /**
   * Stop polling.
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Send a message to another agent.
   */
  async send(
    to: string,
    type: MessageType,
    payload: Record<string, unknown>,
    options: SendOptions = {},
  ): Promise<AgentMessage> {
    const msg: AgentMessage = {
      id: randomUUID(),
      type,
      from: this.agentId,
      to,
      channel: options.channel,
      payload,
      replyTo: options.replyTo,
      createdAt: Date.now(),
      expiresAt: options.expiresAt,
    };

    // Write to recipient's inbox log
    const inboxKey = this._inboxKey(to);
    await this.storage.append(inboxKey, msg);

    // Also write to sender's sent log for audit
    await this.storage.append(this._sentKey(), { ...msg, deliveredAt: Date.now() });

    this.emit("sent", msg);
    return msg;
  }

  /**
   * Send a task to another agent and wait for a reply (with timeout).
   */
  async request(
    to: string,
    payload: Record<string, unknown>,
    timeoutMs = 30_000,
  ): Promise<AgentMessage> {
    const msg = await this.send(to, "task", payload);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off("message", handler);
        reject(new Error(`AgentBus: request to ${to} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const handler = (reply: AgentMessage) => {
        if (reply.replyTo === msg.id) {
          clearTimeout(timer);
          this.off("message", handler);
          resolve(reply);
        }
      };
      this.on("message", handler);
    });
  }

  /**
   * Broadcast a message to all agents on a named channel.
   */
  async broadcast(
    channel: string,
    payload: Record<string, unknown>,
  ): Promise<AgentMessage> {
    return this.send("broadcast", "broadcast", payload, { channel });
  }

  /**
   * Subscribe to messages of a specific type or from a specific sender.
   * Returns an unsubscribe function.
   */
  subscribe(
    filter: { type?: MessageType; from?: string; channel?: string },
    callback: (msg: AgentMessage) => void,
  ): () => void {
    const key = JSON.stringify(filter);
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)!.add(callback);

    const handler = (msg: AgentMessage) => {
      if (filter.type && msg.type !== filter.type) return;
      if (filter.from && msg.from !== filter.from) return;
      if (filter.channel && msg.channel !== filter.channel) return;
      callback(msg);
    };
    this.on("message", handler);

    return () => {
      this.subscriptions.get(key)?.delete(callback);
      this.off("message", handler);
    };
  }

  /**
   * Reply to a received message.
   */
  async reply(
    originalMsg: AgentMessage,
    payload: Record<string, unknown>,
  ): Promise<AgentMessage> {
    return this.send(originalMsg.from, "result", payload, { replyTo: originalMsg.id });
  }

  /**
   * Get the inbox log key for an agent.
   */
  private _inboxKey(agentId: string): string {
    return `agent-inbox:${agentId}`;
  }

  private _sentKey(): string {
    return `agent-sent:${this.agentId}`;
  }

  /**
   * Poll the inbox for new messages.
   */
  private async _poll(): Promise<void> {
    try {
      const inboxKey = this._inboxKey(this.agentId);
      const messages = await this.storage.readLog(inboxKey, 50);

      // Also check broadcast channel
      const broadcastMessages = await this.storage.readLog("agent-broadcast", 20);

      const allMessages = [...messages, ...broadcastMessages];
      const now = Date.now();

      for (const raw of allMessages) {
        const msg = raw as AgentMessage;
        if (!msg.id || !msg.from) continue;

        // Skip expired messages
        if (msg.expiresAt && msg.expiresAt < now) continue;

        // Skip old messages (beyond maxMessageAge)
        if (msg.createdAt < now - this.maxMessageAge) continue;

        this.emit("message", msg);
      }
    } catch { /* Ignore poll errors — storage may be temporarily unavailable */ }
  }

  get isRunning(): boolean {
    return this.running;
  }
}

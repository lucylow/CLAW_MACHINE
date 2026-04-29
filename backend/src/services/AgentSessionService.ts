/**
 * CLAW MACHINE — AgentSessionService
 *
 * Persists full agent session state to 0G Storage KV on every turn so that
 * sessions survive backend restarts and can be resumed from any node.
 *
 * Falls back to an in-process Map when 0G Storage is not configured.
 */

import crypto from "node:crypto";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ConversationTurn {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface SessionState {
  sessionId: string;
  walletAddress: string | null;
  createdAt: string;
  updatedAt: string;
  turns: ConversationTurn[];
  /** Arbitrary key-value bag for skill state, plan IDs, etc. */
  context: Record<string, unknown>;
  stats: {
    turnCount: number;
    errorCount: number;
    lastModel?: string;
  };
}

export interface StorageClient {
  putKV(key: string, value: unknown, streamId: string): Promise<{ id: string }>;
  getKV<T>(key: string, streamId: string): Promise<T | null>;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AgentSessionService {
  /** In-process fallback when 0G Storage is not available. */
  private readonly localCache = new Map<string, SessionState>();
  private readonly storage: StorageClient | null;
  private readonly streamId: string;

  constructor(storage: StorageClient | null = null, streamId = "claw-sessions") {
    this.storage = storage;
    this.streamId = streamId;
  }

  /** Create a new session and persist it. */
  async createSession(walletAddress: string | null = null): Promise<SessionState> {
    const now = new Date().toISOString();
    const state: SessionState = {
      sessionId: crypto.randomUUID(),
      walletAddress,
      createdAt: now,
      updatedAt: now,
      turns: [],
      context: {},
      stats: { turnCount: 0, errorCount: 0 },
    };
    await this.persist(state);
    return state;
  }

  /** Load an existing session by ID. Returns null if not found. */
  async getSession(sessionId: string): Promise<SessionState | null> {
    if (this.storage) {
      try {
        return await this.storage.getKV<SessionState>(this.kvKey(sessionId), this.streamId);
      } catch {
        // Fall through to local cache
      }
    }
    return this.localCache.get(sessionId) ?? null;
  }

  /** Append a turn to an existing session and persist. */
  async appendTurn(
    sessionId: string,
    turn: Omit<ConversationTurn, "timestamp">,
  ): Promise<SessionState> {
    const state = await this.getOrCreate(sessionId);
    const fullTurn: ConversationTurn = { ...turn, timestamp: new Date().toISOString() };
    state.turns.push(fullTurn);
    state.stats.turnCount++;
    if (turn.role === "assistant" && (turn.metadata as any)?.error) {
      state.stats.errorCount++;
    }
    state.updatedAt = fullTurn.timestamp;
    await this.persist(state);
    return state;
  }

  /** Update arbitrary context values on a session. */
  async updateContext(
    sessionId: string,
    patch: Record<string, unknown>,
  ): Promise<SessionState> {
    const state = await this.getOrCreate(sessionId);
    Object.assign(state.context, patch);
    state.updatedAt = new Date().toISOString();
    await this.persist(state);
    return state;
  }

  /** Delete a session from both storage and local cache. */
  async deleteSession(sessionId: string): Promise<void> {
    this.localCache.delete(sessionId);
    // 0G KV does not expose delete in the current client; we overwrite with a tombstone
    if (this.storage) {
      try {
        await this.storage.putKV(
          this.kvKey(sessionId),
          { _tombstone: true, deletedAt: new Date().toISOString() },
          this.streamId,
        );
      } catch { /* best-effort */ }
    }
  }

  /** List all locally-cached session IDs (useful for health checks). */
  listLocalSessions(): string[] {
    return [...this.localCache.keys()];
  }

  // ── private ──────────────────────────────────────────────────────────────

  private kvKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private async persist(state: SessionState): Promise<void> {
    this.localCache.set(state.sessionId, state);
    if (this.storage) {
      try {
        await this.storage.putKV(this.kvKey(state.sessionId), state, this.streamId);
      } catch (err) {
        // Log but don't throw — local cache is the fallback
        console.warn("[AgentSessionService] 0G KV persist failed:", err instanceof Error ? err.message : err);
      }
    }
  }

  private async getOrCreate(sessionId: string): Promise<SessionState> {
    const existing = await this.getSession(sessionId);
    if (existing) return existing;
    // Auto-create a session if it doesn't exist (e.g. after a restart)
    const now = new Date().toISOString();
    const state: SessionState = {
      sessionId,
      walletAddress: null,
      createdAt: now,
      updatedAt: now,
      turns: [],
      context: {},
      stats: { turnCount: 0, errorCount: 0 },
    };
    this.localCache.set(sessionId, state);
    return state;
  }
}

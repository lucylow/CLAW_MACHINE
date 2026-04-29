import crypto from "crypto";
import type { FrameworkEvent, HookPhase } from "./types.js";

export interface EventListener<T = unknown> {
  id: string;
  phase?: HookPhase;
  type?: string;
  callback: (event: FrameworkEvent<T>) => Promise<void> | void;
}

export class FrameworkEventBus {
  private readonly listeners = new Map<string, EventListener>();
  private history: FrameworkEvent[] = [];

  on<T = unknown>(listener: Omit<EventListener<T>, "id">): string {
    const id = `evt_${crypto.randomUUID()}`;
    this.listeners.set(id, { ...listener, id } as EventListener);
    return id;
  }

  off(id: string): boolean {
    return this.listeners.delete(id);
  }

  emit<T = unknown>(event: FrameworkEvent<T>): void {
    this.history.push(event);
    if (this.history.length > 2000) this.history = this.history.slice(-2000);

    for (const listener of this.listeners.values()) {
      if (listener.phase && listener.phase !== event.phase) continue;
      if (listener.type && listener.type !== event.type) continue;
      void Promise.resolve(listener.callback(event));
    }
  }

  listHistory(sessionId?: string): FrameworkEvent[] {
    if (!sessionId) return [...this.history];
    return this.history.filter((event) => event.sessionId === sessionId);
  }

  clear(sessionId?: string): number {
    if (!sessionId) {
      const count = this.history.length;
      this.history = [];
      return count;
    }
    const before = this.history.length;
    this.history = this.history.filter((event) => event.sessionId !== sessionId);
    return before - this.history.length;
  }
}

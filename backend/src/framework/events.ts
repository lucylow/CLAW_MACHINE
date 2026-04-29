import type { EventBus, EventEnvelope, EventHandler } from "./types";
import { nowIso } from "./util";

class SimpleEventBus implements EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.handlers.get(event)?.delete(handler);
  }

  once(event: string, handler: EventHandler): () => void {
    const off = this.on(event, async (envelope) => {
      off();
      await handler(envelope);
    });
    return off;
  }

  async emit<T>(event: string, payload: T, meta?: Record<string, unknown>): Promise<void> {
    const envelope: EventEnvelope<T> = {
      event,
      payload,
      ts: nowIso(),
      meta,
    };
    const handlers = [...(this.handlers.get(event) ?? [])];
    for (const handler of handlers) {
      await handler(envelope);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export function createEventBus(): EventBus {
  return new SimpleEventBus();
}

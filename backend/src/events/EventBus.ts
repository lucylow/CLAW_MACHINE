type EventPayload = Record<string, unknown>;

interface RuntimeEvent {
  type: string;
  timestamp: number;
  requestId?: string;
  payload: EventPayload;
}

type Listener = (event: RuntimeEvent) => void;

export class EventBus {
  private readonly listeners = new Set<Listener>();
  private readonly trail: RuntimeEvent[] = [];

  emit(type: string, payload: EventPayload, requestId?: string): void {
    const event: RuntimeEvent = {
      type,
      timestamp: Date.now(),
      requestId,
      payload,
    };
    this.trail.push(event);
    if (this.trail.length > 200) this.trail.shift();
    for (const listener of this.listeners) listener(event);
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  recent(limit = 25): RuntimeEvent[] {
    return this.trail.slice(-limit);
  }
}

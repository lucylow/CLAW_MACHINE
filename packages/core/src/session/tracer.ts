export interface TraceEvent {
  at: string;
  type: string;
  message: string;
  data?: unknown;
}

export class SessionTracer {
  private events: TraceEvent[] = [];

  add(type: string, message: string, data?: unknown): void {
    this.events.push({
      at: new Date().toISOString(),
      type,
      message,
      data,
    });
  }

  getTrace(): string[] {
    return this.events.map((e) => `[${e.at}] ${e.type}: ${e.message}`);
  }

  export(): TraceEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

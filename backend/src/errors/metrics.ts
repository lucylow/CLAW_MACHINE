export interface MetricsClient {
  increment(name: string, value?: number, tags?: Record<string, string | number | boolean>): void;
  gauge(name: string, value: number, tags?: Record<string, string | number | boolean>): void;
  timing(name: string, valueMs: number, tags?: Record<string, string | number | boolean>): void;
}

export class MemoryMetrics implements MetricsClient {
  private points: Array<{ name: string; value: number; tags?: Record<string, string | number | boolean>; ts: string }> = [];

  increment(name: string, value = 1, tags?: Record<string, string | number | boolean>): void {
    this.points.push({ name, value, tags, ts: new Date().toISOString() });
  }

  gauge(name: string, value: number, tags?: Record<string, string | number | boolean>): void {
    this.points.push({ name, value, tags, ts: new Date().toISOString() });
  }

  timing(name: string, valueMs: number, tags?: Record<string, string | number | boolean>): void {
    this.points.push({ name, value: valueMs, tags, ts: new Date().toISOString() });
  }

  snapshot() {
    return [...this.points];
  }
}

export function createMetrics(): MetricsClient {
  return new MemoryMetrics();
}

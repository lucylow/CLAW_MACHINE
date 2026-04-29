import type { MetricPoint, MetricsClient } from "./types";
import { nowIso } from "./util";

class InMemoryMetrics implements MetricsClient {
  private points: MetricPoint[] = [];

  increment(name: string, value = 1, tags?: Record<string, string | number | boolean>): void {
    this.points.push({ name, value, tags, ts: nowIso() });
  }

  gauge(name: string, value: number, tags?: Record<string, string | number | boolean>): void {
    this.points.push({ name, value, tags, ts: nowIso() });
  }

  timing(name: string, valueMs: number, tags?: Record<string, string | number | boolean>): void {
    this.points.push({ name, value: valueMs, tags, ts: nowIso() });
  }

  snapshot(): MetricPoint[] {
    return [...this.points];
  }
}

export function createMetrics(): MetricsClient {
  return new InMemoryMetrics();
}

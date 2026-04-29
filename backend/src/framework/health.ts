import type { HealthCheck, HealthCheckResult, HealthRegistry, HealthStatus } from "./types";
import { errorToRecord, nowIso, nowMs, safeString, sleep } from "./util";

class MemoryHealthRegistry implements HealthRegistry {
  private checks = new Map<string, HealthCheck>();

  register(check: HealthCheck): void {
    this.checks.set(check.name, check);
  }

  unregister(name: string): void {
    this.checks.delete(name);
  }

  async run(): Promise<HealthCheckResult[]> {
    const results: HealthCheckResult[] = [];
    for (const check of this.checks.values()) {
      const start = nowMs();
      try {
        const timeout = check.timeoutMs ?? 5_000;
        const result = await Promise.race([
          Promise.resolve(check.run()),
          sleep(timeout).then(
            (): HealthCheckResult => ({
              name: check.name,
              kind: check.kind,
              status: "unhealthy",
              latencyMs: timeout,
              message: "health check timed out",
              checkedAt: nowIso(),
            }),
          ),
        ]);

        results.push({
          ...result,
          latencyMs: result.latencyMs ?? nowMs() - start,
          checkedAt: result.checkedAt ?? nowIso(),
        });
      } catch (error) {
        results.push({
          name: check.name,
          kind: check.kind,
          status: "unhealthy",
          latencyMs: nowMs() - start,
          message: error instanceof Error ? error.message : safeString(error),
          details: errorToRecord(error),
          checkedAt: nowIso(),
        });
      }
    }
    return results;
  }

  summary(): { status: HealthStatus; healthy: number; degraded: number; unhealthy: number; checks: number } {
    const checks = this.checks.size;
    return { status: checks > 0 ? "healthy" : "degraded", healthy: checks, degraded: 0, unhealthy: 0, checks };
  }
}

export function createHealthRegistry(): HealthRegistry {
  return new MemoryHealthRegistry();
}

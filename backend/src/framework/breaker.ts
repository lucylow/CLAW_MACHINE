import type { BreakerPolicy, BreakerRegistry, CircuitBreaker, Logger } from "./types";
import { FrameworkError } from "./errors";
import { errorToRecord, nowMs } from "./util";

class MemoryCircuitBreaker implements CircuitBreaker {
  state: "closed" | "open" | "half-open" = "closed";
  failures = 0;
  successCount = 0;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  nextAttemptAt?: number;

  constructor(
    public readonly name: string,
    private readonly policy: BreakerPolicy,
    private readonly logger?: Logger,
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = nowMs();
    if (this.state === "open") {
      if (!this.nextAttemptAt || now < this.nextAttemptAt) {
        throw new FrameworkError({
          category: "dependency",
          code: "CIRCUIT_OPEN",
          message: `Circuit breaker ${this.name} is open`,
          retryable: true,
          statusCode: 503,
          details: { name: this.name, nextAttemptAt: this.nextAttemptAt },
        });
      }
      this.state = "half-open";
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error);
      throw error;
    }
  }

  recordSuccess(): void {
    this.failures = 0;
    this.successCount += 1;
    this.lastSuccessAt = nowMs();
    if (this.state !== "closed") this.state = "closed";
  }

  recordFailure(error: unknown): void {
    this.failures += 1;
    this.lastFailureAt = nowMs();
    this.logger?.warn(`Circuit breaker failure: ${this.name}`, { error: errorToRecord(error) });
    if (this.failures >= this.policy.threshold) {
      this.state = "open";
      this.nextAttemptAt = nowMs() + this.policy.resetAfterMs;
    }
  }
}

class MemoryBreakerRegistry implements BreakerRegistry {
  private breakers = new Map<string, MemoryCircuitBreaker>();

  constructor(
    private readonly defaultPolicy: BreakerPolicy,
    private readonly logger?: Logger,
  ) {}

  get(name: string): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new MemoryCircuitBreaker(name, this.defaultPolicy, this.logger));
    }
    return this.breakers.get(name)!;
  }

  snapshot(): Record<string, { state: string; failures: number; successCount: number; nextAttemptAt?: number }> {
    return [...this.breakers.entries()].reduce<
      Record<string, { state: string; failures: number; successCount: number; nextAttemptAt?: number }>
    >((acc, [name, breaker]) => {
      acc[name] = {
        state: breaker.state,
        failures: breaker.failures,
        successCount: breaker.successCount,
        nextAttemptAt: breaker.nextAttemptAt,
      };
      return acc;
    }, {});
  }
}

export function createBreakerRegistry(policy: BreakerPolicy, logger?: Logger): BreakerRegistry {
  return new MemoryBreakerRegistry(policy, logger);
}

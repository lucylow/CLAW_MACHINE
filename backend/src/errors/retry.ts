import type { ErrorCategory, ErrorCode } from "./codes";
import { ClawError } from "./shapes";
import type { ErrorContext } from "./shapes";
import { normalizeError } from "./normalize";

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  retryableCodes?: Array<ErrorCode | string>;
  retryableCategories?: ErrorCategory[];
}

export async function withRetry<T>(
  operation: () => Promise<T>,
  policy: RetryPolicy,
  context?: ErrorContext,
  onRetry?: (attempt: number, error: ClawError, sleepMs: number) => void,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const normalized = normalizeError(error, context).error;
      const retryableByCode = !policy.retryableCodes || policy.retryableCodes.includes(normalized.code);
      const retryableByCategory =
        !policy.retryableCategories || policy.retryableCategories.includes(normalized.category);
      const shouldRetry = normalized.retryable && retryableByCode && retryableByCategory && attempt < policy.attempts;
      if (!shouldRetry) throw normalized;
      const exponential = Math.min(policy.maxDelayMs, policy.baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = exponential * policy.jitterRatio * Math.random();
      const sleepMs = exponential + jitter;
      onRetry?.(attempt, normalized, sleepMs);
      await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }
  }
  throw normalizeError(lastError).error;
}

export interface CircuitBreakerState {
  state: "closed" | "open" | "half-open";
  failures: number;
  successes: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  nextAttemptAt?: number;
}

export interface CircuitBreakerPolicy {
  threshold: number;
  resetAfterMs: number;
  halfOpenMaxRequests: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = {
    state: "closed",
    failures: 0,
    successes: 0,
  };
  private halfOpenAttempts = 0;

  constructor(
    public readonly name: string,
    private readonly policy: CircuitBreakerPolicy,
  ) {}

  get snapshot(): CircuitBreakerState {
    return { ...this.state };
  }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (this.state.state === "open") {
      if (!this.state.nextAttemptAt || now < this.state.nextAttemptAt) {
        throw new ClawError({
          code: "SERVICE_UNAVAILABLE",
          category: "unavailable",
          message: `Circuit breaker ${this.name} is open.`,
          retryable: true,
          statusCode: 503,
          details: { nextAttemptAt: this.state.nextAttemptAt },
        });
      }
      this.state.state = "half-open";
      this.halfOpenAttempts = 0;
    }

    if (this.state.state === "half-open") {
      this.halfOpenAttempts += 1;
      if (this.halfOpenAttempts > this.policy.halfOpenMaxRequests) {
        throw new ClawError({
          code: "SERVICE_UNAVAILABLE",
          category: "unavailable",
          message: `Circuit breaker ${this.name} is half-open and has exhausted probes.`,
          retryable: true,
          statusCode: 503,
        });
      }
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
    this.state.successes += 1;
    this.state.failures = 0;
    this.state.lastSuccessAt = Date.now();
    this.state.state = "closed";
    this.state.nextAttemptAt = undefined;
  }

  recordFailure(_error: unknown): void {
    this.state.failures += 1;
    this.state.lastFailureAt = Date.now();
    if (this.state.failures >= this.policy.threshold) {
      this.state.state = "open";
      this.state.nextAttemptAt = Date.now() + this.policy.resetAfterMs;
    }
  }
}

export class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly policy: CircuitBreakerPolicy) {}

  get(name: string): CircuitBreaker {
    if (!this.breakers.has(name)) {
      this.breakers.set(name, new CircuitBreaker(name, this.policy));
    }
    return this.breakers.get(name)!;
  }

  snapshot(): Record<string, CircuitBreakerState> {
    return [...this.breakers.entries()].reduce<Record<string, CircuitBreakerState>>((acc, [name, breaker]) => {
      acc[name] = breaker.snapshot;
      return acc;
    }, {});
  }
}

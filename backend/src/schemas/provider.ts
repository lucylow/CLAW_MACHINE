export type ProviderKind = "llm" | "storage" | "embedding" | "cache" | "runtime";

export type ProviderStatus = "ready" | "degraded" | "offline" | "unknown";

export interface ProviderHealth {
  ok: boolean;
  status: ProviderStatus;
  latencyMs?: number;
  message?: string;
  checkedAt: string;
}

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetAfterMs: number;
}

export interface ProviderConfig {
  name: string;
  kind: ProviderKind;
  timeoutMs?: number;
  retry?: RetryPolicy;
  circuitBreaker?: CircuitBreakerConfig;
  tags?: Record<string, string>;
}

export interface ProviderInitResult {
  provider: string;
  ready: boolean;
  metadata?: Record<string, unknown>;
}

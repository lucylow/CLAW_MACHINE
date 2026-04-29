import type { ErrorCode } from "./codes";
import { createLogger, MemoryErrorReporter, type ErrorReporter, type Logger } from "./logging";
import { createMetrics, type MetricsClient } from "./metrics";
import { MemoryPanicSink, handlePanic, type PanicSink } from "./panic";
import { normalizeError } from "./normalize";
import { withRetry, type RetryPolicy, CircuitBreakerRegistry, type CircuitBreakerPolicy } from "./retry";
import { buildRecoveryPlan } from "./recovery";
import { ClawError, type ErrorContext } from "./shapes";

export function requireAdmin(context: ErrorContext, adminKeys: string[], providedKey?: string): void {
  if (!providedKey || !adminKeys.includes(providedKey)) {
    throw new ClawError({
      code: "FORBIDDEN",
      category: "authorization",
      message: "Admin access required.",
      statusCode: 403,
      retryable: false,
      context,
    });
  }
}

export function requirePresent<T>(value: T | null | undefined, name: string, context?: ErrorContext): T {
  if (value === null || value === undefined) {
    throw new ClawError({
      code: "NOT_FOUND",
      category: "not-found",
      message: `${name} not found.`,
      statusCode: 404,
      retryable: false,
      context,
      details: { name },
    });
  }
  return value;
}

export function requireCondition(
  condition: unknown,
  code: ErrorCode,
  message: string,
  context?: ErrorContext,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new ClawError({ code, message, context, details });
  }
}

export async function safeOperation<T>(
  label: string,
  operation: () => Promise<T>,
  deps: {
    logger?: Logger;
    metrics?: MetricsClient;
    breaker?: CircuitBreakerRegistry;
    retryPolicy?: RetryPolicy;
    context?: ErrorContext;
  },
): Promise<T> {
  const start = Date.now();
  const breaker = deps.breaker?.get(label);
  try {
    const run = async () => operation();
    const result = breaker ? await breaker.execute(run) : await run();
    deps.metrics?.timing(`operation.${label}.latency_ms`, Date.now() - start, { category: "success" });
    return result;
  } catch (error) {
    const normalized = normalizeError(error, deps.context).error;
    deps.metrics?.increment(`operation.${label}.error`, 1, { category: normalized.category, code: String(normalized.code) });
    deps.logger?.error(`Operation failed: ${label}`, { error: normalized.toJSON(), context: deps.context });
    throw normalized;
  }
}

export async function retryableOperation<T>(
  label: string,
  operation: () => Promise<T>,
  deps: {
    logger?: Logger;
    metrics?: MetricsClient;
    retryPolicy: RetryPolicy;
    context?: ErrorContext;
  },
): Promise<T> {
  const start = Date.now();
  const result = await withRetry(operation, deps.retryPolicy, deps.context, (attempt, err, sleepMs) => {
    deps.logger?.warn(`Retrying ${label}`, { attempt, sleepMs, error: err.toJSON(), context: deps.context });
    deps.metrics?.increment(`operation.${label}.retry`, 1, { attempt });
  });
  deps.metrics?.timing(`operation.${label}.latency_ms`, Date.now() - start, { category: "success" });
  return result;
}

export interface AgentRuntimeDependencies {
  logger: Logger;
  metrics: MetricsClient;
  breakerRegistry: CircuitBreakerRegistry;
  reporter: ErrorReporter;
  panicSink: PanicSink;
}

export async function runGuardedAgentStep<T>(
  label: string,
  context: ErrorContext,
  operation: () => Promise<T>,
  deps: AgentRuntimeDependencies,
): Promise<T> {
  return safeOperation(
    label,
    async () => {
      try {
        return await operation();
      } catch (error) {
        const normalized = normalizeError(error, context).error;
        await deps.reporter.report(normalized, context);
        if (buildRecoveryPlan(normalized).captureSnapshot) {
          await handlePanic(normalized, deps.panicSink, context);
        }
        throw normalized;
      }
    },
    {
      logger: deps.logger,
      metrics: deps.metrics,
      breaker: deps.breakerRegistry,
      context,
    },
  );
}

export async function runQueueStep<T>(
  label: string,
  context: ErrorContext,
  operation: () => Promise<T>,
  deps: AgentRuntimeDependencies,
): Promise<T> {
  return retryableOperation(label, operation, {
    logger: deps.logger,
    metrics: deps.metrics,
    retryPolicy: {
      attempts: 4,
      baseDelayMs: 500,
      maxDelayMs: 15_000,
      jitterRatio: 0.2,
      retryableCategories: [
        "timeout",
        "network",
        "storage",
        "queue",
        "compute",
        "chain",
        "memory",
        "dependency",
        "unavailable",
      ],
    },
    context,
  });
}

export interface MiddlewareBundle {
  logger: Logger;
  metrics: MetricsClient;
  breakerRegistry: CircuitBreakerRegistry;
  reporter: ErrorReporter;
  panicSink: PanicSink;
}

export function createMiddlewareBundle(config: {
  logLevel?: "debug" | "info" | "warn" | "error";
  circuitBreaker?: CircuitBreakerPolicy;
}): MiddlewareBundle {
  const logger = createLogger(config.logLevel ?? "info", { service: "claw-machine" });
  const metrics = createMetrics();
  const breakerRegistry = new CircuitBreakerRegistry(
    config.circuitBreaker ?? {
      threshold: 5,
      resetAfterMs: 30_000,
      halfOpenMaxRequests: 1,
    },
  );
  const reporter = new MemoryErrorReporter();
  const panicSink = new MemoryPanicSink();
  return { logger, metrics, breakerRegistry, reporter, panicSink };
}

export async function safePluginCall<T>(
  pluginName: string,
  phase: "init" | "start" | "stop" | "health",
  fn: () => Promise<T>,
  deps: { logger: Logger; metrics: MetricsClient; reporter: ErrorReporter; panicSink: PanicSink; context?: ErrorContext },
): Promise<T> {
  const label = `plugin.${pluginName}.${phase}`;
  const start = Date.now();
  try {
    const result = await fn();
    deps.metrics.timing(`${label}.latency_ms`, Date.now() - start, { outcome: "success" });
    return result;
  } catch (error) {
    const normalized = normalizeError(error, deps.context).error;
    deps.metrics.increment(`${label}.error`, 1, { code: String(normalized.code), category: normalized.category });
    deps.logger.error(`Plugin phase failed: ${pluginName}:${phase}`, { error: normalized.toJSON(), context: deps.context });
    await deps.reporter.report(normalized, deps.context);
    if (buildRecoveryPlan(normalized).captureSnapshot) {
      await handlePanic(normalized, deps.panicSink, deps.context);
    }
    throw normalized;
  }
}

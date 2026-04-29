import type { ErrorCategory, ErrorCode } from "./codes";
import { ClawError, isClawError, safeString, type ErrorContext } from "./shapes";

export interface NormalizedError {
  error: ClawError;
  publicMessage: string;
  internalMessage: string;
  shouldLogStack: boolean;
}

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function inferError(message: string): {
  code: ErrorCode | string;
  category: ErrorCategory;
  publicMessage: string;
  statusCode: number;
  retryable: boolean;
  details?: Record<string, unknown>;
} {
  const m = message.toLowerCase();
  if (/timeout|timed out|deadline exceeded/.test(m)) {
    return { code: "REQUEST_TIMEOUT", category: "timeout", publicMessage: "The request timed out.", statusCode: 504, retryable: true };
  }
  if (/rate limit|too many requests/.test(m)) {
    return { code: "RATE_LIMITED", category: "rate-limit", publicMessage: "Too many requests.", statusCode: 429, retryable: true };
  }
  if (/quota|limit exceeded/.test(m)) {
    return { code: "QUOTA_EXCEEDED", category: "quota", publicMessage: "Quota exceeded.", statusCode: 429, retryable: false };
  }
  if (/unauthorized|auth|invalid api key/.test(m)) {
    return { code: "UNAUTHORIZED", category: "authentication", publicMessage: "Authentication required.", statusCode: 401, retryable: false };
  }
  if (/forbidden|permission denied|not allowed/.test(m)) {
    return { code: "FORBIDDEN", category: "authorization", publicMessage: "You are not allowed to perform this action.", statusCode: 403, retryable: false };
  }
  if (/not found|missing/.test(m)) {
    return { code: "NOT_FOUND", category: "not-found", publicMessage: "Resource not found.", statusCode: 404, retryable: false };
  }
  if (/conflict|already exists|duplicate/.test(m)) {
    return { code: "CONFLICT", category: "conflict", publicMessage: "The request conflicts with current state.", statusCode: 409, retryable: false };
  }
  if (/chain|rpc|block|transaction/.test(m)) {
    return { code: "CHAIN_FAILURE", category: "chain", publicMessage: "Blockchain operation failed.", statusCode: 503, retryable: true };
  }
  if (/storage|file|disk|enoent|eacces/.test(m)) {
    return { code: "STORAGE_FAILURE", category: "storage", publicMessage: "Storage operation failed.", statusCode: 503, retryable: true };
  }
  if (/compute|inference|model|gpu/.test(m)) {
    return { code: "COMPUTE_FAILURE", category: "compute", publicMessage: "Compute operation failed.", statusCode: 503, retryable: true };
  }
  if (/queue|message broker|delivery/.test(m)) {
    return { code: "QUEUE_FAILURE", category: "queue", publicMessage: "Queue operation failed.", statusCode: 503, retryable: true };
  }
  if (/memory|snapshot|state/.test(m)) {
    return { code: "MEMORY_FAILURE", category: "memory", publicMessage: "Memory operation failed.", statusCode: 503, retryable: true };
  }
  if (/plugin/.test(m)) {
    return { code: "PLUGIN_FAILURE", category: "plugin", publicMessage: "A plugin failed.", statusCode: 500, retryable: false };
  }
  return {
    code: "INTERNAL_ERROR",
    category: "internal",
    publicMessage: "An unexpected error occurred.",
    statusCode: 500,
    retryable: false,
  };
}

export function normalizeError(error: unknown, context?: ErrorContext): NormalizedError {
  if (isClawError(error)) {
    return {
      error,
      publicMessage: error.message,
      internalMessage: error.message,
      shouldLogStack: !isProduction(),
    };
  }

  if (error instanceof AggregateError) {
    return normalizeError(error.errors[0] ?? new Error(error.message), context);
  }

  if (error instanceof SyntaxError) {
    const normalized = new ClawError({
      code: "VALIDATION_FAILED",
      message: "Malformed input or invalid JSON.",
      category: "validation",
      statusCode: 400,
      retryable: false,
      context,
      cause: error,
    });
    return {
      error: normalized,
      publicMessage: normalized.message,
      internalMessage: error.message,
      shouldLogStack: !isProduction(),
    };
  }

  if (error instanceof Error) {
    const inferred = inferError(error.message);
    const normalized = new ClawError({
      code: inferred.code,
      message: inferred.publicMessage,
      category: inferred.category,
      statusCode: inferred.statusCode,
      retryable: inferred.retryable,
      context,
      details: inferred.details,
      cause: error,
    });
    return {
      error: normalized,
      publicMessage: normalized.message,
      internalMessage: error.message,
      shouldLogStack: !isProduction(),
    };
  }

  const normalized = new ClawError({
    code: "INTERNAL_ERROR",
    message: "Unexpected failure.",
    category: "internal",
    statusCode: 500,
    retryable: false,
    context,
    details: { value: safeString(error) },
    cause: error,
  });
  return {
    error: normalized,
    publicMessage: normalized.message,
    internalMessage: safeString(error),
    shouldLogStack: !isProduction(),
  };
}

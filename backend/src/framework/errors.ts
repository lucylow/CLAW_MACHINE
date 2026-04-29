import type { ErrorCategory } from "./types";
import { createId, safeString } from "./util";

export class FrameworkError extends Error {
  id: string;
  category: ErrorCategory;
  code: string;
  retryable: boolean;
  statusCode: number;
  details?: Record<string, unknown>;
  cause?: unknown;

  constructor(input: {
    category: ErrorCategory;
    code: string;
    message: string;
    retryable?: boolean;
    statusCode?: number;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(input.message);
    this.name = "FrameworkError";
    this.id = createId("err");
    this.category = input.category;
    this.code = input.code;
    this.retryable = input.retryable ?? false;
    this.statusCode = input.statusCode ?? 500;
    this.details = input.details;
    this.cause = input.cause;
  }
}

export function isFrameworkError(error: unknown): error is FrameworkError {
  return error instanceof FrameworkError;
}

export function toFrameworkError(error: unknown, fallbackMessage = "Unexpected framework error"): FrameworkError {
  if (isFrameworkError(error)) return error;
  if (error instanceof Error) {
    return new FrameworkError({
      category: "internal",
      code: "INTERNAL_ERROR",
      message: error.message || fallbackMessage,
      retryable: false,
      statusCode: 500,
      cause: error,
    });
  }
  return new FrameworkError({
    category: "internal",
    code: "INTERNAL_ERROR",
    message: fallbackMessage,
    retryable: false,
    statusCode: 500,
    details: { value: error },
  });
}

export function classifyError(error: unknown): { category: ErrorCategory; retryable: boolean; statusCode: number } {
  const message = error instanceof Error ? error.message.toLowerCase() : safeString(error).toLowerCase();
  if (/timeout/.test(message)) return { category: "timeout", retryable: true, statusCode: 504 };
  if (/rate limit|too many requests/.test(message)) return { category: "rate-limit", retryable: true, statusCode: 429 };
  if (/quota|limit exceeded/.test(message)) return { category: "quota", retryable: false, statusCode: 429 };
  if (/auth|unauthorized|forbidden/.test(message)) return { category: "auth", retryable: false, statusCode: 401 };
  if (/validation|invalid/.test(message)) return { category: "validation", retryable: false, statusCode: 400 };
  if (/memory/.test(message)) return { category: "memory", retryable: true, statusCode: 500 };
  if (/queue/.test(message)) return { category: "queue", retryable: true, statusCode: 503 };
  if (/chain|rpc|block/.test(message)) return { category: "chain", retryable: true, statusCode: 503 };
  if (/storage|file|io/.test(message)) return { category: "storage", retryable: true, statusCode: 503 };
  if (/compute|model|inference/.test(message)) return { category: "compute", retryable: true, statusCode: 503 };
  return { category: "internal", retryable: false, statusCode: 500 };
}

export function wrapError(error: unknown, code = "UNHANDLED_ERROR"): FrameworkError {
  if (isFrameworkError(error)) return error;
  const classification = classifyError(error);
  return new FrameworkError({
    category: classification.category,
    code,
    message: error instanceof Error ? error.message : safeString(error) || "Unknown error",
    retryable: classification.retryable,
    statusCode: classification.statusCode,
    cause: error,
  });
}

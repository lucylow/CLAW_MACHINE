import type { ErrorCategory, ErrorCode } from "./codes";
import { ERROR_SPECS } from "./codes";
import { createErrorId } from "./factory";

export interface ErrorContext {
  requestId?: string;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
  turnId?: string;
  userId?: string;
  actor?: string;
  route?: string;
  method?: string;
  service?: string;
  operation?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface StructuredErrorPayload {
  id: string;
  code: string;
  category: ErrorCategory;
  message: string;
  statusCode: number;
  retryable: boolean;
  context?: ErrorContext;
  details?: Record<string, unknown>;
  cause?: string;
  stack?: string;
  timestamp: string;
}

export class ClawError extends Error {
  readonly id: string;
  readonly code: ErrorCode | string;
  readonly category: ErrorCategory;
  readonly statusCode: number;
  readonly retryable: boolean;
  readonly context?: ErrorContext;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
  readonly timestamp: string;

  constructor(input: {
    code: ErrorCode | string;
    message?: string;
    category?: ErrorCategory;
    statusCode?: number;
    retryable?: boolean;
    context?: ErrorContext;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    const spec = ERROR_SPECS[input.code as ErrorCode];
    super(input.message ?? spec?.defaultMessage ?? "Unexpected error");
    this.name = "ClawError";
    this.id = createErrorId();
    this.code = input.code;
    this.category = input.category ?? spec?.category ?? "internal";
    this.statusCode = input.statusCode ?? spec?.httpStatus ?? 500;
    this.retryable = input.retryable ?? spec?.retryable ?? false;
    this.context = input.context;
    this.details = input.details;
    this.cause = input.cause;
    this.timestamp = new Date().toISOString();
  }

  toJSON(): StructuredErrorPayload {
    return {
      id: this.id,
      code: String(this.code),
      category: this.category,
      message: this.message,
      statusCode: this.statusCode,
      retryable: this.retryable,
      context: this.context,
      details: this.details,
      cause: this.cause instanceof Error ? this.cause.message : safeString(this.cause),
      stack: process.env.NODE_ENV === "production" ? undefined : this.stack,
      timestamp: this.timestamp,
    };
  }
}

export function isClawError(error: unknown): error is ClawError {
  return error instanceof ClawError;
}

export function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function errorToRecord(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === "production" ? undefined : error.stack,
    };
  }
  return { value: safeString(error) };
}

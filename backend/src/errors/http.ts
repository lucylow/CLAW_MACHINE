import { normalizeError } from "./normalize";
import type { ErrorContext, StructuredErrorPayload } from "./shapes";

export function errorToHttp(error: unknown, context?: ErrorContext): { statusCode: number; body: StructuredErrorPayload } {
  const normalized = normalizeError(error, context);
  return {
    statusCode: normalized.error.statusCode,
    body: normalized.error.toJSON(),
  };
}

export function sendHttpError(res: ResponseLike, error: unknown, context?: ErrorContext): void {
  const { statusCode, body } = errorToHttp(error, context);
  res.status(statusCode).json({
    ok: false,
    error: {
      id: body.id,
      code: body.code,
      category: body.category,
      message: body.message,
      retryable: body.retryable,
      details: body.details,
    },
    meta: {
      requestId: body.context?.requestId,
      traceId: body.context?.traceId,
      spanId: body.context?.spanId,
      generatedAt: body.timestamp,
    },
  });
}

export interface ResponseLike {
  status(code: number): ResponseLike;
  json(value: unknown): void;
  setHeader(name: string, value: string): void;
}

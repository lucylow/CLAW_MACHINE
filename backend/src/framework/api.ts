import type { ApiEnvelope, RequestContext } from "./types";
import { wrapError } from "./errors";
import { nowIso } from "./util";

export function success<T>(data: T, ctx?: RequestContext): ApiEnvelope<T> {
  return {
    ok: true,
    data,
    meta: {
      requestId: ctx?.requestId,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      generatedAt: nowIso(),
    },
  };
}

export function failure(error: unknown, ctx?: RequestContext): ApiEnvelope<never> {
  const wrapped = wrapError(error);
  return {
    ok: false,
    error: {
      id: wrapped.id,
      code: wrapped.code,
      category: wrapped.category,
      message: wrapped.message,
      retryable: wrapped.retryable,
      details: wrapped.details,
    },
    meta: {
      requestId: ctx?.requestId,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
      generatedAt: nowIso(),
    },
  };
}

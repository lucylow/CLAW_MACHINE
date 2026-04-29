import { createErrorId } from "./factory";
import { sendHttpError, type ResponseLike } from "./http";
import { normalizeError } from "./normalize";
import type { Logger } from "./logging";
import type { MetricsClient } from "./metrics";
import type { ErrorContext } from "./shapes";

export interface RequestLike {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  body?: unknown;
}

export function buildRequestContext(req: RequestLike, patch?: Partial<ErrorContext>): ErrorContext {
  const requestId = String(req.headers["x-request-id"] ?? createErrorId());
  const traceId = String(req.headers["x-trace-id"] ?? createErrorId());
  const spanId = String(req.headers["x-span-id"] ?? createErrorId());
  return {
    requestId,
    traceId,
    spanId,
    route: req.path,
    method: req.method,
    ...patch,
  };
}

export async function withHttpBoundary<T>(
  res: ResponseLike,
  operation: () => Promise<T>,
  context?: ErrorContext,
): Promise<T | undefined> {
  try {
    return await operation();
  } catch (error) {
    sendHttpError(res, error, context);
    return undefined;
  }
}

export type ApiHandler<TReq, TRes> = (req: TReq, res: TRes, ctx: ErrorContext) => Promise<void> | void;

export function wrapApiHandler<TReq extends RequestLike, TRes extends ResponseLike>(
  handler: ApiHandler<TReq, TRes>,
  deps: {
    logger?: Logger;
    metrics?: MetricsClient;
  },
): (req: TReq, res: TRes) => Promise<void> {
  return async (req: TReq, res: TRes) => {
    const ctx = buildRequestContext(req);
    try {
      await handler(req, res, ctx);
    } catch (error) {
      const normalized = normalizeError(error, ctx).error;
      deps.logger?.error("API handler failed", { error: normalized.toJSON(), context: ctx });
      deps.metrics?.increment("api.handler.error", 1, { route: ctx.route ?? "unknown", code: String(normalized.code) });
      sendHttpError(res, normalized, ctx);
    }
  };
}

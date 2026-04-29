import type { RequestContext, RequestContextStore } from "./types";
import { createId, nowMs } from "./util";

class AsyncLocalContextStore implements RequestContextStore {
  private current: RequestContext | null = null;

  set(context: RequestContext): void {
    this.current = context;
  }

  get(): RequestContext | null {
    return this.current;
  }

  clear(): void {
    this.current = null;
  }

  fork(patch?: Partial<RequestContext>): RequestContext {
    const parent = this.current;
    const context: RequestContext = {
      requestId: patch?.requestId ?? parent?.requestId ?? createId("req"),
      traceId: patch?.traceId ?? parent?.traceId ?? createId("trace"),
      spanId: patch?.spanId ?? createId("span"),
      parentSpanId: patch?.parentSpanId ?? parent?.spanId,
      userId: patch?.userId ?? parent?.userId,
      sessionId: patch?.sessionId ?? parent?.sessionId,
      turnId: patch?.turnId ?? parent?.turnId,
      actor: patch?.actor ?? parent?.actor,
      route: patch?.route ?? parent?.route,
      tags: patch?.tags ?? parent?.tags,
      startTime: patch?.startTime ?? nowMs(),
      deadline: patch?.deadline ?? parent?.deadline,
      metadata: { ...(parent?.metadata ?? {}), ...(patch?.metadata ?? {}) },
    };
    this.current = context;
    return context;
  }
}

export function createContextStore(): RequestContextStore {
  return new AsyncLocalContextStore();
}

export function buildContextFromHeaders(headers: Record<string, string | string[] | undefined>): RequestContext {
  const requestId = String(headers["x-request-id"] ?? headers["x-requestid"] ?? createId("req"));
  const traceId = String(headers["x-trace-id"] ?? headers["x-traceid"] ?? createId("trace"));
  const spanId = String(headers["x-span-id"] ?? headers["x-spanid"] ?? createId("span"));
  const sessionId = headers["x-session-id"] ? String(headers["x-session-id"]) : undefined;
  const turnId = headers["x-turn-id"] ? String(headers["x-turn-id"]) : undefined;
  const actor = headers["x-actor"] ? String(headers["x-actor"]) : undefined;

  return {
    requestId,
    traceId,
    spanId,
    sessionId,
    turnId,
    actor,
    startTime: nowMs(),
    metadata: {},
  };
}

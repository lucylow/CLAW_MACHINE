/**
 * Server-Sent Events (SSE) helpers.
 * Enables real-time streaming of agent turn phases to the frontend.
 */
import type { Request, Response } from "express";

export interface SseClient {
  send(event: string, data: unknown): void;
  close(): void;
}

export function initSse(req: Request, res: Response): SseClient {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();

  // Heartbeat to keep connection alive through proxies
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 15_000);

  req.on("close", () => clearInterval(heartbeat));

  return {
    send(event: string, data: unknown) {
      const payload = typeof data === "string" ? data : JSON.stringify(data);
      res.write(`event: ${event}\ndata: ${payload}\n\n`);
    },
    close() {
      clearInterval(heartbeat);
      res.end();
    },
  };
}

/** Emit a structured agent phase event */
export function emitPhase(
  sse: SseClient,
  phase: string,
  payload: Record<string, unknown> = {},
) {
  sse.send("phase", { phase, timestamp: Date.now(), ...payload });
}

/** Emit the final result and close the stream */
export function emitResult(sse: SseClient, result: unknown) {
  sse.send("result", result);
  sse.send("done", { timestamp: Date.now() });
  sse.close();
}

/** Emit an error and close the stream */
export function emitError(sse: SseClient, code: string, message: string) {
  sse.send("error", { code, message, timestamp: Date.now() });
  sse.close();
}

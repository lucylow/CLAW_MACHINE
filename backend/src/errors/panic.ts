import { createErrorId } from "./factory";
import { normalizeError } from "./normalize";
import type { ErrorContext, StructuredErrorPayload } from "./shapes";

export interface PanicReport {
  panicId: string;
  fatal: boolean;
  reason: string;
  error: StructuredErrorPayload;
  context?: ErrorContext;
  occurredAt: string;
}

export interface PanicSink {
  write(report: PanicReport): Promise<void>;
}

export class MemoryPanicSink implements PanicSink {
  readonly reports: PanicReport[] = [];
  async write(report: PanicReport): Promise<void> {
    this.reports.push(report);
  }
}

export function createPanicReport(error: unknown, context?: ErrorContext, fatal = true): PanicReport {
  const normalized = normalizeError(error, context);
  return {
    panicId: createErrorId(),
    fatal,
    reason: normalized.publicMessage,
    error: normalized.error.toJSON(),
    context,
    occurredAt: new Date().toISOString(),
  };
}

export async function handlePanic(error: unknown, sink: PanicSink, context?: ErrorContext): Promise<PanicReport> {
  const report = createPanicReport(error, context, true);
  await sink.write(report);
  return report;
}

export interface ErrorSnapshot {
  at: string;
  error: StructuredErrorPayload;
  context?: ErrorContext;
  metadata?: Record<string, unknown>;
}

export function createErrorSnapshot(error: unknown, context?: ErrorContext, metadata?: Record<string, unknown>): ErrorSnapshot {
  const normalized = normalizeError(error, context).error;
  return {
    at: new Date().toISOString(),
    error: normalized.toJSON(),
    context,
    metadata,
  };
}

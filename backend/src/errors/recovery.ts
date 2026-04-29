import { createErrorId } from "./factory";
import { normalizeError } from "./normalize";
import { createPanicReport, handlePanic, type PanicReport, type PanicSink } from "./panic";
import { safeString, errorToRecord, type ClawError, type ErrorContext, type StructuredErrorPayload } from "./shapes";

export interface RecoveryAction {
  name: string;
  description: string;
  retryable: boolean;
  perform: () => Promise<void>;
}

export interface RecoveryPlan {
  actions: RecoveryAction[];
  quarantine: boolean;
  notifyHuman: boolean;
  captureSnapshot: boolean;
}

export function buildRecoveryPlan(error: ClawError): RecoveryPlan {
  switch (error.category) {
    case "validation":
      return { actions: [], quarantine: false, notifyHuman: false, captureSnapshot: false };
    case "authentication":
    case "authorization":
      return { actions: [], quarantine: false, notifyHuman: true, captureSnapshot: true };
    case "rate-limit":
    case "timeout":
    case "network":
    case "storage":
    case "compute":
    case "chain":
    case "queue":
    case "memory":
    case "dependency":
      return {
        actions: [],
        quarantine: false,
        notifyHuman: false,
        captureSnapshot: true,
      };
    case "plugin":
    case "internal":
    case "panic":
      return {
        actions: [],
        quarantine: true,
        notifyHuman: true,
        captureSnapshot: true,
      };
    default:
      return { actions: [], quarantine: true, notifyHuman: true, captureSnapshot: true };
  }
}

export async function recoverFromError(
  error: unknown,
  sink: PanicSink,
  context?: ErrorContext,
): Promise<{ error: ClawError; recovery: RecoveryPlan; panic?: PanicReport }> {
  const normalized = normalizeError(error, context).error;
  const recovery = buildRecoveryPlan(normalized);
  let panic: PanicReport | undefined;
  if (recovery.captureSnapshot && recovery.quarantine) {
    panic = await handlePanic(normalized, sink, context);
  }
  return { error: normalized, recovery, panic };
}

export type ServiceKind = "storage" | "compute" | "chain" | "queue" | "memory" | "dependency" | "internal";

export interface HealthCheckResult {
  name: string;
  kind: ServiceKind;
  status: "healthy" | "unhealthy";
  latencyMs: number;
  checkedAt: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface DependencyCheck {
  name: string;
  kind: ServiceKind;
  probe: () => Promise<void>;
}

export async function healthProbe(name: string, kind: ServiceKind, probe: () => Promise<void>): Promise<HealthCheckResult> {
  const start = Date.now();
  try {
    await probe();
    return {
      name,
      kind,
      status: "healthy",
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: "ok",
    };
  } catch (error) {
    return {
      name,
      kind,
      status: "unhealthy",
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: safeString(error),
      details: { error: errorToRecord(error) },
    };
  }
}

export async function probeDependencies(checks: DependencyCheck[]): Promise<HealthCheckResult[]> {
  const results: HealthCheckResult[] = [];
  for (const check of checks) {
    results.push(await healthProbe(check.name, check.kind, check.probe));
  }
  return results;
}

export interface QuarantineItem {
  id: string;
  reason: string;
  error: StructuredErrorPayload;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export class QuarantineStore {
  private items: QuarantineItem[] = [];

  add(error: ClawError, reason: string, metadata?: Record<string, unknown>): QuarantineItem {
    const item: QuarantineItem = {
      id: createErrorId(),
      reason,
      error: error.toJSON(),
      createdAt: new Date().toISOString(),
      metadata,
    };
    this.items.push(item);
    return item;
  }

  list(): QuarantineItem[] {
    return [...this.items];
  }
}

export async function quarantineOnFailure(
  error: unknown,
  quarantine: QuarantineStore,
  sink: PanicSink,
  context?: ErrorContext,
): Promise<QuarantineItem> {
  const normalized = normalizeError(error, context).error;
  const item = quarantine.add(normalized, "framework quarantine", context?.metadata);
  await sink.write(createPanicReport(normalized, context, true));
  return item;
}
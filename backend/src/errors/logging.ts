import { normalizeError } from "./normalize";
import type { ClawError, ErrorContext, StructuredErrorPayload } from "./shapes";

export function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(",")}}`;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface ErrorReporter {
  report(error: ClawError, context?: ErrorContext): Promise<void>;
}

export class MemoryErrorReporter implements ErrorReporter {
  readonly entries: Array<{ error: StructuredErrorPayload; context?: ErrorContext }> = [];
  async report(error: ClawError, context?: ErrorContext): Promise<void> {
    this.entries.push({ error: error.toJSON(), context });
  }
}

export class ConsoleLogger implements Logger {
  constructor(
    private readonly bindings: Record<string, unknown> = {},
    private readonly level: "debug" | "info" | "warn" | "error" = "info",
  ) {}

  child(bindings: Record<string, unknown>): Logger {
    return new ConsoleLogger({ ...this.bindings, ...bindings }, this.level);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    if (this.level !== "debug") return;
    this.write("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (["debug", "info"].includes(this.level)) this.write("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (["debug", "info", "warn"].includes(this.level)) this.write("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.write("error", message, context);
  }

  private write(level: "debug" | "info" | "warn" | "error", message: string, context?: Record<string, unknown>): void {
    const record = {
      ts: new Date().toISOString(),
      level,
      message,
      context: { ...this.bindings, ...(context ?? {}) },
    };
    const line = stableJson(record);
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);
  }
}

export function createLogger(level: "debug" | "info" | "warn" | "error" = "info", bindings?: Record<string, unknown>): Logger {
  return new ConsoleLogger(bindings, level);
}

export async function reportError(error: unknown, reporter: ErrorReporter, context?: ErrorContext): Promise<ClawError> {
  const normalized = normalizeError(error, context).error;
  await reporter.report(normalized, context);
  return normalized;
}

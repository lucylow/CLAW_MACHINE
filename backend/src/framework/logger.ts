import type { LogLevel, LogRecord, Logger } from "./types";
import { nowIso, stableJson } from "./util";

class ConsoleLogger implements Logger {
  constructor(
    private readonly bindings: Record<string, unknown> = {},
    private readonly level: LogLevel = "info",
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

  private write(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const record: LogRecord = {
      ts: nowIso(),
      level,
      message,
      context: { ...this.bindings, ...(context ?? {}) },
    };
    const out = stableJson(record);
    if (level === "error") console.error(out);
    else if (level === "warn") console.warn(out);
    else console.log(out);
  }
}

export function createLogger(level: LogLevel, bindings?: Record<string, unknown>): Logger {
  return new ConsoleLogger(bindings, level);
}

import crypto from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function nowMs(): number {
  return Date.now();
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(8).toString("hex")}`;
}

export function stableJson(value: unknown): string {
  const seen = new WeakSet<object>();
  const replacer = (_key: string, val: unknown): unknown => {
    if (val && typeof val === "object") {
      if (seen.has(val as object)) return "[Circular]";
      seen.add(val as object);
      if (!Array.isArray(val)) {
        return Object.keys(val as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = (val as Record<string, unknown>)[key];
            return acc;
          }, {});
      }
    }
    return val;
  };
  return JSON.stringify(value, replacer);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeLogLevel(value: string | undefined, fallback: import("./types").LogLevel = "info"): import("./types").LogLevel {
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if (lower === "debug" || lower === "info" || lower === "warn" || lower === "error") return lower;
  return fallback;
}

export function toBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function parseCsv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).toString();
  } catch {
    return value;
  }
}

export function isLikelyUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || /^wss?:\/\//i.test(value);
}

export function hashString(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function stableFlagObject(input: Record<string, boolean>): Record<string, boolean> {
  return Object.keys(input)
    .sort()
    .reduce<Record<string, boolean>>((acc, key) => {
      acc[key] = input[key];
      return acc;
    }, {});
}

export function errorToRecord(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: error };
}

export function safeString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return "[Object]";
  }
}

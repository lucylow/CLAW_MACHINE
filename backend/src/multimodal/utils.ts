import crypto from "node:crypto";
import type { MultimodalAsset } from "./types";
import type { MultimodalErrorShape } from "./types";
import type { MultimodalRequest } from "./types";

export function nowIso(): string {
  return new Date().toISOString();
}

export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(10).toString("hex")}`;
}

export function sha256(bytes: Buffer | string): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function isProbablyImageMime(mimeType: string): boolean {
  return /^image\//i.test(mimeType);
}

export function isProbablyAudioMime(mimeType: string): boolean {
  return /^audio\//i.test(mimeType);
}

export function safeString(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function normalizeWords(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'")
    .trim();
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function summarizeText(text: string, max = 220): string {
  const clean = normalizeWords(text);
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

export function deepMerge<A extends Record<string, unknown>, B extends Record<string, unknown>>(a: A, b: B): A & B {
  const out: Record<string, unknown> = { ...a };
  for (const [key, value] of Object.entries(b)) {
    const existing = out[key];
    if (
      existing &&
      typeof existing === "object" &&
      !Array.isArray(existing) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      out[key] = deepMerge(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else {
      out[key] = value;
    }
  }
  return out as A & B;
}

export function buildError(
  code: string,
  message: string,
  category: MultimodalErrorShape["category"],
  details?: Record<string, unknown>,
  recoverable = true,
  retryable = false,
): MultimodalErrorShape {
  return { code, message, category, details, recoverable, retryable };
}

export function assert(condition: unknown, error: MultimodalErrorShape): asserts condition {
  if (!condition) {
    throw Object.assign(new Error(error.message), { multimodalError: error });
  }
}

export function parseMaybeJson(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function tokenize(text: string): string[] {
  return normalizeWords(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export function collectAssets(request: MultimodalRequest): MultimodalAsset[] {
  const assets: MultimodalAsset[] = [];
  if (request.image) assets.push(request.image);
  if (request.audio) assets.push(request.audio);
  if (request.images?.length) assets.push(...request.images);
  if (request.audios?.length) assets.push(...request.audios);
  if (request.attachments?.length) assets.push(...request.attachments);
  return assets;
}

export function confidenceToBand(n: number): "low" | "medium" | "high" {
  if (n >= 0.75) return "high";
  if (n >= 0.45) return "medium";
  return "low";
}

export function uniqueStepId(seen: Set<string>, base: string): string {
  let id = base;
  let counter = 1;
  while (seen.has(id)) {
    counter += 1;
    id = `${base}_${counter}`;
  }
  seen.add(id);
  return id;
}

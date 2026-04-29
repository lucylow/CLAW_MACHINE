import crypto from "crypto";
import type { MediaKind, MultimodalAsset } from "./types.js";

export function now(): number {
  return Date.now();
}

export function uuid(prefix = "id"): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function sha256(input: string | Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}

export function normalizeText(value: unknown): string {
  if (typeof value === "string") return value.trim().replace(/\s+/g, " ");
  if (value === null || value === undefined) return "";
  return String(value).trim().replace(/\s+/g, " ");
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function firstSentence(text: string, maxLen = 180): string {
  const t = normalizeText(text);
  if (!t) return "";
  const idx = t.indexOf(".");
  const s = idx > 0 ? t.slice(0, idx + 1) : t;
  return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}...`;
}

export function toUint8Array(data: MultimodalAsset["data"]): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(data)) return new Uint8Array(data);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (typeof data === "string") return new TextEncoder().encode(data);
  return new Uint8Array();
}

export function assetSizeBytes(asset: MultimodalAsset): number {
  if (typeof asset.sizeBytes === "number") return asset.sizeBytes;
  const bytes = toUint8Array(asset.data);
  return bytes.byteLength;
}

export function assetSha256(asset: MultimodalAsset): string {
  if (asset.sha256) return asset.sha256;
  const bytes = toUint8Array(asset.data);
  return sha256(bytes);
}

export function assetKindFromMimeType(mimeType: string): MediaKind {
  const mt = mimeType.toLowerCase();
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("audio/")) return "audio";
  if (mt.startsWith("video/")) return "video";
  return "text";
}

export function summarizeJson(value: unknown, maxLen = 220): string {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    text = String(value);
  }
  return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}...`;
}

export function safeJsonParse<T = unknown>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function buildAssetLabel(asset: MultimodalAsset): string {
  const name = asset.filename || asset.id;
  const kind = asset.kind;
  const mime = asset.mimeType;
  const extra: string[] = [];
  if (asset.width && asset.height) extra.push(`${asset.width}x${asset.height}`);
  if (asset.durationMs) extra.push(`${Math.round(asset.durationMs)}ms`);
  if (asset.sampleRateHz) extra.push(`${asset.sampleRateHz}Hz`);
  return [name, kind, mime, ...extra].filter(Boolean).join(" · ");
}

export function normalizeTags(tags: string[] = []): string[] {
  return unique(tags.map((t) => normalizeText(t).toLowerCase()).filter(Boolean));
}

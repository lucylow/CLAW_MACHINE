"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.now = now;
exports.uuid = uuid;
exports.sha256 = sha256;
exports.clamp = clamp;
exports.normalizeText = normalizeText;
exports.tokenize = tokenize;
exports.unique = unique;
exports.firstSentence = firstSentence;
exports.toUint8Array = toUint8Array;
exports.assetSizeBytes = assetSizeBytes;
exports.assetSha256 = assetSha256;
exports.assetKindFromMimeType = assetKindFromMimeType;
exports.summarizeJson = summarizeJson;
exports.safeJsonParse = safeJsonParse;
exports.buildAssetLabel = buildAssetLabel;
exports.normalizeTags = normalizeTags;
const crypto_1 = __importDefault(require("crypto"));
function now() {
    return Date.now();
}
function uuid(prefix = "id") {
    return `${prefix}_${crypto_1.default.randomUUID()}`;
}
function sha256(input) {
    return crypto_1.default.createHash("sha256").update(input).digest("hex");
}
function clamp(n, min = 0, max = 1) {
    return Math.max(min, Math.min(max, n));
}
function normalizeText(value) {
    if (typeof value === "string")
        return value.trim().replace(/\s+/g, " ");
    if (value === null || value === undefined)
        return "";
    return String(value).trim().replace(/\s+/g, " ");
}
function tokenize(text) {
    return normalizeText(text)
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
}
function unique(items) {
    return [...new Set(items)];
}
function firstSentence(text, maxLen = 180) {
    const t = normalizeText(text);
    if (!t)
        return "";
    const idx = t.indexOf(".");
    const s = idx > 0 ? t.slice(0, idx + 1) : t;
    return s.length <= maxLen ? s : `${s.slice(0, maxLen - 1)}...`;
}
function toUint8Array(data) {
    if (data instanceof Uint8Array)
        return data;
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(data))
        return new Uint8Array(data);
    if (data instanceof ArrayBuffer)
        return new Uint8Array(data);
    if (typeof data === "string")
        return new TextEncoder().encode(data);
    return new Uint8Array();
}
function assetSizeBytes(asset) {
    if (typeof asset.sizeBytes === "number")
        return asset.sizeBytes;
    const bytes = toUint8Array(asset.data);
    return bytes.byteLength;
}
function assetSha256(asset) {
    if (asset.sha256)
        return asset.sha256;
    const bytes = toUint8Array(asset.data);
    return sha256(bytes);
}
function assetKindFromMimeType(mimeType) {
    const mt = mimeType.toLowerCase();
    if (mt.startsWith("image/"))
        return "image";
    if (mt.startsWith("audio/"))
        return "audio";
    if (mt.startsWith("video/"))
        return "video";
    return "text";
}
function summarizeJson(value, maxLen = 220) {
    let text;
    try {
        text = JSON.stringify(value);
    }
    catch {
        text = String(value);
    }
    return text.length <= maxLen ? text : `${text.slice(0, maxLen - 1)}...`;
}
function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    }
    catch {
        return fallback;
    }
}
function buildAssetLabel(asset) {
    const name = asset.filename || asset.id;
    const kind = asset.kind;
    const mime = asset.mimeType;
    const extra = [];
    if (asset.width && asset.height)
        extra.push(`${asset.width}x${asset.height}`);
    if (asset.durationMs)
        extra.push(`${Math.round(asset.durationMs)}ms`);
    if (asset.sampleRateHz)
        extra.push(`${asset.sampleRateHz}Hz`);
    return [name, kind, mime, ...extra].filter(Boolean).join(" · ");
}
function normalizeTags(tags = []) {
    return unique(tags.map((t) => normalizeText(t).toLowerCase()).filter(Boolean));
}

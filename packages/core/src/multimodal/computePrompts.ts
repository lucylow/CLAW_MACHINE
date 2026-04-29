import type { MultimodalAsset, MultimodalProcessContext } from "./types.js";
import { buildAssetLabel, summarizeJson } from "./utils.js";

export function buildImagePrompt(asset: MultimodalAsset, context: MultimodalProcessContext): string {
  const label = buildAssetLabel(asset);
  return [
    "You are a multimodal perception model for an autonomous agent.",
    "Describe the image in concise but useful detail.",
    "Extract text visible in the image when possible.",
    "Mention objects, UI elements, charts, screenshots, diagrams, and any visible errors.",
    "Return compact plain text, not a long essay.",
    "",
    `Session: ${context.sessionId}`,
    `Request: ${context.requestId}`,
    context.walletAddress ? `Wallet: ${context.walletAddress}` : "",
    `Asset: ${label}`,
    `User text: ${context.userText || ""}`,
    `Context: ${summarizeJson(context.context || {}, 400)}`,
  ].join("\n");
}

export function buildAudioPrompt(asset: MultimodalAsset, context: MultimodalProcessContext): string {
  const label = buildAssetLabel(asset);
  return [
    "You are a multimodal audio understanding model for an autonomous agent.",
    "Transcribe the audio if possible.",
    "Then summarize the content in a short actionable description.",
    "Mention speaker intent, errors, commands, or important spoken details.",
    "Return compact plain text, not a long essay.",
    "",
    `Session: ${context.sessionId}`,
    `Request: ${context.requestId}`,
    context.walletAddress ? `Wallet: ${context.walletAddress}` : "",
    `Asset: ${label}`,
    `User text: ${context.userText || ""}`,
    `Context: ${summarizeJson(context.context || {}, 400)}`,
  ].join("\n");
}

export function buildMixedPrompt(context: MultimodalProcessContext): string {
  const assetLines = context.assets.map((asset) => `- ${buildAssetLabel(asset)}`).join("\n");
  return [
    "You are a multimodal agent preprocessing pipeline.",
    "You will receive a mixed set of inputs.",
    "For each asset, produce a compact description or transcript-like summary.",
    "Then produce an overall synthesis that helps downstream reasoning.",
    "",
    `Session: ${context.sessionId}`,
    `Request: ${context.requestId}`,
    context.walletAddress ? `Wallet: ${context.walletAddress}` : "",
    `User text: ${context.userText || ""}`,
    "Assets:",
    assetLines,
    "",
    `Context: ${summarizeJson(context.context || {}, 500)}`,
  ].join("\n");
}

export function buildReasoningPrompt(context: MultimodalProcessContext): string {
  const descriptions = context.descriptions.length ? context.descriptions.join("\n") : "none";
  return [
    "You are CLAW MACHINE, an agent that reasons over text, images, audio, and memory.",
    "Use the multimodal descriptions below as grounding.",
    "Answer the user's request directly and include the next best action when appropriate.",
    "",
    `Session: ${context.sessionId}`,
    `Request: ${context.requestId}`,
    context.walletAddress ? `Wallet: ${context.walletAddress}` : "",
    `User text: ${context.userText || ""}`,
    `Normalized text: ${context.normalizedText || ""}`,
    "",
    "Multimodal descriptions:",
    descriptions,
    "",
    context.transcript ? `Transcript:\n${context.transcript}` : "",
    context.summary ? `Summary:\n${context.summary}` : "",
    `Context: ${summarizeJson(context.context || {}, 500)}`,
  ].join("\n");
}

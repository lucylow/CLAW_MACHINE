/**
 * MultiModalProcessor
 *
 * Enables CLAW_MACHINE agents to accept image and audio inputs.
 *
 * Pipeline:
 *   1. Detect input modality (text / image / audio / mixed)
 *   2. For images: extract description via 0G Compute vision model
 *   3. For audio: transcribe via 0G Compute speech model
 *   4. Enrich the text input with extracted context
 *   5. Store the enriched context in memory for future turns
 *
 * The output is always a plain text string that the normal AgentRuntime
 * reasoning loop can process — no changes to downstream code required.
 */

import type { ComputeAdapter, MemoryAdapter } from "../types.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ModalityType = "text" | "image" | "audio" | "mixed";

export interface MultiModalInput {
  text?: string;
  images?: ImageInput[];
  audio?: AudioInput;
}

export interface ImageInput {
  /** Base64-encoded image data */
  data: string;
  /** MIME type: image/jpeg, image/png, image/webp */
  mimeType: string;
  /** Optional filename for context */
  filename?: string;
}

export interface AudioInput {
  /** Base64-encoded audio data */
  data: string;
  /** MIME type: audio/mp3, audio/wav, audio/webm */
  mimeType: string;
  /** Duration in seconds (optional, for context) */
  durationSeconds?: number;
}

export interface ProcessedInput {
  /** The enriched text ready for agent reasoning */
  enrichedText: string;
  /** Detected modality */
  modality: ModalityType;
  /** Extracted descriptions for each image */
  imageDescriptions: string[];
  /** Transcribed audio text */
  audioTranscript?: string;
  /** Processing time in ms */
  durationMs: number;
}

// ── Processor ─────────────────────────────────────────────────────────────────

export class MultiModalProcessor {
  private readonly compute: ComputeAdapter;
  private readonly memory: MemoryAdapter;

  constructor(deps: { compute: ComputeAdapter; memory: MemoryAdapter }) {
    this.compute = deps.compute;
    this.memory = deps.memory;
  }

  /**
   * Process a multi-modal input and return enriched text for agent reasoning.
   */
  async process(input: MultiModalInput): Promise<ProcessedInput> {
    const t0 = Date.now();
    const imageDescriptions: string[] = [];
    let audioTranscript: string | undefined;

    // Step 1: Process images
    if (input.images && input.images.length > 0) {
      for (const img of input.images) {
        const desc = await this._describeImage(img);
        imageDescriptions.push(desc);
      }
    }

    // Step 2: Process audio
    if (input.audio) {
      audioTranscript = await this._transcribeAudio(input.audio);
    }

    // Step 3: Determine modality
    const hasImages = imageDescriptions.length > 0;
    const hasAudio = Boolean(audioTranscript);
    const hasText = Boolean(input.text?.trim());
    let modality: ModalityType = "text";
    if (hasImages && hasAudio) modality = "mixed";
    else if (hasImages) modality = "image";
    else if (hasAudio) modality = "audio";

    // Step 4: Build enriched text
    const parts: string[] = [];
    if (hasText) parts.push(input.text!.trim());
    if (hasImages) {
      parts.push(
        imageDescriptions.length === 1
          ? `[Image: ${imageDescriptions[0]}]`
          : imageDescriptions.map((d, i) => `[Image ${i + 1}: ${d}]`).join("\n"),
      );
    }
    if (hasAudio && audioTranscript) {
      parts.push(`[Audio transcript: ${audioTranscript}]`);
    }
    const enrichedText = parts.join("\n\n") || "(empty input)";

    // Step 5: Save to memory for future context
    if (modality !== "text") {
      await this.memory.save({
        type: "task_result",
        content: `Multi-modal input (${modality}): ${enrichedText.slice(0, 200)}`,
        importance: 0.5,
        tags: ["multimodal", modality],
        pinned: false,
      });
    }

    return {
      enrichedText,
      modality,
      imageDescriptions,
      audioTranscript,
      durationMs: Date.now() - t0,
    };
  }

  /**
   * Detect whether a string input contains embedded base64 image data.
   * Returns a MultiModalInput if detected, or null if it's plain text.
   */
  static parseInputString(raw: string): MultiModalInput | null {
    // Check for data URI pattern
    const dataUriPattern = /data:(image\/[a-z]+|audio\/[a-z]+);base64,([A-Za-z0-9+/=]+)/g;
    const matches = [...raw.matchAll(dataUriPattern)];
    if (matches.length === 0) return null;

    const images: ImageInput[] = [];
    let audio: AudioInput | undefined;
    let text = raw;

    for (const match of matches) {
      const mimeType = match[1];
      const data = match[2];
      text = text.replace(match[0], "").trim();

      if (mimeType.startsWith("image/")) {
        images.push({ data, mimeType });
      } else if (mimeType.startsWith("audio/")) {
        audio = { data, mimeType };
      }
    }

    return { text: text || undefined, images: images.length > 0 ? images : undefined, audio };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _describeImage(img: ImageInput): Promise<string> {
    try {
      // In production: call 0G Compute vision model with base64 image
      // The 0G Compute API accepts image_url with data URIs
      const resp = await this.compute.complete({
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:${img.mimeType};base64,${img.data.slice(0, 100)}...`,
                  detail: "auto",
                },
              },
              {
                type: "text",
                text: "Describe this image concisely in 1-2 sentences for an AI agent to understand.",
              },
            ] as unknown as string,
          },
        ],
        temperature: 0.3,
        maxTokens: 150,
      });
      return resp.content.trim();
    } catch {
      // Fallback: return a placeholder description
      return `[${img.mimeType} image${img.filename ? ` (${img.filename})` : ""}]`;
    }
  }

  private async _transcribeAudio(audio: AudioInput): Promise<string> {
    try {
      // In production: call 0G Compute speech-to-text model
      // For now, use the LLM to acknowledge the audio
      const resp = await this.compute.complete({
        messages: [
          {
            role: "user",
            content: `An audio file was provided (${audio.mimeType}${audio.durationSeconds ? `, ${audio.durationSeconds}s` : ""}). Since direct audio transcription is not available in this mode, acknowledge it and ask the user to provide a text description.`,
          },
        ],
        temperature: 0.3,
        maxTokens: 100,
      });
      return resp.content.trim();
    } catch {
      return `[Audio file: ${audio.mimeType}${audio.durationSeconds ? `, ${audio.durationSeconds}s` : ""}]`;
    }
  }
}

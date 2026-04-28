/**
 * ZeroGComputeAdapterShim
 *
 * Implements the @claw/core ComputeAdapter interface using 0G Compute.
 * Falls back to mock mode when no private key is provided.
 */

import type { ComputeAdapter, LLMRequest, LLMResponse, EmbeddingRequest, EmbeddingResponse } from "../../core/src/types.js";

interface Config {
  rpc: string;
  model: string;
  privateKey?: string;
}

export class ZeroGComputeAdapterShim implements ComputeAdapter {
  readonly mode: "production" | "mock";
  private readonly config: Config;

  constructor(config: Config) {
    this.config = config;
    this.mode = config.privateKey ? "production" : "mock";
  }

  isAvailable(): boolean { return true; }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    if (this.mode === "mock") {
      return this._mockComplete(request);
    }
    // Production: call 0G Compute OpenAI-compatible endpoint
    try {
      const resp = await fetch(`${this.config.rpc}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.privateKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          temperature: request.temperature ?? 0.7,
          max_tokens: request.maxTokens ?? 1024,
          stream: false,
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`0G Compute error ${resp.status}: ${text.slice(0, 200)}`);
      }
      const data = await resp.json() as {
        choices: Array<{ message: { content: string } }>;
        model: string;
        usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };
      return {
        content: data.choices[0].message.content,
        model: data.model,
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (err) {
      console.warn("[ZeroGComputeAdapterShim] Falling back to mock:", (err as Error).message);
      return this._mockComplete(request);
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (this.mode === "mock") {
      return this._mockEmbed(request);
    }
    try {
      const resp = await fetch(`${this.config.rpc}/v1/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.config.privateKey}`,
        },
        body: JSON.stringify({ model: "text-embedding-ada-002", input: request.texts }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!resp.ok) throw new Error(`0G Embed error ${resp.status}`);
      const data = await resp.json() as { data: Array<{ embedding: number[] }>; model: string };
      return {
        embeddings: data.data.map((d) => d.embedding),
        model: data.model,
      };
    } catch {
      return this._mockEmbed(request);
    }
  }

  private _mockComplete(request: LLMRequest): LLMResponse {
    const last = [...request.messages].reverse().find((m) => m.role === "user");
    return {
      content: `[0G mock] ${last?.content.slice(0, 80) ?? "No input"}`,
      model: `${this.config.model}-mock`,
    };
  }

  private _mockEmbed(request: EmbeddingRequest): EmbeddingResponse {
    return {
      embeddings: request.texts.map((t) => {
        const seed = t.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
        return Array.from({ length: 1536 }, (_, i) => Math.sin(seed * (i + 1) * 0.001) * 0.5);
      }),
      model: "mock-embed",
    };
  }
}

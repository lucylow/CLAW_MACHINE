import Anthropic from "@anthropic-ai/sdk";
import type { ChatRequest, ChatResponse } from "../../schemas/llm";
import type { ProviderHealth, ProviderInitResult } from "../../schemas/provider";
import { BaseLlmProvider } from "../../providers/llm/base-llm-provider";

export interface AnthropicAdapterConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
}

export class AnthropicAdapter extends BaseLlmProvider {
  name = "anthropic";
  supportsStreaming = true;

  private client: Anthropic;
  private model: string;

  constructor(config: AnthropicAdapterConfig) {
    super({ name: "anthropic", kind: "llm", timeoutMs: config.timeoutMs ?? 60000 });
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model ?? "claude-3-5-sonnet-latest";
  }

  async init(): Promise<ProviderInitResult> {
    return { provider: this.name, ready: true, metadata: { model: this.model } };
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: true,
      status: "ready",
      checkedAt: new Date().toISOString(),
      message: "Anthropic adapter initialized",
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = request.messages.filter((m) => m.role !== "system" && m.role !== "tool");
    const system = request.messages.find((m) => m.role === "system");

    const resp = await this.client.messages.create({
      model: request.model ?? this.model,
      max_tokens: request.maxTokens ?? 1024,
      temperature: request.temperature,
      system: typeof system?.content === "string" ? system.content : undefined,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      })),
    });

    return {
      text: resp.content.map((part) => ("text" in part ? part.text : "")).join(""),
      model: resp.model,
      raw: resp,
    };
  }

  async close(): Promise<void> {}
}

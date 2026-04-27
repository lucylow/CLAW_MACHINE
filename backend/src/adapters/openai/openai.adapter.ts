import OpenAI from "openai";
import type { ChatRequest, ChatResponse } from "../../schemas/llm";
import type { ProviderHealth, ProviderInitResult } from "../../schemas/provider";
import { BaseLlmProvider } from "../../providers/llm/base-llm-provider";

export interface OpenAiAdapterConfig {
  apiKey: string;
  model?: string;
  baseURL?: string;
  timeoutMs?: number;
}

export class OpenAiAdapter extends BaseLlmProvider {
  name = "openai";
  supportsStreaming = true;

  private client: OpenAI;
  private model: string;

  constructor(config: OpenAiAdapterConfig) {
    super({ name: "openai", kind: "llm", timeoutMs: config.timeoutMs ?? 60000 });
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
      timeout: config.timeoutMs ?? 60000,
    });
    this.model = config.model ?? "gpt-4.1-mini";
  }

  async init(): Promise<ProviderInitResult> {
    return { provider: this.name, ready: true, metadata: { model: this.model } };
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: true,
      status: "ready",
      checkedAt: new Date().toISOString(),
      message: "OpenAI adapter initialized",
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const messages = request.messages.map((m) => {
      const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (m.role === "tool") {
        return {
          role: "tool" as const,
          content,
          tool_call_id: m.toolCallId ?? "tool_call_0",
        };
      }
      return {
        role: m.role as "system" | "user" | "assistant",
        content,
        ...(m.name ? { name: m.name } : {}),
      };
    });

    const resp = await this.client.chat.completions.create({
      model: request.model ?? this.model,
      messages,
      temperature: request.temperature,
      top_p: request.topP,
      max_tokens: request.maxTokens,
    });

    return {
      text: resp.choices[0]?.message?.content ?? "",
      model: resp.model,
      usage: resp.usage
        ? {
            inputTokens: resp.usage.prompt_tokens,
            outputTokens: resp.usage.completion_tokens,
            totalTokens: resp.usage.total_tokens,
          }
        : undefined,
      raw: resp,
    };
  }

  async close(): Promise<void> {}
}

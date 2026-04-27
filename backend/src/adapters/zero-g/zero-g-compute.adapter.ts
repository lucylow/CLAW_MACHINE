import type { ChatRequest, ChatResponse } from "../../schemas/llm";
import type { ProviderHealth, ProviderInitResult } from "../../schemas/provider";
import { BaseLlmProvider } from "../../providers/llm/base-llm-provider";

export interface ZeroGComputeConfig {
  endpoint: string;
  apiKey?: string;
  model?: string;
  timeoutMs?: number;
}

export class ZeroGComputeAdapter extends BaseLlmProvider {
  name = "zero-g-compute";
  supportsStreaming = false;

  private endpoint: string;
  private apiKey?: string;
  private model: string;

  constructor(config: ZeroGComputeConfig) {
    super({ name: "zero-g-compute", kind: "llm", timeoutMs: config.timeoutMs ?? 60000 });
    this.endpoint = config.endpoint;
    this.apiKey = config.apiKey;
    this.model = config.model ?? "glm-4.5";
  }

  async init(): Promise<ProviderInitResult> {
    return { provider: this.name, ready: true, metadata: { endpoint: this.endpoint, model: this.model } };
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: true,
      status: "ready",
      checkedAt: new Date().toISOString(),
      message: "0G Compute adapter configured",
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const payload = {
      model: request.model ?? this.model,
      messages: request.messages,
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1024,
      stream: false,
    };

    const res = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error(`0G Compute error: ${res.status} ${res.statusText}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; model?: string };

    return {
      text: data.choices?.[0]?.message?.content ?? "",
      model: data.model ?? this.model,
      raw: data,
    };
  }

  async close(): Promise<void> {}
}

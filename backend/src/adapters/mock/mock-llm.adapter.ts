import type { ChatRequest, ChatResponse } from "../../schemas/llm";
import type { ProviderHealth, ProviderInitResult } from "../../schemas/provider";
import { BaseLlmProvider } from "../../providers/llm/base-llm-provider";

export class MockLlmAdapter extends BaseLlmProvider {
  name = "mock-llm";
  supportsStreaming = false;

  constructor() {
    super({ name: "mock-llm", kind: "llm" });
  }

  async init(): Promise<ProviderInitResult> {
    return { provider: this.name, ready: true };
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: true,
      status: "ready",
      checkedAt: new Date().toISOString(),
      message: "mock provider",
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    return {
      text: JSON.stringify(
        {
          mocked: true,
          messageCount: request.messages.length,
          model: request.model ?? "mock-model",
        },
        null,
        2,
      ),
      model: request.model ?? "mock-model",
      raw: { mock: true },
    };
  }

  async close(): Promise<void> {}
}

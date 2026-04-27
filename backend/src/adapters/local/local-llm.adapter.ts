import type { ChatRequest, ChatResponse } from "../../schemas/llm";
import type { ProviderHealth, ProviderInitResult } from "../../schemas/provider";
import { BaseLlmProvider } from "../../providers/llm/base-llm-provider";

export class LocalLlmAdapter extends BaseLlmProvider {
  name = "local-llm";
  supportsStreaming = false;

  constructor() {
    super({ name: "local-llm", kind: "llm" });
  }

  async init(): Promise<ProviderInitResult> {
    return { provider: this.name, ready: true };
  }

  async health(): Promise<ProviderHealth> {
    return {
      ok: true,
      status: "ready",
      checkedAt: new Date().toISOString(),
      message: "Local adapter ready",
    };
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    return {
      text: `Mock local response to: ${
        typeof lastUser?.content === "string" ? lastUser.content : "[structured message]"
      }`,
      model: request.model ?? "local/mock",
      raw: { mocked: true },
    };
  }

  async close(): Promise<void> {}
}

import type { ChatRequest, ChatResponse } from "../schemas/llm";
import type { LlmProvider } from "../providers/llm/types";

export interface RouterConfig {
  primary: string;
  fallbacks?: string[];
}

export class RuntimeRouter {
  constructor(
    private providers: Map<string, LlmProvider>,
    private config: RouterConfig,
  ) {}

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const ordered = [this.config.primary, ...(this.config.fallbacks ?? [])];
    let lastError: unknown;

    for (const name of ordered) {
      const provider = this.providers.get(name);
      if (!provider) continue;
      try {
        return await provider.chat(request);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("No provider available");
  }
}

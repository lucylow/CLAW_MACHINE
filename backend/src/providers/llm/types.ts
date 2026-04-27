import type { ChatDelta, ChatRequest, ChatResponse } from "../../schemas/llm";

export interface LlmProvider {
  name: string;
  supportsStreaming: boolean;
  chat(request: ChatRequest): Promise<ChatResponse>;
  stream?(request: ChatRequest): AsyncIterable<ChatDelta>;
  embed?(input: string | string[]): Promise<number[][]>;
}

import type { ChatRequest, ChatResponse } from "../../schemas/llm";
import type { ProviderHealth, ProviderInitResult } from "../../schemas/provider";
import { BaseProvider } from "../base";
import type { LlmProvider } from "./types";

export abstract class BaseLlmProvider extends BaseProvider implements LlmProvider {
  abstract name: string;
  abstract supportsStreaming: boolean;

  abstract chat(request: ChatRequest): Promise<ChatResponse>;
  abstract init(): Promise<ProviderInitResult>;
  abstract health(): Promise<ProviderHealth>;
  abstract close(): Promise<void>;
}

export interface MessagePartText {
  type: "text";
  text: string;
}

export interface MessagePartImage {
  type: "image";
  url: string;
  alt?: string;
}

export type MessagePart = MessagePartText | MessagePartImage;

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | MessagePart[];
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
}

export interface ChatDelta {
  text?: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: unknown;
  }>;
}

export interface ChatResponse {
  text: string;
  model: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  raw?: unknown;
}

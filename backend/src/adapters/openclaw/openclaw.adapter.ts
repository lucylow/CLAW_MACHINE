export interface OpenClawRuntimeLike {
  run(input: {
    userMessage: string;
    systemPrompt?: string;
    tools?: unknown[];
  }): Promise<{ text: string; trace?: string[] }>;
}

export class OpenClawAdapter {
  constructor(private runtime: OpenClawRuntimeLike) {}

  async execute(userMessage: string, systemPrompt?: string) {
    return this.runtime.run({ userMessage, systemPrompt });
  }
}

import type { LlmProvider } from "../providers/llm/types";
import type { MemoryStorageProvider } from "../providers/storage/types";
import { MemoryOrchestrator } from "./memory/memory-orchestrator";
import { ReflectionEngine } from "./reflection/reflection-engine";

export interface RuntimeInput {
  streamId: string;
  userMessage: string;
}

export interface RuntimeResult {
  output: string;
  trace: string[];
  reflection?: unknown;
}

export class ProviderAgentRuntime {
  private memory: MemoryOrchestrator;
  private reflection: ReflectionEngine;

  constructor(
    private llm: LlmProvider,
    private storage: MemoryStorageProvider,
  ) {
    this.memory = new MemoryOrchestrator(storage, llm);
    this.reflection = new ReflectionEngine(llm, storage);
  }

  async run(input: RuntimeInput): Promise<RuntimeResult> {
    const trace: string[] = [];
    trace.push("phase:memory_recall");
    const memorySummary = await this.memory.summarize(input.streamId);

    trace.push("phase:llm_chat");
    const chatResponse = await this.llm.chat({
      messages: [
        { role: "system", content: "You are CLAW MACHINE runtime." },
        { role: "user", content: `Memory:\n${memorySummary}\n\nUser:\n${input.userMessage}` },
      ],
      temperature: 0.3,
      maxTokens: 600,
    });

    await this.memory.saveWorkingMemory(input.streamId, "last_user_message", input.userMessage);
    await this.memory.saveWorkingMemory(input.streamId, "last_assistant_response", chatResponse.text);

    const reflection = await this.reflection.generate({
      streamId: input.streamId,
      task: input.userMessage,
      trace,
      outcome: "success",
    });

    return { output: chatResponse.text, trace, reflection };
  }
}

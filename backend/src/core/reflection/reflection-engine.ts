import { randomUUID } from "crypto";
import type { LlmProvider } from "../../providers/llm/types";
import type { MemoryStorageProvider } from "../../providers/storage/types";

export interface ReflectionInput {
  streamId: string;
  task: string;
  trace: string[];
  outcome: "success" | "failure";
  error?: string;
}

export interface ReflectionOutput {
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  severity: "low" | "medium" | "high";
  embedding?: number[];
}

export class ReflectionEngine {
  constructor(
    private llm: LlmProvider,
    private storage: MemoryStorageProvider,
  ) {}

  async generate(input: ReflectionInput): Promise<ReflectionOutput> {
    const prompt = [
      "You are a reflection engine for autonomous agents.",
      "Analyze the task outcome and produce structured JSON.",
      `Task: ${input.task}`,
      `Outcome: ${input.outcome}`,
      input.error ? `Error: ${input.error}` : "",
      `Trace:\n${input.trace.join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const response = await this.llm.chat({
      messages: [
        { role: "system", content: "Return only valid JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 800,
    });

    const parsed = JSON.parse(response.text) as ReflectionOutput;
    await this.storage.appendLog({
      id: randomUUID(),
      streamId: input.streamId,
      type: "reflection",
      payload: parsed,
      createdAt: new Date().toISOString(),
    });
    return parsed;
  }
}

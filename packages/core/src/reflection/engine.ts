import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AgentEpisode, ReflectionRecord } from "../memory/types.js";
import type { ReflectionPromptInput, ReflectionOutput } from "./schema.js";

const reflectionOutputSchema = z.object({
  rootCause: z.string(),
  mistakeSummary: z.string(),
  correctiveAdvice: z.string(),
  severity: z.enum(["low", "medium", "high"]),
});

export interface LlmClient {
  chat(prompt: string): Promise<string>;
  embed(text: string): Promise<number[]>;
}

function parseReflectionOutput(raw: string): ReflectionOutput {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(s);
  if (fence) s = fence[1]!.trim();
  const parsed: unknown = JSON.parse(s);
  return reflectionOutputSchema.parse(parsed);
}

export class ReflectionEngine {
  constructor(private readonly llm: LlmClient) {}

  private buildPrompt(input: ReflectionPromptInput): string {
    return [
      "You are Claw Machine's reflection engine.",
      "Analyze the failure and return ONLY valid JSON.",
      `Task: ${input.task}`,
      `Outcome: ${input.outcome}`,
      input.error ? `Error: ${input.error}` : "",
      "Trace:",
      ...input.trace.map((line, i) => `${i + 1}. ${line}`),
      "JSON schema:",
      '{"rootCause":"string","mistakeSummary":"string","correctiveAdvice":"string","severity":"low|medium|high"}',
    ]
      .filter(Boolean)
      .join("\n");
  }

  async generateReflection(episode: AgentEpisode): Promise<ReflectionRecord> {
    const err =
      episode.metadata && typeof episode.metadata.errorText === "string"
        ? episode.metadata.errorText
        : undefined;

    const prompt = this.buildPrompt({
      task: episode.task,
      outcome: episode.outcome,
      trace: episode.trace,
      error: err,
      metadata: episode.metadata as Record<string, unknown> | undefined,
    });

    const raw = await this.llm.chat(prompt);
    const parsed = parseReflectionOutput(raw);
    const embedding = await this.llm.embed(
      `${parsed.rootCause}\n${parsed.mistakeSummary}\n${parsed.correctiveAdvice}`,
    );

    return {
      id: randomUUID(),
      streamId: episode.streamId,
      episodeId: episode.id,
      rootCause: parsed.rootCause,
      mistakeSummary: parsed.mistakeSummary,
      correctiveAdvice: parsed.correctiveAdvice,
      severity: parsed.severity,
      embedding,
      createdAt: new Date().toISOString(),
    };
  }
}

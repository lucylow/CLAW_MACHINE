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
  /** True when the LLM response could not be parsed and a fallback was used. */
  isFallback?: boolean;
}

/** Fallback reflection used when LLM output cannot be parsed. */
function fallbackReflection(input: ReflectionInput): ReflectionOutput {
  return {
    rootCause: "unknown — LLM response unparseable",
    mistakeSummary: `Task "${input.task}" failed with outcome "${input.outcome}". Error: ${input.error ?? "none"}`,
    correctiveAdvice: "Review the agent trace manually. Ensure the LLM returns valid JSON.",
    severity: "medium",
    isFallback: true,
  };
}

/** Attempt to extract JSON from a response that may have prose around it. */
function extractJson(text: string): unknown {
  // Try direct parse first
  try { return JSON.parse(text); } catch { /* continue */ }
  // Try to find a JSON object block
  const match = text.match(/\{[\s\S]*\}/);
  if (match) { try { return JSON.parse(match[0]); } catch { /* continue */ } }
  return null;
}

export class ReflectionEngine {
  constructor(
    private llm: LlmProvider,
    private storage: MemoryStorageProvider,
  ) {}

  async generate(input: ReflectionInput): Promise<ReflectionOutput> {
    const prompt = [
      "You are a reflection engine for autonomous agents.",
      "Analyze the task outcome and produce structured JSON with keys:",
      "rootCause, mistakeSummary, correctiveAdvice, severity (low|medium|high).",
      `Task: ${input.task}`,
      `Outcome: ${input.outcome}`,
      input.error ? `Error: ${input.error}` : "",
      `Trace:\n${input.trace.join("\n")}`,
    ].filter(Boolean).join("\n\n");

    let parsed: ReflectionOutput;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: "system", content: "Return only valid JSON. No prose, no markdown fences." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 800,
      });

      const extracted = extractJson(response.text);
      if (!extracted || typeof extracted !== "object") {
        console.warn("[ReflectionEngine] LLM returned non-JSON, using fallback.");
        parsed = fallbackReflection(input);
      } else {
        parsed = extracted as ReflectionOutput;
        // Validate required fields
        if (!parsed.rootCause || !parsed.mistakeSummary || !parsed.correctiveAdvice) {
          console.warn("[ReflectionEngine] LLM JSON missing required fields, using fallback.");
          parsed = fallbackReflection(input);
        }
        // Normalise severity
        const validSeverities = new Set(["low", "medium", "high"]);
        if (!validSeverities.has(parsed.severity)) parsed.severity = "medium";
      }
    } catch (llmErr) {
      console.error("[ReflectionEngine] LLM call failed:", llmErr instanceof Error ? llmErr.message : String(llmErr));
      parsed = fallbackReflection(input);
    }

    // Persist — but do not throw if storage fails
    try {
      await this.storage.appendLog({
        id: randomUUID(),
        streamId: input.streamId,
        type: "reflection",
        payload: parsed,
        createdAt: new Date().toISOString(),
      });
    } catch (storageErr) {
      console.error("[ReflectionEngine] Failed to persist reflection:", storageErr instanceof Error ? storageErr.message : String(storageErr));
    }

    return parsed;
  }
}

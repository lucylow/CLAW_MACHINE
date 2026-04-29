import type { GeneratedSkillSpec, SkillTestCase } from "./types.js";

export interface ComputeMemoryHit {
  id: string;
  title?: string;
  summary?: string;
  tags?: string[];
  importance?: number;
}

export interface TestGenerationContext {
  task: string;
  spec: GeneratedSkillSpec;
  currentSkills?: Array<{ id: string; name: string; description: string; tags?: string[] }>;
  memoryHits?: ComputeMemoryHit[];
}

export function generateFallbackTests(ctx: TestGenerationContext): SkillTestCase[] {
  const positive = ctx.spec.examples[0]?.input ?? ctx.spec.goal;
  const negative = "unrelated completely different topic";
  const kind = ctx.spec.kind;

  return [
    {
      id: `${ctx.spec.id}_positive_handle`,
      name: "primary task is recognized",
      input: positive,
      ctx: buildContext(ctx, positive),
      expect: {
        shouldHandle: true,
        minHandleScore: 0.45,
      },
      weight: 3,
    },
    {
      id: `${ctx.spec.id}_positive_run`,
      name: "returns a focused response",
      input: positive,
      ctx: buildContext(ctx, positive),
      expect: {
        outputIncludes: positive.split(/\s+/).slice(0, 3).filter(Boolean),
      },
      weight: 4,
    },
    {
      id: `${ctx.spec.id}_negative_handle`,
      name: "does not over-trigger on unrelated input",
      input: negative,
      ctx: buildContext(ctx, negative),
      expect: {
        shouldHandle: false,
        maxHandleScore: kind === "safety" ? 0.45 : 0.35,
      },
      weight: 2,
    },
  ];
}

function buildContext(ctx: TestGenerationContext, input: string): Record<string, unknown> {
  return {
    requestId: `test_${ctx.spec.id}`,
    sessionId: "session_test",
    walletAddress: undefined,
    input,
    normalizedInput: input.toLowerCase(),
    systemPrompt: `You are testing the ${ctx.spec.name} skill`,
    recentMemories: (ctx.memoryHits ?? []).slice(0, 5),
    trace: [],
    config: {
      skill: ctx.spec.id,
    },
    state: {
      phase: "test",
    },
  };
}

export function parseGeneratedTests(json: string, fallback: SkillTestCase[]): SkillTestCase[] {
  try {
    const data = JSON.parse(json);
    if (!Array.isArray(data)) return fallback;
    const out: SkillTestCase[] = [];
    for (const row of data) {
      if (!row || typeof row !== "object") continue;
      const item = row as Record<string, unknown>;
      const id = String(item.id ?? "").trim();
      const name = String(item.name ?? "").trim();
      const input = String(item.input ?? "").trim();
      const ctx = item.ctx && typeof item.ctx === "object" ? (item.ctx as Record<string, unknown>) : {};
      const expect = item.expect && typeof item.expect === "object" ? (item.expect as Record<string, unknown>) : {};
      if (!id || !name || !input) continue;
      out.push({
        id,
        name,
        input,
        ctx,
        expect: {
          shouldHandle: typeof expect.shouldHandle === "boolean" ? expect.shouldHandle : undefined,
          minHandleScore: typeof expect.minHandleScore === "number" ? expect.minHandleScore : undefined,
          maxHandleScore: typeof expect.maxHandleScore === "number" ? expect.maxHandleScore : undefined,
          outputIncludes: Array.isArray(expect.outputIncludes) ? expect.outputIncludes.map(String) : undefined,
          outputExcludes: Array.isArray(expect.outputExcludes) ? expect.outputExcludes.map(String) : undefined,
          outputJsonFields: Array.isArray(expect.outputJsonFields) ? expect.outputJsonFields.map(String) : undefined,
          minConfidence: typeof expect.minConfidence === "number" ? expect.minConfidence : undefined,
          maxConfidence: typeof expect.maxConfidence === "number" ? expect.maxConfidence : undefined,
        },
        weight: typeof item.weight === "number" ? item.weight : 1,
      });
    }
    return out.length ? out : fallback;
  } catch {
    return fallback;
  }
}

export function summarizeFailures(results: Array<{ name: string; error?: string; passed: boolean; score: number }>): string {
  return results
    .filter((r) => !r.passed)
    .map((r) => `- ${r.name}: ${r.error ?? "failed"} (score ${r.score.toFixed(2)})`)
    .join("\n");
}

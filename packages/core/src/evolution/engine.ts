import crypto from "crypto";
import { buildSkillGenerationPrompt, buildSkillRepairPrompt, buildTestGenerationPrompt, fallbackSkillSpec } from "./prompts.js";
import { loadSkillFromSource, hashSkillSource, validateSkill } from "./sandbox.js";
import { scoreCandidate } from "./scorer.js";
import { type LiveSkillRunnerLike } from "./registry.js";
import { type EvolutionStore } from "./store.js";
import { generateFallbackTests, parseGeneratedTests, summarizeFailures } from "./testgen.js";
import type {
  EvolutionAttempt,
  EvolutionMode,
  EvolutionPromptContext,
  GeneratedSkillArtifact,
  GeneratedSkillSpec,
  SkillDefinitionLike,
  SkillExecutionContextLike,
  SkillKind,
  SkillTestCase,
  SkillTestResult,
} from "./types.js";

export interface ComputeClientLike {
  mode?: EvolutionMode;
  generate(
    prompt: string,
    opts?: { temperature?: number; maxTokens?: number; json?: boolean; systemPrompt?: string }
  ): Promise<{ text: string; confidence?: number; model?: string }>;
}

export interface EvolutionPolicy {
  minPassRate?: number;
  minScore?: number;
  maxRepairRounds?: number;
  maxSourceLength?: number;
  sandboxTimeoutMs?: number;
  allowHotRegister?: boolean;
  persistAllAttempts?: boolean;
  allowRepairedPromotions?: boolean;
  requireAtLeastOnePositiveTest?: boolean;
}

export interface EvolutionEngineDeps {
  compute: ComputeClientLike;
  store: EvolutionStore;
  runner: LiveSkillRunnerLike;
  policy?: EvolutionPolicy;
}

export interface EvolutionRunInput {
  task: string;
  domainHint?: string;
  context?: EvolutionPromptContext;
  memoryHits?: Array<{ id: string; title?: string; summary?: string; tags?: string[]; importance?: number }>;
  currentSkills?: Array<{ id: string; name: string; description: string; tags?: string[]; kind?: string; version?: string }>;
  metadata?: Record<string, unknown>;
}

export interface EvolutionRunResult {
  attempt: EvolutionAttempt;
  skill?: SkillDefinitionLike;
  artifact?: GeneratedSkillArtifact;
  tests?: SkillTestCase[];
  results?: SkillTestResult[];
  score?: ReturnType<typeof scoreCandidate>;
  promoted: boolean;
  repaired: boolean;
  warnings: string[];
}

export class SelfEvolvingSkillEngine {
  private readonly compute: ComputeClientLike;
  private readonly store: EvolutionStore;
  private readonly runner: LiveSkillRunnerLike;
  private readonly policy: Required<EvolutionPolicy>;

  constructor(deps: EvolutionEngineDeps) {
    this.compute = deps.compute;
    this.store = deps.store;
    this.runner = deps.runner;
    this.policy = {
      minPassRate: deps.policy?.minPassRate ?? 1,
      minScore: deps.policy?.minScore ?? 0.82,
      maxRepairRounds: deps.policy?.maxRepairRounds ?? 2,
      maxSourceLength: deps.policy?.maxSourceLength ?? 18_000,
      sandboxTimeoutMs: deps.policy?.sandboxTimeoutMs ?? 1_800,
      allowHotRegister: deps.policy?.allowHotRegister ?? true,
      persistAllAttempts: deps.policy?.persistAllAttempts ?? true,
      allowRepairedPromotions: deps.policy?.allowRepairedPromotions ?? true,
      requireAtLeastOnePositiveTest: deps.policy?.requireAtLeastOnePositiveTest ?? true,
    };
  }

  async evolve(input: EvolutionRunInput): Promise<EvolutionRunResult> {
    const attemptId = `evo_${crypto.randomUUID()}`;
    const spec = fallbackSkillSpec(input.task, input.domainHint);

    const attempt: EvolutionAttempt = {
      id: attemptId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stage: "describe",
      status: "skipped",
      task: input.task,
      spec,
      repairRounds: 0,
      metadata: {
        ...(input.metadata ?? {}),
        domainHint: input.domainHint,
      },
    };

    await this.store.saveAttempt(attempt);

    const listed = this.runner.list ? await Promise.resolve(this.runner.list()) : [];
    const normalizeSkill = (s: { id: string; name: string; description: string; tags?: string[]; kind?: string; version?: string }) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags ?? [],
      kind: normalizeKind(s.kind),
      version: s.version ?? "1.0.0",
    });

    const currentSkills = input.currentSkills ? input.currentSkills.map(normalizeSkill) : listed.map((s) => normalizeSkill(s));

    const generationPrompt = buildSkillGenerationPrompt({
      task: input.task,
      domainHint: input.domainHint,
      currentSkills,
      recentReflections: input.context?.recentReflections,
      examples: input.context?.examples,
      constraints: input.context?.constraints,
    });

    attempt.stage = "generate";
    attempt.prompt = generationPrompt;
    await this.store.updateAttempt(attempt);

    const generation = await this.compute.generate(generationPrompt, {
      temperature: 0.2,
      maxTokens: 2400,
      json: false,
      systemPrompt: "Return only TypeScript source code for a single skill.",
    });

    const candidateSource = this.normalizeSource(generation.text);
    attempt.generatedSource = candidateSource;
    attempt.sourceHash = hashSkillSource(candidateSource);
    attempt.updatedAt = Date.now();
    await this.store.updateAttempt(attempt);

    let artifact: GeneratedSkillArtifact | undefined;
    let load: ReturnType<typeof loadSkillFromSource> | undefined;
    const warnings: string[] = [];

    try {
      attempt.stage = "sandbox";
      await this.store.updateAttempt(attempt);
      load = loadSkillFromSource(candidateSource, {
        timeoutMs: this.policy.sandboxTimeoutMs,
        allowConsole: false,
      });
      artifact = {
        skill: validateSkill(load.skill),
        sourceType: "typescript",
        source: candidateSource,
        transpiledJs: load.js,
        spec,
      };
    } catch (error) {
      attempt.stage = "failed";
      attempt.status = "failed";
      attempt.error = `Sandbox/load failure: ${error instanceof Error ? error.message : String(error)}`;
      attempt.updatedAt = Date.now();
      await this.store.updateAttempt(attempt);
      return {
        attempt,
        promoted: false,
        repaired: false,
        warnings: [attempt.error],
      };
    }

    const tests = await this.buildTests(spec, candidateSource, input, currentSkills);
    attempt.tests = tests;
    attempt.stage = "test";
    await this.store.updateAttempt(attempt);

    let results = await this.runTests(load.skill, tests, this.policy.sandboxTimeoutMs);
    let score = scoreCandidate({
      skill: load.skill,
      tests: results,
      source: candidateSource,
      repairedRounds: 0,
      diagnostics: load.diagnostics,
    });
    attempt.results = results;
    attempt.score = score;
    attempt.updatedAt = Date.now();
    await this.store.updateAttempt(attempt);

    let repaired = false;

    while (shouldRepair(score, this.policy) && attempt.repairRounds < this.policy.maxRepairRounds) {
      attempt.repairRounds += 1;
      attempt.stage = "generate";
      attempt.status = "skipped";
      await this.store.updateAttempt(attempt);

      const repairPrompt = buildSkillRepairPrompt({
        task: input.task,
        source: attempt.generatedSource ?? candidateSource,
        testFailures: summarizeFailures(results),
        scoreSummary: JSON.stringify(score, null, 2),
        currentSkills,
      });

      const repairedSourceResult = await this.compute.generate(repairPrompt, {
        temperature: 0.15,
        maxTokens: 2600,
        json: false,
        systemPrompt: "Return only repaired TypeScript skill source code.",
      });

      const repairedSource = this.normalizeSource(repairedSourceResult.text);
      attempt.generatedSource = repairedSource;
      attempt.sourceHash = hashSkillSource(repairedSource);
      attempt.updatedAt = Date.now();
      await this.store.updateAttempt(attempt);

      try {
        attempt.stage = "sandbox";
        await this.store.updateAttempt(attempt);

        const repairedLoad = loadSkillFromSource(repairedSource, {
          timeoutMs: this.policy.sandboxTimeoutMs,
          allowConsole: false,
        });

        artifact = {
          skill: validateSkill(repairedLoad.skill),
          sourceType: "typescript",
          source: repairedSource,
          transpiledJs: repairedLoad.js,
          spec,
        };

        results = await this.runTests(repairedLoad.skill, tests, this.policy.sandboxTimeoutMs);
        score = scoreCandidate({
          skill: repairedLoad.skill,
          tests: results,
          source: repairedSource,
          repairedRounds: attempt.repairRounds,
          diagnostics: repairedLoad.diagnostics,
        });

        repaired = true;
        attempt.results = results;
        attempt.score = score;
        attempt.updatedAt = Date.now();
        await this.store.updateAttempt(attempt);
        load = repairedLoad;

        if (!shouldRepair(score, this.policy)) break;
      } catch (error) {
        warnings.push(`repair_round_${attempt.repairRounds}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (shouldPromote(score, this.policy, results, repaired)) {
      attempt.stage = "promote";
      attempt.status = "promoted";
      await this.store.updateAttempt(attempt);

      const registration = await this.hotRegister(load.skill);
      attempt.promotedSkillId = registration.registered.id;
      attempt.stage = "persist";
      await this.store.updateAttempt(attempt);

      if (artifact) {
        const key = await this.persistArtifact(attempt, artifact, results, score);
        attempt.persistedArtifactKey = key;
        await this.store.updateAttempt(attempt);
      }

      attempt.stage = "done";
      attempt.status = "promoted";
      attempt.updatedAt = Date.now();
      await this.store.updateAttempt(attempt);

      return {
        attempt,
        skill: load.skill,
        artifact,
        tests,
        results,
        score,
        promoted: true,
        repaired,
        warnings,
      };
    }

    attempt.stage = "done";
    attempt.status = repaired ? "rejected" : "failed";
    attempt.updatedAt = Date.now();
    attempt.error = `Candidate did not pass promotion thresholds. ${score.note}`;
    await this.store.updateAttempt(attempt);

    if (this.policy.persistAllAttempts && artifact) {
      const key = await this.persistArtifact(attempt, artifact, results, score).catch(() => undefined);
      if (key) {
        attempt.persistedArtifactKey = key;
        await this.store.updateAttempt(attempt);
      }
    }

    return {
      attempt,
      skill: load.skill,
      artifact,
      tests,
      results,
      score,
      promoted: false,
      repaired,
      warnings,
    };
  }

  async listAttempts(query?: Parameters<EvolutionStore["listAttempts"]>[0]) {
    return this.store.listAttempts(query);
  }

  async getAttempt(id: string) {
    return this.store.getAttempt(id);
  }

  async exportSnapshot() {
    return this.store.exportSnapshot();
  }

  async importSnapshot(snapshot: Awaited<ReturnType<EvolutionStore["exportSnapshot"]>>) {
    return this.store.importSnapshot(snapshot);
  }

  private async hotRegister(skill: SkillDefinitionLike): Promise<{ ok: boolean; replaced: boolean; registered: SkillDefinitionLike }> {
    if (!this.policy.allowHotRegister) {
      return { ok: false, replaced: false, registered: skill };
    }

    const existing = this.runner.get ? await this.runner.get(skill.id) : undefined;
    if (existing && this.runner.replace && this.policy.allowRepairedPromotions) {
      await this.runner.replace(skill);
      return { ok: true, replaced: true, registered: skill };
    }

    if (existing && this.runner.unregister) {
      await this.runner.unregister(skill.id);
    }

    await this.runner.register(skill);
    return { ok: true, replaced: Boolean(existing), registered: skill };
  }

  private async persistArtifact(
    attempt: EvolutionAttempt,
    artifact: GeneratedSkillArtifact,
    results: SkillTestResult[],
    score: ReturnType<typeof scoreCandidate>
  ): Promise<string> {
    const key = `evolution/${attempt.id}/${artifact.skill.id}.json`;
    const payload = {
      attempt,
      artifact: {
        ...artifact,
        transpiledJs: undefined,
      },
      source: artifact.source,
      transpiledJs: artifact.transpiledJs,
      results,
      score,
    };
    return this.storeArtifact(key, payload);
  }

  private async storeArtifact(key: string, payload: unknown): Promise<string> {
    const storeAny = this.store as unknown as { put?: unknown };
    if ("put" in storeAny && typeof storeAny.put === "function") {
      const put = (this.store as unknown as {
        put: (
          key: string,
          payload: unknown,
          opts?: { contentType?: string; compress?: boolean; encrypt?: boolean; metadata?: Record<string, unknown> }
        ) => Promise<{ key?: string }>;
      }).put;
      const result = await put(key, payload, {
        contentType: "application/json",
        compress: true,
        encrypt: false,
        metadata: { kind: "evolved_skill_artifact" },
      });
      return result.key || key;
    }
    return key;
  }

  private normalizeSource(source: string): string {
    let text = source.trim();
    text = text.replace(/^```(?:ts|typescript|js|javascript)?\s*/i, "");
    text = text.replace(/```$/i, "");
    if (text.length > this.policy.maxSourceLength) {
      text = text.slice(0, this.policy.maxSourceLength);
    }
    return text.trim();
  }

  private async buildTests(
    spec: GeneratedSkillSpec,
    source: string,
    input: EvolutionRunInput,
    currentSkills: Array<{ id: string; name: string; description: string; tags?: string[]; kind?: SkillKind; version?: string }>
  ): Promise<SkillTestCase[]> {
    const promptSkills = currentSkills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      tags: s.tags ?? [],
      kind: s.kind ?? "general",
      version: s.version ?? "1.0.0",
    }));

    const prompt = buildTestGenerationPrompt({
      task: input.task,
      spec,
      source,
      currentSkills: promptSkills,
    });

    try {
      const result = await this.compute.generate(prompt, {
        temperature: 0.1,
        maxTokens: 1200,
        json: true,
        systemPrompt: "Return only JSON array of tests.",
      });
      const parsed = parseGeneratedTests(
        result.text,
        generateFallbackTests({ task: input.task, spec, currentSkills: promptSkills, memoryHits: input.memoryHits })
      );
      if (this.policy.requireAtLeastOnePositiveTest && !parsed.some((t) => t.expect.shouldHandle === true || (t.expect.minHandleScore ?? 0) > 0.4)) {
        parsed.unshift({
          id: `${spec.id}_fallback_positive`,
          name: "fallback positive case",
          input: spec.goal,
          ctx: { requestId: "fallback", sessionId: "session_test", input: spec.goal },
          expect: { shouldHandle: true, minHandleScore: 0.5 },
          weight: 2,
        });
      }
      return parsed;
    } catch {
      return generateFallbackTests({ task: input.task, spec, currentSkills: promptSkills, memoryHits: input.memoryHits });
    }
  }

  private async runTests(skill: SkillDefinitionLike, tests: SkillTestCase[], timeoutMs: number): Promise<SkillTestResult[]> {
    const results: SkillTestResult[] = [];
    for (const test of tests) {
      const startedAt = Date.now();
      try {
        const ctx = this.materializeContext(test.ctx, test.input);
        const handleScore = skill.canHandle ? await Promise.resolve(skill.canHandle(test.input, ctx)) : 1;
        const shouldHandle = test.expect.shouldHandle;
        const handleThreshold = test.expect.minHandleScore ?? 0.5;

        const output = await withTimeout(Promise.resolve(skill.run(ctx)), timeoutMs);
        const text = toText(output);
        const parsedJson = tryParseJson(text);

        const details: string[] = [];
        let passed = true;
        let score = 0.5;

        if (shouldHandle !== undefined) {
          const handlePass = shouldHandle ? handleScore >= handleThreshold : handleScore <= (test.expect.maxHandleScore ?? 0.35);
          passed = passed && handlePass;
          score += handlePass ? 0.2 : -0.2;
          details.push(`handleScore=${handleScore.toFixed(2)}`, `handlePass=${handlePass}`);
        }

        if (test.expect.outputIncludes?.length) {
          const includesPass = test.expect.outputIncludes.every((needle) => text.toLowerCase().includes(needle.toLowerCase()));
          passed = passed && includesPass;
          score += includesPass ? 0.2 : -0.2;
          details.push(`includesPass=${includesPass}`);
        }

        if (test.expect.outputExcludes?.length) {
          const excludesPass = test.expect.outputExcludes.every((needle) => !text.toLowerCase().includes(needle.toLowerCase()));
          passed = passed && excludesPass;
          score += excludesPass ? 0.1 : -0.2;
          details.push(`excludesPass=${excludesPass}`);
        }

        if (test.expect.outputJsonFields?.length) {
          const jsonFieldsPass =
            parsedJson && typeof parsedJson === "object"
              ? test.expect.outputJsonFields.every((field) => Object.prototype.hasOwnProperty.call(parsedJson, field))
              : false;
          passed = passed && jsonFieldsPass;
          score += jsonFieldsPass ? 0.2 : -0.15;
          details.push(`jsonFieldsPass=${jsonFieldsPass}`);
        }

        if (test.expect.minConfidence !== undefined) {
          const c = inferOutputConfidence(parsedJson, text);
          const confPass = c >= test.expect.minConfidence;
          passed = passed && confPass;
          score += confPass ? 0.1 : -0.1;
          details.push(`confidence=${c.toFixed(2)}`, `confidencePass=${confPass}`);
        }

        if (test.expect.maxConfidence !== undefined) {
          const c = inferOutputConfidence(parsedJson, text);
          const confPass = c <= test.expect.maxConfidence;
          passed = passed && confPass;
          score += confPass ? 0.05 : -0.05;
          details.push(`confidence=${c.toFixed(2)}`, `maxConfidencePass=${confPass}`);
        }

        results.push({
          id: test.id,
          name: test.name,
          passed,
          score: clamp(score, 0, 1),
          output,
          outputText: text,
          handleScore,
          durationMs: Date.now() - startedAt,
          details,
        });
      } catch (error) {
        results.push({
          id: test.id,
          name: test.name,
          passed: false,
          score: 0,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt,
          details: ["testFailed=true"],
        });
      }
    }
    return results;
  }

  private materializeContext(ctx: SkillTestCase["ctx"], input: string): SkillExecutionContextLike {
    const row = ctx as Record<string, unknown>;
    return {
      requestId: String(row.requestId ?? "test"),
      sessionId: String(row.sessionId ?? "session_test"),
      walletAddress: typeof row.walletAddress === "string" ? row.walletAddress : undefined,
      input,
      normalizedInput: String(row.normalizedInput ?? input.toLowerCase()),
      systemPrompt: String(row.systemPrompt ?? ""),
      recentMemories: Array.isArray(row.recentMemories)
        ? (row.recentMemories as Array<Record<string, unknown>>).map((m, idx) => ({
            id: typeof m.id === "string" ? m.id : `memory_${idx}`,
            kind: typeof m.kind === "string" ? m.kind : undefined,
            title: typeof m.title === "string" ? m.title : undefined,
            summary: typeof m.summary === "string" ? m.summary : undefined,
            tags: Array.isArray(m.tags) ? m.tags.map(String) : undefined,
            importance: typeof m.importance === "number" ? m.importance : undefined,
            createdAt: typeof m.createdAt === "number" ? m.createdAt : undefined,
            updatedAt: typeof m.updatedAt === "number" ? m.updatedAt : undefined,
            metadata: typeof m.metadata === "object" && m.metadata ? (m.metadata as Record<string, unknown>) : undefined,
          }))
        : [],
      trace: Array.isArray(row.trace)
        ? (row.trace as Array<Record<string, unknown>>).map((t, idx) => ({
            id: typeof t.id === "string" ? t.id : `trace_${idx}`,
            sessionId: typeof t.sessionId === "string" ? t.sessionId : "session_test",
            type: typeof t.type === "string" ? t.type : "info",
            message: typeof t.message === "string" ? t.message : "",
            createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
            data: typeof t.data === "object" && t.data ? (t.data as Record<string, unknown>) : undefined,
          }))
        : [],
      config: typeof row.config === "object" && row.config ? (row.config as Record<string, unknown>) : {},
      state: typeof row.state === "object" && row.state ? (row.state as Record<string, unknown>) : {},
      memory: row.memory,
      storage: row.storage,
      compute: row.compute,
    };
  }
}

function shouldRepair(score: ReturnType<typeof scoreCandidate>, policy: Required<EvolutionPolicy>): boolean {
  if (score.testPassRate >= policy.minPassRate && score.total >= policy.minScore) return false;
  return true;
}

function shouldPromote(
  score: ReturnType<typeof scoreCandidate>,
  policy: Required<EvolutionPolicy>,
  results: SkillTestResult[],
  repaired: boolean
): boolean {
  if (score.testPassRate < policy.minPassRate) return false;
  if (score.total < policy.minScore) return false;
  if (!policy.allowRepairedPromotions && repaired) return false;
  if (results.some((t) => !t.passed)) return false;
  return true;
}

function toText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function tryParseJson(text: string): unknown | undefined {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function inferOutputConfidence(parsedJson: unknown, text: string): number {
  if (parsedJson && typeof parsedJson === "object") return 0.8;
  const len = text.trim().length;
  if (len < 20) return 0.2;
  if (len < 100) return 0.5;
  if (len < 400) return 0.7;
  return 0.85;
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}

function normalizeKind(kind?: string): SkillKind {
  const allowed: SkillKind[] = [
    "retrieval",
    "analysis",
    "execution",
    "utility",
    "reflection",
    "storage",
    "wallet",
    "planner",
    "safety",
    "general",
  ];
  return allowed.includes((kind as SkillKind) ?? "general") ? ((kind as SkillKind) ?? "general") : "general";
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Sandbox timeout after ${timeoutMs}ms`)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

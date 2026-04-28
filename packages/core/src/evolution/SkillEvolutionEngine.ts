/**
 * SkillEvolutionEngine
 *
 * The self-evolving capability of the CLAW_MACHINE framework.
 *
 * Given a natural language description of a desired capability, this engine:
 *   1. Uses 0G Compute (LLM) to generate TypeScript skill code
 *   2. Sandboxes and executes the generated code using Node.js vm module
 *   3. Auto-generates test cases and runs them against the skill
 *   4. Scores the skill on correctness, safety, and performance
 *   5. If the score passes the threshold, hot-registers the skill into
 *      the live SkillRunner without any restart
 *   6. Persists the evolved skill to 0G Storage for future agent instances
 *
 * This implements the "self-evolving agent framework that autonomously
 * generates/tests/integrates new skills" described in the EthGlobal brief.
 */

import { randomUUID } from "crypto";
import * as vm from "vm";
import type { ComputeAdapter, StorageAdapter, SkillDefinition, SkillManifest } from "../types.js";
import type { SkillRunner } from "../SkillRunner.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EvolutionRequest {
  /** Natural language description of the desired skill */
  description: string;
  /** Example inputs for test generation */
  exampleInputs?: Record<string, unknown>[];
  /** Expected output shape description */
  expectedOutputShape?: string;
  /** Tags to assign to the evolved skill */
  tags?: string[];
  /** Minimum score (0–1) to accept the skill. Default: 0.6 */
  minScore?: number;
  /** Maximum number of generation attempts. Default: 3 */
  maxAttempts?: number;
}

export interface EvolutionResult {
  success: boolean;
  skillId: string;
  skillManifest?: SkillManifest;
  generatedCode?: string;
  score: number;
  testResults: TestResult[];
  attempts: number;
  storageHash?: string;
  error?: string;
  durationMs: number;
}

export interface TestResult {
  input: Record<string, unknown>;
  passed: boolean;
  output?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

export interface EvolvedSkillRecord {
  id: string;
  description: string;
  code: string;
  manifest: SkillManifest;
  score: number;
  testResults: TestResult[];
  createdAt: number;
  storageHash?: string;
  version: number;
}

// ── Engine ────────────────────────────────────────────────────────────────────

export class SkillEvolutionEngine {
  private readonly compute: ComputeAdapter;
  private readonly storage: StorageAdapter;
  private readonly skillRunner: SkillRunner;
  private readonly evolvedSkills: Map<string, EvolvedSkillRecord> = new Map();

  constructor(deps: {
    compute: ComputeAdapter;
    storage: StorageAdapter;
    skillRunner: SkillRunner;
  }) {
    this.compute = deps.compute;
    this.storage = deps.storage;
    this.skillRunner = deps.skillRunner;
  }

  /**
   * Evolve a new skill from a natural language description.
   * Hot-registers the skill if it passes the quality threshold.
   */
  async evolve(request: EvolutionRequest): Promise<EvolutionResult> {
    const startedAt = Date.now();
    const minScore = request.minScore ?? 0.6;
    const maxAttempts = request.maxAttempts ?? 3;
    const skillId = `evolved.${Date.now()}`;

    let bestCode = "";
    let bestScore = 0;
    let bestTestResults: TestResult[] = [];
    let lastError = "";
    let attempts = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attempts = attempt;
      try {
        // Step 1: Generate skill code
        const code = await this._generateSkillCode(request, attempt > 1 ? lastError : undefined);

        // Step 2: Extract manifest from generated code
        const manifest = this._extractManifest(code, skillId, request);

        // Step 3: Generate test cases
        const testInputs = request.exampleInputs ?? await this._generateTestInputs(request);

        // Step 4: Sandbox and test the skill
        const testResults = await this._runTests(code, testInputs);

        // Step 5: Score
        const score = this._scoreResults(testResults, code);

        if (score > bestScore) {
          bestCode = code;
          bestScore = score;
          bestTestResults = testResults;
        }

        if (score >= minScore) {
          // Step 6: Hot-register
          const skillDef = this._buildSkillDefinition(code, manifest);
          this.skillRunner.register(skillDef);

          // Step 7: Persist to 0G Storage
          const record: EvolvedSkillRecord = {
            id: manifest.id,
            description: request.description,
            code,
            manifest,
            score,
            testResults,
            createdAt: Date.now(),
            version: 1,
          };
          const storageHash = await this.storage.write(
            `evolved-skill:${manifest.id}`,
            record,
            { tier: "warm", tags: ["evolved-skill"] },
          );
          record.storageHash = storageHash;
          this.evolvedSkills.set(manifest.id, record);

          // Append to evolution log
          await this.storage.append("evolution-log", {
            skillId: manifest.id,
            score,
            attempts,
            storageHash,
            createdAt: Date.now(),
          });

          return {
            success: true,
            skillId: manifest.id,
            skillManifest: manifest,
            generatedCode: code,
            score,
            testResults,
            attempts,
            storageHash,
            durationMs: Date.now() - startedAt,
          };
        }

        lastError = `Score ${score.toFixed(2)} below threshold ${minScore}. Failed tests: ${testResults.filter(t => !t.passed).map(t => t.error).join("; ")}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      success: false,
      skillId,
      generatedCode: bestCode,
      score: bestScore,
      testResults: bestTestResults,
      attempts,
      error: `Failed after ${maxAttempts} attempts. Last error: ${lastError}`,
      durationMs: Date.now() - startedAt,
    };
  }

  /**
   * Load all previously evolved skills from 0G Storage and re-register them.
   * Call this on agent startup to restore evolved capabilities.
   */
  async loadEvolvedSkills(): Promise<number> {
    const log = await this.storage.readLog("evolution-log", 100);
    let loaded = 0;
    for (const entry of log) {
      const e = entry as { skillId: string; storageHash: string };
      try {
        const result = await this.storage.read<EvolvedSkillRecord>(`evolved-skill:${e.skillId}`);
        if (!result) continue;
        const record = result.data;
        if (!this.skillRunner.has(record.manifest.id)) {
          const skillDef = this._buildSkillDefinition(record.code, record.manifest);
          this.skillRunner.register(skillDef);
          this.evolvedSkills.set(record.manifest.id, record);
          loaded++;
        }
      } catch { /* skip corrupted records */ }
    }
    return loaded;
  }

  /** List all evolved skills with their scores and metadata */
  listEvolvedSkills(): EvolvedSkillRecord[] {
    return [...this.evolvedSkills.values()].sort((a, b) => b.createdAt - a.createdAt);
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private async _generateSkillCode(
    request: EvolutionRequest,
    previousError?: string,
  ): Promise<string> {
    const errorContext = previousError
      ? `\n\nPrevious attempt failed with: ${previousError}\nFix these issues in your new implementation.`
      : "";

    const resp = await this.compute.complete({
      messages: [
        {
          role: "system",
          content: `You are an expert TypeScript developer specializing in AI agent skills.
Generate a complete, working TypeScript skill execute function.

RULES:
1. Return ONLY a JSON object with two fields: "manifest" and "code"
2. "manifest" must have: id (string, use "evolved.<slug>"), name, description, tags (array), requiresWallet (bool), touchesChain (bool), usesCompute (bool), usesStorage (bool)
3. "code" must be a complete async function body string that can be eval'd as:
   async function execute(input, ctx) { <YOUR CODE HERE> }
4. The function must return a plain object with at least an "output" string field
5. Use only built-in JavaScript — no imports, no require()
6. Handle errors gracefully — never throw, return { output: "error: ...", error: true }
7. Keep the function under 50 lines
8. The function has access to: input (object), ctx.memory, ctx.compute, ctx.storage, ctx.emit${errorContext}`,
        },
        {
          role: "user",
          content: `Create a skill that: ${request.description}${request.expectedOutputShape ? `\nExpected output shape: ${request.expectedOutputShape}` : ""}`,
        },
      ],
      temperature: 0.4,
      maxTokens: 1200,
    });

    // Extract JSON from response
    const raw = resp.content.trim();
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error("LLM did not return valid JSON");
    }
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      manifest: Record<string, unknown>;
      code: string;
    };
    if (!parsed.code || !parsed.manifest) {
      throw new Error("Missing manifest or code in LLM response");
    }
    return JSON.stringify(parsed); // Store as JSON string for later parsing
  }

  private _extractManifest(
    codeJson: string,
    fallbackId: string,
    request: EvolutionRequest,
  ): SkillManifest {
    const parsed = JSON.parse(codeJson) as { manifest: Record<string, unknown>; code: string };
    const m = parsed.manifest;
    return {
      id: (m.id as string) || fallbackId,
      name: (m.name as string) || request.description.slice(0, 40),
      description: (m.description as string) || request.description,
      version: "evolved-1.0",
      tags: [...((m.tags as string[]) || []), "evolved", ...(request.tags || [])],
      requiresWallet: Boolean(m.requiresWallet),
      touchesChain: Boolean(m.touchesChain),
      usesCompute: Boolean(m.usesCompute),
      usesStorage: Boolean(m.usesStorage),
      enabled: true,
    };
  }

  private async _generateTestInputs(
    request: EvolutionRequest,
  ): Promise<Record<string, unknown>[]> {
    try {
      const resp = await this.compute.complete({
        messages: [
          {
            role: "system",
            content: "Generate 3 diverse test input objects for the described skill. Return ONLY a JSON array of objects.",
          },
          { role: "user", content: `Skill: ${request.description}` },
        ],
        temperature: 0.5,
        maxTokens: 300,
      });
      const raw = resp.content.trim();
      const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1)) as Record<string, unknown>[];
      return arr.slice(0, 3);
    } catch {
      return [{ input: "test" }, { input: "hello world" }, {}];
    }
  }

  private async _runTests(
    codeJson: string,
    inputs: Record<string, unknown>[],
  ): Promise<TestResult[]> {
    const parsed = JSON.parse(codeJson) as { code: string };
    const results: TestResult[] = [];

    for (const input of inputs) {
      const t0 = Date.now();
      try {
        // Sandbox execution using vm module
        const sandbox = {
          input,
          ctx: {
            walletAddress: undefined,
            requestId: randomUUID(),
            memory: {
              save: async () => ({ id: randomUUID(), createdAt: Date.now(), updatedAt: Date.now() }),
              search: async () => [],
              get: async () => null,
              pin: async () => {},
              delete: async () => {},
              stats: async () => ({ total: 0, byType: {}, pinned: 0, avgImportance: 0 }),
            },
            compute: {
              complete: async (req: { messages: Array<{ content: string }> }) => ({
                content: `[sandbox] ${req.messages[req.messages.length - 1]?.content?.slice(0, 50)}`,
                model: "sandbox-mock",
              }),
              embed: async () => ({ embeddings: [[0.1, 0.2, 0.3]], model: "sandbox-mock" }),
              isAvailable: () => true,
              mode: "mock",
            },
            storage: {
              write: async () => "mock-hash",
              read: async () => null,
              append: async () => {},
              readLog: async () => [],
              isAvailable: () => true,
              mode: "mock",
            },
            emit: () => {},
          },
          result: undefined as unknown,
          Promise,
          JSON,
          Math,
          Date,
          console: { log: () => {}, error: () => {}, warn: () => {} },
        };

        const fnCode = `
          (async function execute(input, ctx) {
            ${parsed.code}
          })(input, ctx).then(r => { result = r; });
        `;

        const script = new vm.Script(fnCode, { timeout: 5000 });
        const context = vm.createContext(sandbox);
        await script.runInContext(context);

        // Wait for async result (up to 3s)
        let waited = 0;
        while (sandbox.result === undefined && waited < 3000) {
          await new Promise((r) => setTimeout(r, 50));
          waited += 50;
        }

        const output = sandbox.result as Record<string, unknown> | undefined;
        const passed = output !== undefined &&
          typeof output === "object" &&
          output !== null &&
          "output" in output;

        results.push({
          input,
          passed,
          output: output ?? undefined,
          durationMs: Date.now() - t0,
        });
      } catch (err) {
        results.push({
          input,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - t0,
        });
      }
    }

    return results;
  }

  private _scoreResults(results: TestResult[], codeJson: string): number {
    if (results.length === 0) return 0;

    // Correctness: fraction of passing tests
    const passRate = results.filter((r) => r.passed).length / results.length;

    // Performance: penalize slow tests (>1s)
    const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;
    const perfScore = Math.max(0, 1 - avgMs / 3000);

    // Safety: check for dangerous patterns in code
    let parsed: { code: string } = { code: "" };
    try { parsed = JSON.parse(codeJson); } catch { /* ignore */ }
    const code = parsed.code || "";
    const dangerousPatterns = [
      /process\.exit/,
      /require\s*\(/,
      /import\s+/,
      /fs\./,
      /child_process/,
      /eval\s*\(/,
      /Function\s*\(/,
    ];
    const safetyScore = dangerousPatterns.some((p) => p.test(code)) ? 0 : 1;

    // Weighted score
    return passRate * 0.6 + perfScore * 0.2 + safetyScore * 0.2;
  }

  private _buildSkillDefinition(codeJson: string, manifest: SkillManifest): SkillDefinition {
    const parsed = JSON.parse(codeJson) as { code: string };
    const code = parsed.code;

    return {
      manifest,
      async execute(input, ctx) {
        const sandbox = {
          input,
          ctx,
          result: undefined as unknown,
          Promise,
          JSON,
          Math,
          Date,
          console: { log: () => {}, error: () => {}, warn: () => {} },
        };
        const fnCode = `
          (async function execute(input, ctx) {
            ${code}
          })(input, ctx).then(r => { result = r; });
        `;
        const script = new vm.Script(fnCode, { timeout: 10_000 });
        const context = vm.createContext(sandbox);
        await script.runInContext(context);

        let waited = 0;
        while (sandbox.result === undefined && waited < 8000) {
          await new Promise((r) => setTimeout(r, 50));
          waited += 50;
        }

        if (sandbox.result === undefined) {
          throw new Error(`Evolved skill "${manifest.id}" timed out`);
        }
        return sandbox.result as Record<string, unknown>;
      },
    };
  }
}

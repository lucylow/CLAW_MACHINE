"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillEvolutionEngine = void 0;
const crypto_1 = require("crypto");
const vm = __importStar(require("vm"));
// ── Engine ────────────────────────────────────────────────────────────────────
class SkillEvolutionEngine {
    constructor(deps) {
        this.evolvedSkills = new Map();
        this.compute = deps.compute;
        this.storage = deps.storage;
        this.skillRunner = deps.skillRunner;
    }
    /**
     * Evolve a new skill from a natural language description.
     * Hot-registers the skill if it passes the quality threshold.
     */
    async evolve(request) {
        const startedAt = Date.now();
        const minScore = request.minScore ?? 0.6;
        const maxAttempts = request.maxAttempts ?? 3;
        const skillId = `evolved.${Date.now()}`;
        let bestCode = "";
        let bestScore = 0;
        let bestTestResults = [];
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
                    const record = {
                        id: manifest.id,
                        description: request.description,
                        code,
                        manifest,
                        score,
                        testResults,
                        createdAt: Date.now(),
                        version: 1,
                    };
                    const storageHash = await this.storage.write(`evolved-skill:${manifest.id}`, record, { tier: "warm", tags: ["evolved-skill"] });
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
            }
            catch (err) {
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
    async loadEvolvedSkills() {
        const log = await this.storage.readLog("evolution-log", 100);
        let loaded = 0;
        for (const entry of log) {
            const e = entry;
            try {
                const result = await this.storage.read(`evolved-skill:${e.skillId}`);
                if (!result)
                    continue;
                const record = result.data;
                if (!this.skillRunner.has(record.manifest.id)) {
                    const skillDef = this._buildSkillDefinition(record.code, record.manifest);
                    this.skillRunner.register(skillDef);
                    this.evolvedSkills.set(record.manifest.id, record);
                    loaded++;
                }
            }
            catch { /* skip corrupted records */ }
        }
        return loaded;
    }
    /** List all evolved skills with their scores and metadata */
    listEvolvedSkills() {
        return [...this.evolvedSkills.values()].sort((a, b) => b.createdAt - a.createdAt);
    }
    // ── Private helpers ──────────────────────────────────────────────────────────
    async _generateSkillCode(request, previousError) {
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
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        if (!parsed.code || !parsed.manifest) {
            throw new Error("Missing manifest or code in LLM response");
        }
        return JSON.stringify(parsed); // Store as JSON string for later parsing
    }
    _extractManifest(codeJson, fallbackId, request) {
        const parsed = JSON.parse(codeJson);
        const m = parsed.manifest;
        return {
            id: m.id || fallbackId,
            name: m.name || request.description.slice(0, 40),
            description: m.description || request.description,
            version: "evolved-1.0",
            tags: [...(m.tags || []), "evolved", ...(request.tags || [])],
            requiresWallet: Boolean(m.requiresWallet),
            touchesChain: Boolean(m.touchesChain),
            usesCompute: Boolean(m.usesCompute),
            usesStorage: Boolean(m.usesStorage),
            enabled: true,
        };
    }
    async _generateTestInputs(request) {
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
            const arr = JSON.parse(raw.slice(raw.indexOf("["), raw.lastIndexOf("]") + 1));
            return arr.slice(0, 3);
        }
        catch {
            return [{ input: "test" }, { input: "hello world" }, {}];
        }
    }
    async _runTests(codeJson, inputs) {
        const parsed = JSON.parse(codeJson);
        const results = [];
        for (const input of inputs) {
            const t0 = Date.now();
            try {
                // Sandbox execution using vm module
                const sandbox = {
                    input,
                    ctx: {
                        walletAddress: undefined,
                        requestId: (0, crypto_1.randomUUID)(),
                        memory: {
                            save: async () => ({ id: (0, crypto_1.randomUUID)(), createdAt: Date.now(), updatedAt: Date.now() }),
                            search: async () => [],
                            get: async () => null,
                            pin: async () => { },
                            delete: async () => { },
                            stats: async () => ({ total: 0, byType: {}, pinned: 0, avgImportance: 0 }),
                        },
                        compute: {
                            complete: async (req) => ({
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
                            append: async () => { },
                            readLog: async () => [],
                            isAvailable: () => true,
                            mode: "mock",
                        },
                        emit: () => { },
                    },
                    result: undefined,
                    Promise,
                    JSON,
                    Math,
                    Date,
                    console: { log: () => { }, error: () => { }, warn: () => { } },
                };
                const fnCode = `
          (async function execute(input, ctx) {
            ${parsed.code}
          })(input, ctx).then(r => { result = r; });
        `;
                const script = new vm.Script(fnCode);
                const context = vm.createContext(sandbox);
                await script.runInContext(context, { timeout: 5000 });
                // Wait for async result (up to 3s)
                let waited = 0;
                while (sandbox.result === undefined && waited < 3000) {
                    await new Promise((r) => setTimeout(r, 50));
                    waited += 50;
                }
                const output = sandbox.result;
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
            }
            catch (err) {
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
    _scoreResults(results, codeJson) {
        if (results.length === 0)
            return 0;
        // Correctness: fraction of passing tests
        const passRate = results.filter((r) => r.passed).length / results.length;
        // Performance: penalize slow tests (>1s)
        const avgMs = results.reduce((s, r) => s + r.durationMs, 0) / results.length;
        const perfScore = Math.max(0, 1 - avgMs / 3000);
        // Safety: check for dangerous patterns in code
        let parsed = { code: "" };
        try {
            parsed = JSON.parse(codeJson);
        }
        catch { /* ignore */ }
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
    _buildSkillDefinition(codeJson, manifest) {
        const parsed = JSON.parse(codeJson);
        const code = parsed.code;
        return {
            manifest,
            async execute(input, ctx) {
                const sandbox = {
                    input,
                    ctx,
                    result: undefined,
                    Promise,
                    JSON,
                    Math,
                    Date,
                    console: { log: () => { }, error: () => { }, warn: () => { } },
                };
                const fnCode = `
          (async function execute(input, ctx) {
            ${code}
          })(input, ctx).then(r => { result = r; });
        `;
                const script = new vm.Script(fnCode);
                const context = vm.createContext(sandbox);
                await script.runInContext(context, { timeout: 10000 });
                let waited = 0;
                while (sandbox.result === undefined && waited < 8000) {
                    await new Promise((r) => setTimeout(r, 50));
                    waited += 50;
                }
                if (sandbox.result === undefined) {
                    throw new Error(`Evolved skill "${manifest.id}" timed out`);
                }
                return sandbox.result;
            },
        };
    }
}
exports.SkillEvolutionEngine = SkillEvolutionEngine;

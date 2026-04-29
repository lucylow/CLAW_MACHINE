import crypto from "crypto";
import { FrameworkEventBus } from "./events.js";
import { buildAgentManifest } from "./manifest.js";
import { runMiddleware } from "./plugin.js";
import { canHandleSkill, executeSkill, scoreSkillCoverage } from "./skill.js";
import type {
  AgentBusLike,
  AgentManifest,
  AgentRunInput,
  AgentRunResult,
  AgentRunMode,
  AgentRuntimeLike,
  AgentStatus,
  FrameworkContext,
  FrameworkEvent,
  FrameworkMemoryLike,
  FrameworkMode,
  FrameworkPlugin,
  FrameworkStorageLike,
  HookPhase,
  RuntimeStats,
  SkillDefinition,
  SkillExecutionContext,
} from "./types.js";

export interface RuntimeServices {
  memory?: FrameworkMemoryLike;
  storage?: FrameworkStorageLike;
  bus?: AgentBusLike;
}

export interface AgentRuntimeOptions {
  id?: string;
  name: string;
  systemPrompt: string;
  version?: string;
  description?: string;
  mode?: FrameworkMode;
  services?: RuntimeServices;
  skills?: SkillDefinition[];
  plugins?: FrameworkPlugin[];
  settings?: Record<string, unknown>;
  tags?: string[];
}

export class AgentRuntime implements AgentRuntimeLike {
  readonly id: string;
  readonly name: string;
  readonly mode: FrameworkMode;
  readonly memory?: FrameworkMemoryLike;
  readonly storage?: FrameworkStorageLike;
  readonly bus?: AgentBusLike;
  readonly eventBus = new FrameworkEventBus();
  readonly manifest: AgentManifest;
  readonly skills: SkillDefinition[] = [];
  readonly plugins: FrameworkPlugin[] = [];
  status: AgentStatus = "idle";

  private sessions = new Set<string>();
  private statsState: RuntimeStats = {
    sessions: 0,
    runs: 0,
    activeSkills: 0,
    plugins: 0,
    errors: 0,
    reflections: 0,
    memoryWrites: 0,
    busMessages: 0,
    mode: "hybrid",
  };

  constructor(opts: AgentRuntimeOptions) {
    this.id = opts.id ?? `agent_${crypto.randomUUID()}`;
    this.name = opts.name;
    this.mode = opts.mode ?? "hybrid";
    this.memory = opts.services?.memory;
    this.storage = opts.services?.storage;
    this.bus = opts.services?.bus;
    this.skills.push(...(opts.skills ?? []));
    this.plugins.push(...(opts.plugins ?? []));
    this.manifest = buildAgentManifest({
      id: this.id,
      name: this.name,
      systemPrompt: opts.systemPrompt,
      version: opts.version,
      description: opts.description,
      skills: this.skills,
      plugins: this.plugins,
      settings: opts.settings ?? {},
      tags: opts.tags ?? [],
    });
    this.recomputeStats();
  }

  async initialize(ctx: FrameworkContext): Promise<void> {
    this.status = "running";
    this.sessions.add(ctx.sessionId);
    this.recomputeStats();
    for (const plugin of this.plugins) {
      await runMiddleware(plugin.middleware, "beforeBuild", { runtime: this, ctx });
      if (plugin.setup) await plugin.setup(this, ctx);
      await runMiddleware(plugin.middleware, "afterBuild", { runtime: this, ctx });
    }
    this.status = "idle";
  }

  async destroy(ctx?: FrameworkContext): Promise<void> {
    const safeCtx = ctx ?? this.makeContext("task");
    for (const plugin of [...this.plugins].reverse()) {
      await runMiddleware(plugin.middleware, "beforePersist", { runtime: this, ctx: safeCtx });
      if (plugin.teardown) await plugin.teardown(this, safeCtx);
      await runMiddleware(plugin.middleware, "afterPersist", { runtime: this, ctx: safeCtx });
    }
    this.status = "stopped";
    this.recomputeStats();
  }

  registerSkill(skill: SkillDefinition): void {
    const idx = this.skills.findIndex((s) => s.id === skill.id);
    if (idx >= 0) this.skills[idx] = skill;
    else this.skills.push(skill);
    this.manifest.skills = [...this.skills];
    this.recomputeStats();
  }

  unregisterSkill(skillId: string): void {
    const idx = this.skills.findIndex((s) => s.id === skillId);
    if (idx >= 0) this.skills.splice(idx, 1);
    this.manifest.skills = [...this.skills];
    this.recomputeStats();
  }

  getSkill(skillId: string): SkillDefinition | undefined {
    return this.skills.find((s) => s.id === skillId);
  }

  listSkills(): SkillDefinition[] {
    return [...this.skills];
  }

  async use(plugin: FrameworkPlugin, ctx?: FrameworkContext): Promise<this> {
    const safeCtx = ctx ?? this.makeContext("task");
    this.plugins.push(plugin);
    this.manifest.plugins = [...this.plugins.map((p) => p.manifest)];
    await runMiddleware(plugin.middleware, "beforeBuild", { runtime: this, ctx: safeCtx });
    if (plugin.setup) await plugin.setup(this, safeCtx);
    await runMiddleware(plugin.middleware, "afterBuild", { runtime: this, ctx: safeCtx });
    this.recomputeStats();
    return this;
  }

  async run(input: AgentRunInput): Promise<AgentRunResult> {
    const requestId = `req_${crypto.randomUUID()}`;
    const ctx = this.makeContext(input.runMode ?? "task", input, requestId);
    this.status = "running";
    this.sessions.add(input.sessionId);
    this.recomputeStats();

    const trace: FrameworkEvent[] = [];
    const skillResults: AgentRunResult["skillResults"] = [];
    let output = "";
    let bestSkill: SkillDefinition | undefined;
    let bestScore = -1;

    try {
      await this.emitPhase("beforeRun", ctx, { input });
      const orderedSkills = [...this.skills]
        .filter((s) => s.enabled !== false)
        .sort((a, b) => scoreSkillCoverage(b, input.message) - scoreSkillCoverage(a, input.message));

      for (const skill of orderedSkills) {
        await this.emitSkillPhase("beforeSkill", ctx, skill);
        const skillCtx = this.makeSkillExecutionContext(input, ctx, trace);
        const handleScore = await canHandleSkill(skill, input.message, skillCtx);
        if (handleScore < 0.15) {
          skillResults.push({ skillId: skill.id, status: "skipped", score: handleScore });
          await this.emitSkillPhase("afterSkill", ctx, skill, { skipped: true, score: handleScore });
          continue;
        }

        try {
          const result = await executeSkill(skill, skillCtx);
          const score = Math.max(handleScore, scoreSkillCoverage(skill, input.message));
          skillResults.push({ skillId: skill.id, status: "passed", score, output: result });
          if (score > bestScore) {
            bestScore = score;
            bestSkill = skill;
            output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
          }
          await this.emitSkillPhase("afterSkill", ctx, skill, { output: result, score });
        } catch (error) {
          skillResults.push({
            skillId: skill.id,
            status: "failed",
            score: 0,
            error: error instanceof Error ? error.message : String(error),
          });
          this.statsState.errors++;
          await this.emitSkillPhase("afterSkill", ctx, skill, { error });
        }
      }

      if (!output) output = `No skill produced a concrete answer. Input preserved: ${input.message}`;
      const reflection = await this.maybeReflect(input, ctx, output, skillResults);
      await this.emitPhase("afterRun", ctx, { output, bestSkill: bestSkill?.id });

      this.statsState.runs++;
      this.statsState.lastRunAt = Date.now();
      this.status = "idle";
      this.recomputeStats();

      return {
        ok: true,
        requestId,
        sessionId: input.sessionId,
        output,
        status: "idle",
        trace,
        memoryIds: [],
        skillResults,
        reflection,
        metadata: { agentId: this.id, agentName: this.name, bestSkill: bestSkill?.id },
      };
    } catch (error) {
      this.status = "failed";
      this.statsState.errors++;
      this.recomputeStats();
      const err = error instanceof Error ? error.message : String(error);
      await this.emitPhase("error", ctx, { error: err });
      return {
        ok: false,
        requestId,
        sessionId: input.sessionId,
        output: `Agent run failed: ${err}`,
        status: "failed",
        trace,
        memoryIds: [],
        skillResults,
        metadata: { error: err },
      };
    }
  }

  async reflect(input: {
    sessionId: string;
    requestId: string;
    walletAddress?: string;
    sourceTurnId: string;
    taskType: string;
    outcome: "success" | "partial" | "failure" | "unknown";
    userInput: string;
    assistantOutput: string;
    errorText?: string;
    memoryIds?: string[];
    severity?: "low" | "medium" | "high" | "critical";
    confidence?: number;
  }): Promise<unknown> {
    const ctx = this.makeContext("reflect", {
      sessionId: input.sessionId,
      walletAddress: input.walletAddress,
      message: input.userInput,
    }, input.requestId);
    await this.emitPhase("beforeReflect", ctx, { input });
    const reflection = {
      sourceTurnId: input.sourceTurnId,
      taskType: input.taskType,
      outcome: input.outcome,
      summary: `Reflection for ${input.taskType}`,
      confidence: input.confidence ?? 0.75,
      severity: input.severity ?? "medium",
      tags: ["reflection", input.taskType, input.outcome],
      relatedMemoryIds: input.memoryIds ?? [],
      details: {
        requestId: input.requestId,
        output: input.assistantOutput,
        errorText: input.errorText,
      },
    };
    await this.emitPhase("afterReflect", ctx, { reflection });
    return reflection;
  }

  getStats(): RuntimeStats {
    return {
      ...this.statsState,
      sessions: this.sessions.size,
      activeSkills: this.skills.filter((s) => s.enabled !== false).length,
      plugins: this.plugins.length,
    };
  }

  async persistManifest(): Promise<AgentManifest | undefined> {
    if (!this.storage) return undefined;
    const manifest = buildAgentManifest({
      id: this.id,
      name: this.name,
      systemPrompt: this.manifest.systemPrompt,
      version: this.manifest.version,
      description: this.manifest.description,
      skills: this.skills,
      plugins: this.plugins,
      settings: this.manifest.settings,
      tags: this.manifest.tags,
    });
    await this.storage.put(`agents/${this.id}/manifest.json`, manifest, {
      contentType: "application/json",
      compress: true,
      metadata: { kind: "agent_manifest", agentId: this.id, agentName: this.name },
    });
    return manifest;
  }

  private async maybeReflect(
    input: AgentRunInput,
    ctx: FrameworkContext,
    output: string,
    skillResults: AgentRunResult["skillResults"]
  ): Promise<unknown | undefined> {
    const hasFailure = skillResults.some((result) => result.status === "failed");
    if (!hasFailure && !output.toLowerCase().includes("failed")) return undefined;
    return this.reflect({
      sessionId: input.sessionId,
      requestId: ctx.requestId,
      walletAddress: input.walletAddress,
      sourceTurnId: ctx.requestId,
      taskType: input.runMode ?? "task",
      outcome: hasFailure ? "partial" : "success",
      userInput: input.message,
      assistantOutput: output,
      memoryIds: [],
      confidence: 0.78,
      severity: "medium",
    });
  }

  private makeContext(runMode: AgentRunMode, input?: Partial<AgentRunInput>, requestId?: string): FrameworkContext {
    return {
      requestId: requestId ?? `req_${crypto.randomUUID()}`,
      sessionId: input?.sessionId ?? `session_${crypto.randomUUID()}`,
      walletAddress: input?.walletAddress,
      runMode,
      frameworkMode: this.mode,
      timestamp: Date.now(),
      userInput: input?.message,
      metadata: input?.metadata ?? {},
    };
  }

  private makeSkillExecutionContext(
    input: AgentRunInput,
    ctx: FrameworkContext,
    trace: FrameworkEvent[]
  ): SkillExecutionContext {
    return {
      requestId: ctx.requestId,
      sessionId: input.sessionId,
      walletAddress: input.walletAddress,
      input: input.message,
      normalizedInput: input.message.toLowerCase(),
      userInput: input.message,
      systemPrompt: this.manifest.systemPrompt,
      runMode: input.runMode ?? "task",
      frameworkMode: this.mode,
      metadata: input.metadata ?? {},
      trace,
      memoryHits: [],
      bus: this.bus,
      runtime: this,
    };
  }

  private async emitPhase(phase: HookPhase, ctx: FrameworkContext, payload: Record<string, unknown>): Promise<void> {
    for (const plugin of this.plugins) {
      await runMiddleware(plugin.middleware, phase, { runtime: this, ctx, ...payload });
    }
  }

  private async emitSkillPhase(
    phase: HookPhase,
    ctx: FrameworkContext,
    skill: SkillDefinition,
    payload: Record<string, unknown> = {}
  ): Promise<void> {
    for (const plugin of this.plugins) {
      await runMiddleware(plugin.middleware, phase, { runtime: this, ctx, input: skill, ...payload });
    }
  }

  private recomputeStats(): void {
    this.statsState = {
      ...this.statsState,
      sessions: this.sessions.size,
      activeSkills: this.skills.filter((s) => s.enabled !== false).length,
      plugins: this.plugins.length,
      mode: this.mode,
    };
  }
}

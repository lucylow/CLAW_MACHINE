import { randomUUID } from "crypto";
import { ComputeProvider } from "../providers/ComputeProvider";
import { StorageProvider } from "../providers/StorageProvider";
import { EventBus } from "../events/EventBus";
import { MemoryStore } from "../memory/MemoryStore";
import { ReflectionEngine } from "../reflection/ReflectionEngine";
import { SkillRegistry } from "../skills/SkillRegistry";
import { AgentTurnInput, AgentTurnResult } from "../types/runtime";
import { normalizeError } from "../errors/normalize";

export class AgentRuntime {
  constructor(
    private readonly compute: ComputeProvider,
    private readonly storage: StorageProvider,
    private readonly skills: SkillRegistry,
    private readonly memory: MemoryStore,
    private readonly reflection: ReflectionEngine,
    private readonly events: EventBus,
  ) {}

  async runTurn(input: AgentTurnInput, requestId?: string): Promise<AgentTurnResult> {
    const turnId = randomUUID();
    const trace: string[] = [];
    const memoryIds: string[] = [];
    let phase = "initialized";
    this.events.emit("message.received", { turnId, sessionId: input.sessionId, walletAddress: input.walletAddress }, requestId);

    let selectedSkill: string | undefined;
    try {
      phase = "selecting_skill";
      selectedSkill = this.selectSkill(input.input);
      trace.push(`phase:${phase}`);
      trace.push(`selected:${selectedSkill || "none"}`);
    } catch (error) {
      const normalized = normalizeError(error, { code: "AGENT_001_RUNTIME_FAILURE", category: "agent", operation: "agent.selectSkill" });
      trace.push(`phase_error:${phase}:${normalized.code}`);
      selectedSkill = undefined;
    }

    phase = "hydrating_memory";
    let contextSummary = "No memory available.";
    try {
      contextSummary = this.memory.summarize(input.sessionId);
      trace.push(`phase:${phase}`);
    } catch (error) {
      const normalized = normalizeError(error, { code: "MEM_002_RETRIEVE_FAILED", category: "memory", operation: "agent.hydrateMemory", retryable: false });
      trace.push(`phase_warning:${phase}:${normalized.code}`);
    }
    this.events.emit("memory.hydrated", { turnId, contextSummary }, requestId);

    let output = "";
    let txHash: string | undefined;
    let failed = false;
    let errorMessage: string | undefined;

    try {
      if (selectedSkill) {
        phase = "executing_skill";
        this.events.emit("skill.selected", { turnId, skillId: selectedSkill }, requestId);
        const result = await this.skills.execute(selectedSkill, { prompt: input.input, walletAddress: input.walletAddress });
        output = String(result.output || "Skill executed.");
        txHash = result.txHash ? String(result.txHash) : undefined;
        trace.push(`phase:${phase}`);
        trace.push(`executed:${selectedSkill}`);
      } else {
        phase = "calling_compute";
        this.events.emit("compute.request.started", { turnId }, requestId);
        const res = await this.compute.infer(`Context:\n${contextSummary}\n\nUser: ${input.input}`);
        output = res.content;
        this.events.emit("compute.request.completed", { turnId, model: res.model }, requestId);
        trace.push(`phase:${phase}`);
        trace.push("executed:compute");
      }
    } catch (error) {
      failed = true;
      const normalized = normalizeError(error, { code: "AGENT_001_RUNTIME_FAILURE", category: "agent", operation: `agent.${phase}` });
      errorMessage = normalized.message;
      output = `I hit an execution issue: ${errorMessage}. I switched to safe fallback mode and stored this for future improvement.`;
      trace.push(`phase_error:${phase}:${normalized.code}`);
      trace.push("fallback:activated");
      this.events.emit("fallback.activated", { turnId, errorCode: normalized.code, errorMessage }, requestId);
    }

    const turnMemory = this.memory.store({
      type: "conversation_turn",
      sessionId: input.sessionId,
      walletAddress: input.walletAddress,
      summary: `User asked: ${input.input.slice(0, 80)}`,
      content: { input: input.input, output, turnId, selectedSkill, txHash },
      tags: [selectedSkill || "chat"],
      importance: failed ? 0.9 : 0.6,
      sourceTurnId: turnId,
      sourceSkillId: selectedSkill,
      storageRefs: [],
      chainRefs: txHash ? [txHash] : [],
      reflectionRefs: [],
    });
    memoryIds.push(turnMemory.id);

    let reflection = null;
    try {
      phase = "reflecting";
      reflection = await this.reflection.generate({
        sourceTurnId: turnId,
        taskType: selectedSkill || "general_chat",
        success: !failed,
        errorMessage,
        selectedSkill,
        relatedMemoryIds: [turnMemory.id],
        trace,
        compute: this.compute,
      });
      trace.push(`phase:${phase}`);
    } catch (error) {
      const normalized = normalizeError(error, { code: "REFL_001_GENERATION_FAILED", category: "reflection", operation: "agent.reflect" });
      trace.push(`phase_warning:${phase}:${normalized.code}`);
    }

    const reflections = reflection ? [reflection] : [];
    if (reflection) {
      this.events.emit("reflection.generated", { turnId, reflectionId: reflection.reflectionId }, requestId);
      const reflectionMemory = this.memory.store({
        type: "reflection",
        sessionId: input.sessionId,
        walletAddress: input.walletAddress,
        summary: reflection.mistakeSummary,
        content: reflection as unknown as Record<string, unknown>,
        tags: reflection.tags,
        importance: reflection.severity === "high" ? 0.95 : 0.5,
        sourceTurnId: turnId,
        sourceSkillId: selectedSkill,
        storageRefs: [],
        chainRefs: [],
        reflectionRefs: [reflection.reflectionId],
      });
      memoryIds.push(reflectionMemory.id);
    }

    let artifactHash = "";
    try {
      phase = "persisting_result";
      artifactHash = await this.storage.upload(Buffer.from(JSON.stringify({ turnId, input: input.input, output })));
      this.events.emit("storage.write.completed", { turnId, artifactHash }, requestId);
      trace.push(`phase:${phase}`);
    } catch (error) {
      const normalized = normalizeError(error, { code: "MEM_001_SAVE_FAILED", category: "memory", operation: "agent.persistResult", retryable: true });
      trace.push(`phase_warning:${phase}:${normalized.code}`);
    }

    if (artifactHash) {
      this.memory.store({
        type: "artifact",
        sessionId: input.sessionId,
        walletAddress: input.walletAddress,
        summary: `Turn artifact ${artifactHash.slice(0, 12)}...`,
        content: { turnId, artifactHash },
        tags: ["artifact", selectedSkill || "chat"],
        importance: 0.4,
        sourceTurnId: turnId,
        sourceSkillId: selectedSkill,
        storageRefs: [artifactHash],
        chainRefs: txHash ? [txHash] : [],
        reflectionRefs: reflections.map((r) => r.reflectionId),
      });
    }

    const prunedCount = this.memory.prune();
    if (prunedCount > 0) {
      this.events.emit("memory.pruned", { prunedCount }, requestId);
    }

    return {
      turnId,
      output,
      txHash,
      selectedSkill,
      trace,
      reflections,
      memoryIds,
      degradedMode: failed || !artifactHash,
      timestamp: Date.now(),
    };
  }

  getInsights(sessionId: string) {
    return {
      memorySummary: this.memory.summarize(sessionId),
      recentReflections: this.reflection.listRecent(6),
      recentEvents: this.events.recent(20),
      memories: this.memory.listBySession(sessionId).slice(-20),
    };
  }

  private selectSkill(input: string): string | undefined {
    const lower = input.toLowerCase();
    if (lower.includes("swap") || lower.includes("uniswap")) return "uniswap.swap";
    if (lower.includes("storage") || lower.includes("store")) return "og.storage";
    if (lower.includes("price")) return "price.oracle";
    if (lower.includes("wallet") || lower.includes("balance")) return "wallet.analysis";
    if (lower.includes("ens") || lower.includes(".eth")) return "ens.lookup";
    if (lower.includes("reflection") || lower.includes("mistake")) return "reflection.summarize";
    if (lower.includes("swarm") || lower.includes("coordinate") || lower.includes("team")) return "agent.swarm";
    return undefined;
  }
}

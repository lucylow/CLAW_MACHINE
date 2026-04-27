import { randomUUID } from "crypto";
import { ReflectionRecord } from "../types/runtime";

export class ReflectionEngine {
  private readonly reflections = new Map<string, ReflectionRecord>();
  private readonly modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  generate(params: {
    sourceTurnId: string;
    taskType: string;
    success: boolean;
    errorMessage?: string;
    selectedSkill?: string;
    relatedMemoryIds?: string[];
  }): ReflectionRecord | null {
    if (params.success && !params.errorMessage) return null;
    const reflection: ReflectionRecord = {
      reflectionId: randomUUID(),
      sourceTurnId: params.sourceTurnId,
      taskType: params.taskType,
      result: params.success ? "success" : "failure",
      rootCause: params.errorMessage ? "Skill/runtime failure" : "Outcome review trigger",
      mistakeSummary: params.errorMessage || "Response quality was low or ambiguous.",
      correctiveAdvice: params.selectedSkill
        ? `Validate input and add fallback path before running ${params.selectedSkill}.`
        : "Ask clarifying questions and use conservative defaults.",
      confidence: params.success ? 0.62 : 0.88,
      severity: params.success ? "low" : "high",
      tags: [params.taskType, params.selectedSkill || "general", params.success ? "post_success" : "post_failure"],
      relatedMemoryIds: params.relatedMemoryIds || [],
      nextBestAction: params.success ? "Persist useful artifacts and continue." : "Retry with safer parameters or alternate skill.",
      createdAt: Date.now(),
      model: this.modelName,
      computeRef: "local-reflection-engine",
    };
    this.reflections.set(reflection.reflectionId, reflection);
    return reflection;
  }

  listRecent(limit = 10): ReflectionRecord[] {
    return [...this.reflections.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

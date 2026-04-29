import { randomUUID } from "crypto";
import { ReflectionRecord } from "../types/runtime";

export class ReflectionEngine {
  private readonly reflections = new Map<string, ReflectionRecord>();
  private readonly modelName: string;

  constructor(modelName: string) {
    this.modelName = modelName;
  }

  async generate(params: {
    sourceTurnId: string;
    taskType: string;
    success: boolean;
    errorMessage?: string;
    selectedSkill?: string;
    relatedMemoryIds?: string[];
    trace?: string[];
    compute?: any; // Pass compute provider for LLM-based reflection
  }): Promise<ReflectionRecord | null> {
    // We now reflect on both successes and failures to build a better knowledge base
    let reflection: ReflectionRecord;
    
    if (params.compute && (params.errorMessage || !params.success)) {
      try {
        const prompt = `Analyze this agent execution turn and provide a structured reflection.
Task: ${params.taskType}
Skill: ${params.selectedSkill || 'none'}
Success: ${params.success}
Error: ${params.errorMessage || 'none'}
Trace: ${params.trace?.join(' -> ') || 'none'}

Return JSON: { "rootCause": string, "mistakeSummary": string, "correctiveAdvice": string, "severity": "low"|"medium"|"high", "nextBestAction": string }`;
        
        const res = await params.compute.infer(prompt);
        const analysis = JSON.parse(res.content.replace(/```json|```/g, ''));
        
        reflection = {
          reflectionId: randomUUID(),
          sourceTurnId: params.sourceTurnId,
          taskType: params.taskType,
          result: params.success ? "success" : "failure",
          rootCause: analysis.rootCause,
          mistakeSummary: analysis.mistakeSummary,
          correctiveAdvice: analysis.correctiveAdvice,
          confidence: 0.92,
          severity: analysis.severity,
          tags: [params.taskType, params.selectedSkill || "general", "llm_analyzed"],
          relatedMemoryIds: params.relatedMemoryIds || [],
          nextBestAction: analysis.nextBestAction,
          createdAt: Date.now(),
          model: this.modelName,
          computeRef: "0g-compute-reflection",
        };
      } catch (e) {
        // Fallback to rule-based if LLM fails
        return this.generateRuleBased(params);
      }
    } else {
      return this.generateRuleBased(params);
    }

    this.reflections.set(reflection.reflectionId, reflection);
    return reflection;
  }

  private generateRuleBased(params: any): ReflectionRecord | null {
    const isSuccess = params.success && !params.errorMessage;
    const reflection: ReflectionRecord = {
      reflectionId: randomUUID(),
      sourceTurnId: params.sourceTurnId,
      taskType: params.taskType,
      result: isSuccess ? "success" : "failure",
      rootCause: params.errorMessage
        ? "Skill/runtime failure"
        : isSuccess
          ? "No failure detected"
          : "Outcome review trigger",
      mistakeSummary: params.errorMessage
        ? String(params.errorMessage)
        : isSuccess
          ? "No corrective action needed"
          : "Response quality was low or ambiguous.",
      correctiveAdvice: params.selectedSkill
        ? isSuccess
          ? `Reinforce successful use of ${params.selectedSkill}.`
          : `Validate input and add fallback path before running ${params.selectedSkill}.`
        : isSuccess
          ? "Reinforce the successful pattern"
          : "Ask clarifying questions and use conservative defaults.",
      confidence: isSuccess ? 0.62 : 0.88,
      severity: isSuccess ? "low" : "high",
      tags: [params.taskType, params.selectedSkill || "general", isSuccess ? "post_success" : "post_failure"],
      relatedMemoryIds: params.relatedMemoryIds || [],
      nextBestAction: isSuccess
        ? "Persist useful artifacts and continue."
        : "Retry with safer parameters or alternate skill.",
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

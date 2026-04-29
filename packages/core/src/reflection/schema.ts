export interface ReflectionPromptInput {
  task: string;
  outcome: "success" | "failure";
  trace: string[];
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ReflectionOutput {
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  severity: "low" | "medium" | "high";
}

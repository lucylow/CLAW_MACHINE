/**
 * Prompt Templates
 *
 * All LLM prompt templates are separated from business logic here so they can
 * be edited, versioned, and tested independently.
 *
 * Templates are used by:
 *   - AgentRuntime (task execution, skill selection)
 *   - MemoryOrchestrator (reflection generation)
 *   - HierarchicalPlanner (goal decomposition, synthesis)
 *   - PruningService (summarization)
 *   - ReflectionEngine (structured reflection)
 */

// ── System Prompts ────────────────────────────────────────────────────────────

export const AGENT_SYSTEM = `You are an autonomous AI agent running on the Claw Machine framework, powered by 0G Compute and 0G Storage.

You have access to a set of skills (tools) that you can use to complete tasks. When you need to use a skill, respond with the skill ID only (e.g., "0g.storage.upload").

You have persistent memory: prior lessons from past tasks will be provided in context. Use them to avoid repeating mistakes.

Always be concise, accurate, and transparent about what you are doing and why.`;

export const REFLECTION_SYSTEM = `You are a reflection engine for an AI agent. Your job is to analyze a completed task and produce a structured JSON reflection.

The reflection must be valid JSON with exactly these fields:
{
  "taskType": "string — category of the task (e.g. storage, compute, onchain, analysis)",
  "rootCause": "string — the underlying reason for success or failure",
  "mistakeSummary": "string — what went wrong or could be improved (empty string if fully successful)",
  "correctiveAdvice": "string — specific actionable advice for future similar tasks",
  "confidence": number between 0 and 1,
  "severity": "low" | "medium" | "high" | "critical",
  "tags": ["array", "of", "relevant", "tags"]
}

Respond with only the JSON object, no markdown, no explanation.`;

export const PLANNER_SYSTEM = `You are a hierarchical planning agent. Given a complex goal, decompose it into a minimal set of sub-tasks with explicit dependencies.

Respond with a JSON array of task objects:
[
  { "id": "task-1", "goal": "string", "dependencies": [], "skillHint": "optional skill id" },
  { "id": "task-2", "goal": "string", "dependencies": ["task-1"], "skillHint": "optional skill id" }
]

Rules:
- Use the minimum number of tasks needed (2–6 for most goals)
- Only add a dependency if task B genuinely requires task A's output
- skillHint should be one of: 0g.storage.upload, 0g.compute.infer, 0g.wallet.balance, uniswap.swap, ens.lookup, price.oracle, agent.swarm
- Respond with only the JSON array, no markdown`;

export const SUMMARIZE_SYSTEM = `You are a memory summarization agent. Given a set of agent conversation episodes, produce a concise summary that captures the key lessons, patterns, and outcomes.

The summary should be 2–4 sentences and focus on what the agent learned, what worked, and what failed. Be specific and actionable.`;

export const SKILL_SELECT_SYSTEM = `You are a skill routing agent. Given a user message, select the most appropriate skill ID from the available skills.

Respond with only the skill ID string (e.g., "0g.storage.upload"). If no skill is appropriate, respond with "none".`;

// ── Builder Functions ─────────────────────────────────────────────────────────

export function buildReflectionPrompt(
  taskInput: string,
  taskOutput: string,
  success: boolean,
): string {
  return `Task: ${taskInput.slice(0, 500)}

Outcome: ${success ? "SUCCESS" : "FAILURE"}

Agent output: ${taskOutput.slice(0, 800)}

Generate a structured reflection for this task outcome.`;
}

export function buildPlannerPrompt(goal: string, lessonContext?: string): string {
  const lessons = lessonContext ? `\n\nRelevant prior lessons:\n${lessonContext}` : "";
  return `Goal: ${goal.slice(0, 600)}${lessons}

Decompose this goal into sub-tasks with dependencies.`;
}

export function buildSynthesisPrompt(
  originalGoal: string,
  completedTasks: Array<{ goal: string; result: string }>,
): string {
  const taskSummaries = completedTasks
    .map((t, i) => `Task ${i + 1}: ${t.goal}\nResult: ${t.result.slice(0, 300)}`)
    .join("\n\n");

  return `Original goal: ${originalGoal}

Completed tasks:
${taskSummaries}

Synthesize these results into a single coherent final answer for the original goal.`;
}

export function buildSummarizePrompt(episodeTexts: string, count: number): string {
  return `Summarize the following ${count} agent conversation episodes into a concise memory entry:

${episodeTexts.slice(0, 3000)}`;
}

export function buildSkillSelectPrompt(
  userMessage: string,
  availableSkills: Array<{ id: string; description: string }>,
  lessonContext?: string,
): string {
  const skillList = availableSkills
    .map((s) => `${s.id}: ${s.description}`)
    .join("\n");

  const lessons = lessonContext ? `\nPrior lessons:\n${lessonContext}\n` : "";

  return `Available skills:
${skillList}
${lessons}
User message: ${userMessage.slice(0, 400)}

Which skill should be used? Respond with only the skill ID.`;
}

export function buildTaskPrompt(
  userMessage: string,
  lessonContext: string,
  skillResult?: string,
): string {
  const lessons = lessonContext ? `\n\nPrior lessons from memory:\n${lessonContext}` : "";
  const result = skillResult ? `\n\nSkill execution result:\n${skillResult}` : "";

  return `${userMessage}${lessons}${result}`;
}

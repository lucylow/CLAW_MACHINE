export type RuntimeHealth = "healthy" | "degraded" | "offline";

export type MemoryType =
  | "session_state"
  | "conversation_turn"
  | "task_result"
  | "reflection"
  | "skill_execution"
  | "wallet_profile"
  | "artifact"
  | "error_event"
  | "summary";

export interface MemoryRecord {
  id: string;
  type: MemoryType;
  sessionId: string;
  walletAddress?: string;
  createdAt: number;
  updatedAt: number;
  summary: string;
  content: Record<string, unknown>;
  tags: string[];
  importance: number;
  sourceTurnId?: string;
  sourceSkillId?: string;
  storageRefs: string[];
  chainRefs: string[];
  reflectionRefs: string[];
  pinned?: boolean;
  version: string;
}

export interface ReflectionRecord {
  reflectionId: string;
  sourceTurnId: string;
  taskType: string;
  result: "success" | "failure";
  rootCause: string;
  mistakeSummary: string;
  correctiveAdvice: string;
  confidence: number;
  severity: "low" | "medium" | "high";
  tags: string[];
  relatedMemoryIds: string[];
  nextBestAction: string;
  createdAt: number;
  model: string;
  computeRef?: string;
}

export interface AgentTurnInput {
  input: string;
  walletAddress?: string;
  sessionId: string;
}

export interface AgentTurnResult {
  turnId: string;
  output: string;
  txHash?: string;
  selectedSkill?: string;
  trace: string[];
  reflections: ReflectionRecord[];
  memoryIds: string[];
  degradedMode: boolean;
  timestamp: number;
}

export interface SkillManifest {
  id: string;
  name: string;
  description: string;
  tags: string[];
  requiresWallet: boolean;
  touchesChain: boolean;
  usesCompute: boolean;
  usesStorage: boolean;
  enabled: boolean;
}

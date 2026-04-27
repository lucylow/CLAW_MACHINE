// ── Agent API Types ────────────────────────────────────────────────────────

export type ErrorCategory =
  | 'validation'
  | 'configuration'
  | 'authentication'
  | 'authorization'
  | 'wallet'
  | 'chain'
  | 'storage'
  | 'compute'
  | 'agent'
  | 'skill'
  | 'reflection'
  | 'memory'
  | 'event'
  | 'external'
  | 'rate_limit'
  | 'not_found'
  | 'conflict'
  | 'internal';

export interface ApiErrorShape {
  code: string;
  message: string;
  category: ErrorCategory;
  recoverable: boolean;
  retryable: boolean;
  requestId?: string;
  details?: Record<string, unknown>;
  timestamp?: number;
}

export interface ApiSuccess<T> {
  ok: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  ok: false;
  error: ApiErrorShape;
}

export interface AgentStatusResponse {
  status: 'idle' | 'processing' | 'error' | 'online';
  agent: string;
  network: string;
  model: string;
  storage?: string;
  compute?: string;
  version?: string;
  chainId?: number;
  rpc?: string;
  uptime?: number;
}

export interface AgentRunRequest {
  input: string;
  walletAddress?: string;
}

export interface AgentRunResponse {
  output: string;
  txHash?: string;
  skillUsed?: string;
  timestamp?: number;
  error?: string;
}

// ── Skill Types ────────────────────────────────────────────────────────────

export interface SkillInfo {
  name: string;
  description: string;
  enabled: boolean;
}

export interface SkillsResponse {
  skills: SkillInfo[];
}

export interface SkillExecuteRequest {
  skill: string;
  params: Record<string, any>;
}

export interface SkillExecuteResponse {
  skill: string;
  result: any;
  timestamp: number;
}

// ── History Types ──────────────────────────────────────────────────────────

export interface HistoryMessage {
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  txHash?: string;
}

export interface HistoryResponse {
  history: HistoryMessage[];
  count: number;
}

// ── Storage Types ──────────────────────────────────────────────────────────

export interface StorageUploadRequest {
  data: any;
  metadata?: Record<string, any>;
}

export interface StorageUploadResponse {
  rootHash: string;
  metadata?: Record<string, any>;
  timestamp: number;
  network: string;
}

// ── Wallet Types ───────────────────────────────────────────────────────────

export interface WalletRegisterRequest {
  walletAddress: string;
  signature: string;
  message: string;
}

export interface WalletRegisterResponse {
  registered: boolean;
  walletAddress: string;
  timestamp: number;
}

export interface WalletConfig {
  model: string;
  maxHistory: number;
  [key: string]: any;
}

export interface WalletConfigResponse {
  walletAddress: string;
  config: WalletConfig;
}

// ── Transaction Types ──────────────────────────────────────────────────────

export interface Transaction {
  hash?: string;
  description?: string;
  type?: string;
  status: 'success' | 'pending' | 'failed';
  timestamp: number;
}

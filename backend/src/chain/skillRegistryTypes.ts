export type Address = `0x${string}`;
export type Bytes32 = `0x${string}`;

export type SkillStatus = "Draft" | "Active" | "Paused" | "Deprecated" | "Revoked";

export interface SkillVersionData {
  version: bigint;
  implementationUri: string;
  metadataUri: string;
  storageUri: string;
  computeModel: string;
  entrypoint: string;
  inputSchemaHash: Bytes32;
  outputSchemaHash: Bytes32;
  codeHash: Bytes32;
  requiresWallet: boolean;
  requiresApproval: boolean;
  publicUse: boolean;
  enabled: boolean;
  createdAt: bigint;
  updatedAt: bigint;
  tags: string[];
  capabilityHints: string[];
}

export interface SkillRecordData {
  skillId: Bytes32;
  owner: Address;
  namespace: string;
  name: string;
  description: string;
  status: SkillStatus;
  activeVersion: bigint;
  latestVersion: bigint;
  createdAt: bigint;
  updatedAt: bigint;
  totalUsage: bigint;
  totalSuccesses: bigint;
  totalFailures: bigint;
  averageLatencyMs: bigint;
  feeBps: bigint;
  allowPublicUse: boolean;
  approved: boolean;
  pinnedTo0G: boolean;
  pinnedStorageUri: string;
  pinnedComputeUri: string;
  explorerUri: string;
  implementationAddress: Address;
  lastUpdatedBy: Address;
  metadataHash: Bytes32;
}

export interface UsageReportData {
  successCount: bigint;
  failureCount: bigint;
  totalLatencyMs: bigint;
  lastUsedAt: bigint;
  lastRunHash: Bytes32;
}

export interface RegisterSkillInput {
  owner: Address;
  namespace: string;
  name: string;
  description: string;
  implementationUri: string;
  metadataUri: string;
  storageUri: string;
  computeModel: string;
  entrypoint: string;
  inputSchemaHash: Bytes32;
  outputSchemaHash: Bytes32;
  codeHash: Bytes32;
  requiresWallet: boolean;
  requiresApproval: boolean;
  publicUse: boolean;
  feeBps: bigint;
  pinnedStorageUri: string;
  pinnedComputeUri: string;
  explorerUri: string;
  implementationAddress: Address;
  metadataHash: Bytes32;
  tags: string[];
  capabilityHints: string[];
}

export interface AddVersionInput {
  implementationUri: string;
  metadataUri: string;
  storageUri: string;
  computeModel: string;
  entrypoint: string;
  inputSchemaHash: Bytes32;
  outputSchemaHash: Bytes32;
  codeHash: Bytes32;
  requiresWallet: boolean;
  requiresApproval: boolean;
  publicUse: boolean;
  implementationAddress: Address;
  metadataHash: Bytes32;
  tags: string[];
  capabilityHints: string[];
}

export interface SkillRegistryConfig {
  chainId: number;
  registryAddress: Address;
  rpcUrl: string;
  explorerBaseUrl?: string;
  adminAddress?: Address;
}

export interface SkillSummary {
  skillId: Bytes32;
  owner: Address;
  namespace: string;
  name: string;
  description: string;
  status: SkillStatus;
  activeVersion: bigint;
  latestVersion: bigint;
  approved: boolean;
  allowPublicUse: boolean;
  pinnedTo0G: boolean;
  explorerUri: string;
  tags: string[];
  capabilityHints: string[];
  implementationAddress: Address;
  metadataHash: Bytes32;
}

export interface PagedSkillResult {
  ids: Bytes32[];
  nextOffset: bigint | null;
}

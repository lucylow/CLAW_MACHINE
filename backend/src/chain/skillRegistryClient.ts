import { Contract, JsonRpcProvider, Wallet } from "ethers";
import { skillRegistryAbi } from "./skillRegistryAbi";
import type {
  AddVersionInput,
  Address,
  Bytes32,
  PagedSkillResult,
  RegisterSkillInput,
  SkillRecordData,
  SkillRegistryConfig,
  SkillSummary,
  SkillVersionData,
  UsageReportData,
} from "./skillRegistryTypes";

export class SkillRegistryClient {
  private readonly provider: JsonRpcProvider;
  private readonly contract: Contract;
  private readonly config: SkillRegistryConfig;

  constructor(config: SkillRegistryConfig, signer?: Wallet) {
    this.config = config;
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId);
    this.contract = new Contract(config.registryAddress, skillRegistryAbi, signer ?? this.provider);
  }

  connectSigner(privateKey: string): SkillRegistryClient {
    const wallet = new Wallet(privateKey, this.provider);
    return new SkillRegistryClient(this.config, wallet);
  }

  async registerSkill(input: RegisterSkillInput) {
    const tx = await this.contract.registerSkill(this.toContractRegisterInput(input));
    const receipt = await tx.wait();
    return this.parseHashFromReceipt(receipt, "SkillRegistered");
  }

  async registerSkillForOwner(input: RegisterSkillInput) {
    const tx = await this.contract.registerSkillForOwner(this.toContractRegisterInput(input));
    const receipt = await tx.wait();
    return this.parseHashFromReceipt(receipt, "SkillRegistered");
  }

  async addVersion(skillId: Bytes32, input: AddVersionInput) {
    const tx = await this.contract.addSkillVersion(skillId, this.toContractVersionInput(input));
    const receipt = await tx.wait();
    return this.parseVersionFromReceipt(receipt, "SkillVersionAdded");
  }

  async activateVersion(skillId: Bytes32, version: bigint) {
    return (await this.contract.activateSkillVersion(skillId, version)).wait();
  }
  async pauseSkill(skillId: Bytes32) {
    return (await this.contract.pauseSkill(skillId)).wait();
  }
  async unpauseSkill(skillId: Bytes32) {
    return (await this.contract.unpauseSkill(skillId)).wait();
  }
  async deprecateSkill(skillId: Bytes32, reason: string) {
    return (await this.contract.deprecateSkill(skillId, reason)).wait();
  }
  async approveSkill(skillId: Bytes32, approved: boolean) {
    return (await this.contract.approveSkill(skillId, approved)).wait();
  }
  async approveOperator(skillId: Bytes32, operator: Address) {
    return (await this.contract.approveOperator(skillId, operator)).wait();
  }
  async revokeOperator(skillId: Bytes32, operator: Address) {
    return (await this.contract.revokeOperator(skillId, operator)).wait();
  }
  async grantCurator(skillId: Bytes32, curator: Address) {
    return (await this.contract.grantCurator(skillId, curator)).wait();
  }
  async revokeCurator(skillId: Bytes32, curator: Address) {
    return (await this.contract.revokeCurator(skillId, curator)).wait();
  }
  async transferOwnership(skillId: Bytes32, newOwner: Address) {
    return (await this.contract.transferSkillOwnership(skillId, newOwner)).wait();
  }
  async pinSkill(skillId: Bytes32, storageUri: string, computeUri: string, metadataHash: Bytes32) {
    return (await this.contract.pinSkill(skillId, storageUri, computeUri, metadataHash)).wait();
  }
  async setExplorerUri(skillId: Bytes32, explorerUri: string) {
    return (await this.contract.setExplorerUri(skillId, explorerUri)).wait();
  }
  async reportUsage(skillId: Bytes32, success: boolean, latencyMs: bigint, runHash: Bytes32) {
    return (await this.contract.reportUsage(skillId, success, latencyMs, runHash)).wait();
  }

  async getSkill(skillId: Bytes32): Promise<SkillRecordData> {
    return this.mapSkillRecord(await this.contract.getSkill(skillId));
  }

  async getSkillById(skillId: Bytes32): Promise<{ record: SkillRecordData; activeVersion: SkillVersionData; usage: UsageReportData }> {
    const [record, activeVersion, usage] = await this.contract.getSkillById(skillId);
    return { record: this.mapSkillRecord(record), activeVersion: this.mapSkillVersion(activeVersion), usage: this.mapUsage(usage) };
  }

  async getSkillVersion(skillId: Bytes32, version: bigint): Promise<SkillVersionData> {
    return this.mapSkillVersion(await this.contract.getSkillVersion(skillId, version));
  }

  async getSkillIds(offset = 0n, limit = 50n): Promise<PagedSkillResult> {
    const ids = (await this.contract.getSkillIds({ offset, limit })) as Bytes32[];
    return { ids, nextOffset: ids.length < Number(limit) ? null : offset + BigInt(ids.length) };
  }

  async getSkillsByOwner(owner: Address, offset = 0n, limit = 50n): Promise<PagedSkillResult> {
    const ids = (await this.contract.getSkillsByOwner(owner, { offset, limit })) as Bytes32[];
    return { ids, nextOffset: ids.length < Number(limit) ? null : offset + BigInt(ids.length) };
  }

  async getUsage(skillId: Bytes32): Promise<UsageReportData> {
    return this.mapUsage(await this.contract.getUsage(skillId));
  }
  async isSkillReady(skillId: Bytes32): Promise<boolean> {
    return this.contract.isSkillReady(skillId);
  }
  async totalSkills(): Promise<bigint> {
    return this.contract.totalSkills();
  }
  async skillExists(skillId: Bytes32): Promise<boolean> {
    return this.contract.skillExists(skillId);
  }
  async isApprovedOperator(skillId: Bytes32, operator: Address): Promise<boolean> {
    return this.contract.isApprovedOperator(skillId, operator);
  }
  async isCurator(skillId: Bytes32, account: Address): Promise<boolean> {
    return this.contract.isCurator(skillId, account);
  }

  async searchByOwner(owner: Address, limit = 50n) {
    const { ids } = await this.getSkillsByOwner(owner, 0n, limit);
    const result: SkillSummary[] = [];
    for (const id of ids) {
      const { record, activeVersion } = await this.getSkillById(id);
      result.push(this.toSummary(record, activeVersion));
    }
    return result;
  }

  async searchAll(limit = 50n) {
    const { ids } = await this.getSkillIds(0n, limit);
    const result: SkillSummary[] = [];
    for (const id of ids) {
      const { record, activeVersion } = await this.getSkillById(id);
      result.push(this.toSummary(record, activeVersion));
    }
    return result;
  }

  private toContractRegisterInput(input: RegisterSkillInput) {
    return [
      input.owner,
      input.namespace,
      input.name,
      input.description,
      input.implementationUri,
      input.metadataUri,
      input.storageUri,
      input.computeModel,
      input.entrypoint,
      input.inputSchemaHash,
      input.outputSchemaHash,
      input.codeHash,
      input.requiresWallet,
      input.requiresApproval,
      input.publicUse,
      input.feeBps,
      input.pinnedStorageUri,
      input.pinnedComputeUri,
      input.explorerUri,
      input.implementationAddress,
      input.metadataHash,
      input.tags,
      input.capabilityHints,
    ] as const;
  }
  private toContractVersionInput(input: AddVersionInput) {
    return [
      input.implementationUri,
      input.metadataUri,
      input.storageUri,
      input.computeModel,
      input.entrypoint,
      input.inputSchemaHash,
      input.outputSchemaHash,
      input.codeHash,
      input.requiresWallet,
      input.requiresApproval,
      input.publicUse,
      input.implementationAddress,
      input.metadataHash,
      input.tags,
      input.capabilityHints,
    ] as const;
  }
  private mapSkillRecord(data: any): SkillRecordData {
    return {
      skillId: data.skillId as Bytes32,
      owner: data.owner as Address,
      namespace: String(data.namespace),
      name: String(data.name),
      description: String(data.description),
      status: ["Draft", "Active", "Paused", "Deprecated", "Revoked"][Number(data.status)] as SkillRecordData["status"],
      activeVersion: BigInt(data.activeVersion),
      latestVersion: BigInt(data.latestVersion),
      createdAt: BigInt(data.createdAt),
      updatedAt: BigInt(data.updatedAt),
      totalUsage: BigInt(data.totalUsage),
      totalSuccesses: BigInt(data.totalSuccesses),
      totalFailures: BigInt(data.totalFailures),
      averageLatencyMs: BigInt(data.averageLatencyMs),
      feeBps: BigInt(data.feeBps),
      allowPublicUse: Boolean(data.allowPublicUse),
      approved: Boolean(data.approved),
      pinnedTo0G: Boolean(data.pinnedTo0G),
      pinnedStorageUri: String(data.pinnedStorageUri),
      pinnedComputeUri: String(data.pinnedComputeUri),
      explorerUri: String(data.explorerUri),
      implementationAddress: data.implementationAddress as Address,
      lastUpdatedBy: data.lastUpdatedBy as Address,
      metadataHash: data.metadataHash as Bytes32,
    };
  }
  private mapSkillVersion(data: any): SkillVersionData {
    return {
      version: BigInt(data.version),
      implementationUri: String(data.implementationUri),
      metadataUri: String(data.metadataUri),
      storageUri: String(data.storageUri),
      computeModel: String(data.computeModel),
      entrypoint: String(data.entrypoint),
      inputSchemaHash: data.inputSchemaHash as Bytes32,
      outputSchemaHash: data.outputSchemaHash as Bytes32,
      codeHash: data.codeHash as Bytes32,
      requiresWallet: Boolean(data.requiresWallet),
      requiresApproval: Boolean(data.requiresApproval),
      publicUse: Boolean(data.publicUse),
      enabled: Boolean(data.enabled),
      createdAt: BigInt(data.createdAt),
      updatedAt: BigInt(data.updatedAt),
      tags: Array.from(data.tags ?? []).map(String),
      capabilityHints: Array.from(data.capabilityHints ?? []).map(String),
    };
  }
  private mapUsage(data: any): UsageReportData {
    return {
      successCount: BigInt(data.successCount),
      failureCount: BigInt(data.failureCount),
      totalLatencyMs: BigInt(data.totalLatencyMs),
      lastUsedAt: BigInt(data.lastUsedAt),
      lastRunHash: data.lastRunHash as Bytes32,
    };
  }
  private toSummary(record: SkillRecordData, activeVersion: SkillVersionData): SkillSummary {
    return {
      skillId: record.skillId,
      owner: record.owner,
      namespace: record.namespace,
      name: record.name,
      description: record.description,
      status: record.status,
      activeVersion: record.activeVersion,
      latestVersion: record.latestVersion,
      approved: record.approved,
      allowPublicUse: record.allowPublicUse,
      pinnedTo0G: record.pinnedTo0G,
      explorerUri: record.explorerUri,
      tags: activeVersion.tags,
      capabilityHints: activeVersion.capabilityHints,
      implementationAddress: record.implementationAddress,
      metadataHash: record.metadataHash,
    };
  }
  private parseHashFromReceipt(receipt: any, eventName: string): Bytes32 {
    const log = receipt?.logs?.find?.((entry: any) => entry.fragment?.name === eventName);
    return (log?.args?.skillId as Bytes32) ?? ("0x" + "0".repeat(64)) as Bytes32;
  }
  private parseVersionFromReceipt(receipt: any, eventName: string): bigint {
    const log = receipt?.logs?.find?.((entry: any) => entry.fragment?.name === eventName);
    return log?.args?.version ? BigInt(log.args.version) : 0n;
  }
}

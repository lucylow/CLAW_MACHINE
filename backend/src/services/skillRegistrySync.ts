import { Contract, JsonRpcProvider } from "ethers";
import { skillRegistryAbi } from "../chain/skillRegistryAbi";
import type { Address, Bytes32, SkillRecordData, SkillRegistryConfig, SkillVersionData, UsageReportData } from "../chain/skillRegistryTypes";

export interface SkillRegistrySyncOptions {
  config: SkillRegistryConfig;
  onSkillUpsert?: (data: {
    skillId: Bytes32;
    record: SkillRecordData;
    activeVersion: SkillVersionData;
    usage: UsageReportData;
    txHash?: string;
    blockNumber?: number;
  }) => Promise<void> | void;
  onSkillRemoved?: (skillId: Bytes32) => Promise<void> | void;
  logger?: { info(message: string, meta?: Record<string, unknown>): void; warn(message: string, meta?: Record<string, unknown>): void; error(message: string, meta?: Record<string, unknown>): void };
}

export class SkillRegistrySync {
  private readonly provider: JsonRpcProvider;
  private readonly contract: Contract;
  private readonly onSkillUpsert?: SkillRegistrySyncOptions["onSkillUpsert"];
  private readonly onSkillRemoved?: SkillRegistrySyncOptions["onSkillRemoved"];
  private readonly logger?: SkillRegistrySyncOptions["logger"];

  constructor(options: SkillRegistrySyncOptions) {
    this.provider = new JsonRpcProvider(options.config.rpcUrl, options.config.chainId);
    this.contract = new Contract(options.config.registryAddress, skillRegistryAbi, this.provider);
    this.onSkillUpsert = options.onSkillUpsert;
    this.onSkillRemoved = options.onSkillRemoved;
    this.logger = options.logger;
  }

  async syncBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    for (const event of await this.collectEvents(fromBlock, toBlock)) {
      await this.handleEvent(event);
    }
  }

  async backfillRecent(limitBlocks = 50_000): Promise<void> {
    const latest = await this.provider.getBlockNumber();
    await this.syncBlockRange(Math.max(0, latest - limitBlocks), latest);
  }

  private async collectEvents(fromBlock: number, toBlock: number) {
    const filterNames = [
      "SkillRegistered",
      "SkillVersionAdded",
      "SkillActivated",
      "SkillPaused",
      "SkillDeprecated",
      "SkillRevoked",
      "SkillApproved",
      "SkillOwnershipTransferred",
      "SkillUsageReported",
      "SkillPinned",
      "CuratorGranted",
      "CuratorRevoked",
      "OperatorApproved",
      "OperatorRevoked",
    ] as const;

    const logs: Array<{ eventName: string; args: any; transactionHash: string; blockNumber: number }> = [];
    for (const name of filterNames) {
      const filter = (this.contract.filters as any)[name]();
      const entries = await this.contract.queryFilter(filter, fromBlock, toBlock);
      for (const entry of entries) {
        logs.push({
          eventName: String(entry.fragment?.name ?? name),
          args: entry.args,
          transactionHash: entry.transactionHash,
          blockNumber: entry.blockNumber,
        });
      }
    }
    logs.sort((a, b) => a.blockNumber - b.blockNumber);
    return logs;
  }

  private async handleEvent(event: { eventName: string; args: any; transactionHash: string; blockNumber: number }) {
    switch (event.eventName) {
      case "SkillRegistered":
      case "SkillVersionAdded":
      case "SkillActivated":
      case "SkillApproved":
      case "SkillPinned":
      case "SkillOwnershipTransferred":
      case "SkillPaused":
      case "SkillDeprecated":
      case "SkillUsageReported":
      case "CuratorGranted":
      case "CuratorRevoked":
      case "OperatorApproved":
      case "OperatorRevoked":
        await this.refreshSkill(event.args.skillId as Bytes32, event.transactionHash, event.blockNumber);
        break;
      case "SkillRevoked":
        await this.onSkillRemoved?.(event.args.skillId as Bytes32);
        break;
      default:
        this.logger?.warn("Unhandled registry event", { eventName: event.eventName });
    }
  }

  async refreshSkill(skillId: Bytes32, txHash?: string, blockNumber?: number): Promise<void> {
    const [record, skillById, usage] = await Promise.all([this.contract.getSkill(skillId), this.contract.getSkillById(skillId), this.contract.getUsage(skillId)]);
    const active = skillById[1];

    const normalizedRecord: SkillRecordData = {
      skillId: record.skillId as Bytes32,
      owner: record.owner as Address,
      namespace: String(record.namespace),
      name: String(record.name),
      description: String(record.description),
      status: ["Draft", "Active", "Paused", "Deprecated", "Revoked"][Number(record.status)] as SkillRecordData["status"],
      activeVersion: BigInt(record.activeVersion),
      latestVersion: BigInt(record.latestVersion),
      createdAt: BigInt(record.createdAt),
      updatedAt: BigInt(record.updatedAt),
      totalUsage: BigInt(record.totalUsage),
      totalSuccesses: BigInt(record.totalSuccesses),
      totalFailures: BigInt(record.totalFailures),
      averageLatencyMs: BigInt(record.averageLatencyMs),
      feeBps: BigInt(record.feeBps),
      allowPublicUse: Boolean(record.allowPublicUse),
      approved: Boolean(record.approved),
      pinnedTo0G: Boolean(record.pinnedTo0G),
      pinnedStorageUri: String(record.pinnedStorageUri),
      pinnedComputeUri: String(record.pinnedComputeUri),
      explorerUri: String(record.explorerUri),
      implementationAddress: record.implementationAddress as Address,
      lastUpdatedBy: record.lastUpdatedBy as Address,
      metadataHash: record.metadataHash as Bytes32,
    };

    const normalizedVersion: SkillVersionData = {
      version: BigInt(active.version),
      implementationUri: String(active.implementationUri),
      metadataUri: String(active.metadataUri),
      storageUri: String(active.storageUri),
      computeModel: String(active.computeModel),
      entrypoint: String(active.entrypoint),
      inputSchemaHash: active.inputSchemaHash as Bytes32,
      outputSchemaHash: active.outputSchemaHash as Bytes32,
      codeHash: active.codeHash as Bytes32,
      requiresWallet: Boolean(active.requiresWallet),
      requiresApproval: Boolean(active.requiresApproval),
      publicUse: Boolean(active.publicUse),
      enabled: Boolean(active.enabled),
      createdAt: BigInt(active.createdAt),
      updatedAt: BigInt(active.updatedAt),
      tags: Array.from(active.tags ?? []).map(String),
      capabilityHints: Array.from(active.capabilityHints ?? []).map(String),
    };

    const normalizedUsage: UsageReportData = {
      successCount: BigInt(usage.successCount),
      failureCount: BigInt(usage.failureCount),
      totalLatencyMs: BigInt(usage.totalLatencyMs),
      lastUsedAt: BigInt(usage.lastUsedAt),
      lastRunHash: usage.lastRunHash as Bytes32,
    };

    await this.onSkillUpsert?.({ skillId, record: normalizedRecord, activeVersion: normalizedVersion, usage: normalizedUsage, txHash, blockNumber });
  }
}

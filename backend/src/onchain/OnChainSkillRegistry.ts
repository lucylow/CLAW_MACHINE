/**
 * OnChainSkillRegistry
 *
 * TypeScript integration for the SkillRegistry.sol contract on 0G Network.
 *
 * Features:
 *   - publishSkill()      — publish a skill to the on-chain registry
 *   - loadSkillsFromChain() — sync on-chain skills into the runtime SkillRunner
 *   - endorseSkill()      — endorse a skill from the connected wallet
 *   - listChainSkills()   — paginated list of all on-chain skills
 *   - watchNewSkills()    — subscribe to SkillPublished events in real-time
 *
 * Uses ethers.js v6 with the 0G Newton Testnet (chainId 16600).
 * Falls back to mock mode when PRIVATE_KEY is not set.
 */

import { EventEmitter } from "events";

// ── ABI (minimal — only what we need) ────────────────────────────────────────

const SKILL_REGISTRY_ABI = [
  // Write
  "function publishSkill(string id, string name, string description, string contentHash, string[] tags, bool requiresWallet, bool touchesChain, bool usesCompute, bool usesStorage) returns (bytes32)",
  "function updateSkill(bytes32 skillKey, string newContentHash, string newDescription)",
  "function deprecateSkill(bytes32 skillKey)",
  "function endorseSkill(bytes32 skillKey)",
  // Read
  "function getSkill(bytes32 skillKey) view returns (tuple(string id, string name, string description, string contentHash, string[] tags, address author, uint256 version, uint256 publishedAt, uint256 updatedAt, bool deprecated, uint256 endorsements, bool requiresWallet, bool touchesChain, bool usesCompute, bool usesStorage))",
  "function getSkillByStringId(string id) view returns (tuple(string id, string name, string description, string contentHash, string[] tags, address author, uint256 version, uint256 publishedAt, uint256 updatedAt, bool deprecated, uint256 endorsements, bool requiresWallet, bool touchesChain, bool usesCompute, bool usesStorage))",
  "function getSkillKey(string id) view returns (bytes32)",
  "function totalSkills() view returns (uint256)",
  "function listSkills(uint256 offset, uint256 limit) view returns (bytes32[], uint256)",
  "function getAuthorSkills(address author) view returns (bytes32[])",
  // Events
  "event SkillPublished(bytes32 indexed skillId, address indexed author, string id, string name, string contentHash, uint256 version)",
  "event SkillUpdated(bytes32 indexed skillId, address indexed author, string contentHash, uint256 version)",
  "event SkillDeprecated(bytes32 indexed skillId, address indexed author)",
  "event SkillEndorsed(bytes32 indexed skillId, address indexed endorser)",
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ChainSkill {
  key: string;
  id: string;
  name: string;
  description: string;
  contentHash: string;
  tags: string[];
  author: string;
  version: number;
  publishedAt: number;
  updatedAt: number;
  deprecated: boolean;
  endorsements: number;
  requiresWallet: boolean;
  touchesChain: boolean;
  usesCompute: boolean;
  usesStorage: boolean;
}

export interface PublishSkillParams {
  id: string;
  name: string;
  description: string;
  contentHash: string;
  tags: string[];
  requiresWallet?: boolean;
  touchesChain?: boolean;
  usesCompute?: boolean;
  usesStorage?: boolean;
}

export interface OnChainRegistryConfig {
  rpcUrl: string;
  contractAddress: string;
  privateKey?: string;
}

// ── Registry ──────────────────────────────────────────────────────────────────

export class OnChainSkillRegistry extends EventEmitter {
  private readonly config: OnChainRegistryConfig;
  private readonly isMock: boolean;
  private readonly mockSkills: Map<string, ChainSkill> = new Map();
  private provider: unknown = null;
  private signer: unknown = null;
  private contract: unknown = null;

  constructor(config: OnChainRegistryConfig) {
    super();
    this.config = config;
    this.isMock = !config.privateKey || config.privateKey.length < 10;
  }

  async connect(): Promise<void> {
    if (this.isMock) {
      console.log("[OnChainSkillRegistry] Running in mock mode (no PRIVATE_KEY)");
      return;
    }
    try {
      // Dynamic import of ethers to avoid hard dep in environments without it
      const { ethers } = await import("ethers");
      this.provider = new (ethers as any).JsonRpcProvider(this.config.rpcUrl);
      this.signer = new (ethers as any).Wallet(this.config.privateKey!, this.provider as any);
      this.contract = new (ethers as any).Contract(
        this.config.contractAddress,
        SKILL_REGISTRY_ABI,
        this.signer,
      );
      console.log(`[OnChainSkillRegistry] Connected to ${this.config.rpcUrl}`);
    } catch (err) {
      console.warn("[OnChainSkillRegistry] ethers not available, falling back to mock:", (err as Error).message);
    }
  }

  /**
   * Publish a skill to the on-chain registry.
   * Returns the transaction hash (or mock hash in mock mode).
   */
  async publishSkill(params: PublishSkillParams): Promise<{ txHash: string; skillKey: string }> {
    if (this.isMock || !this.contract) {
      const mockKey = `0x${Buffer.from(params.id).toString("hex").padEnd(64, "0")}`;
      const skill: ChainSkill = {
        key: mockKey,
        ...params,
        author: "0xmock",
        version: 1,
        publishedAt: Date.now(),
        updatedAt: Date.now(),
        deprecated: false,
        endorsements: 0,
        requiresWallet: params.requiresWallet ?? false,
        touchesChain: params.touchesChain ?? false,
        usesCompute: params.usesCompute ?? false,
        usesStorage: params.usesStorage ?? false,
      };
      this.mockSkills.set(mockKey, skill);
      this.emit("skillPublished", skill);
      return { txHash: `0xmock${Date.now().toString(16)}`, skillKey: mockKey };
    }

    const c = this.contract as any;
    const tx = await c.publishSkill(
      params.id,
      params.name,
      params.description,
      params.contentHash,
      params.tags,
      params.requiresWallet ?? false,
      params.touchesChain ?? false,
      params.usesCompute ?? false,
      params.usesStorage ?? false,
    );
    const receipt = await tx.wait();
    const log = receipt.logs[0];
    const skillKey = log?.topics?.[1] ?? "0x0";
    return { txHash: receipt.hash, skillKey };
  }

  /**
   * Load all non-deprecated skills from the chain and return them.
   */
  async listChainSkills(limit = 50): Promise<ChainSkill[]> {
    if (this.isMock || !this.contract) {
      return [...this.mockSkills.values()].filter((s) => !s.deprecated);
    }

    const c = this.contract as any;
    const [keys] = await c.listSkills(0, limit) as [string[], bigint];
    const skills: ChainSkill[] = [];

    for (const key of keys) {
      try {
        const raw = await c.getSkill(key);
        if (!raw.deprecated) {
          skills.push(this._parseChainSkill(key, raw));
        }
      } catch { /* skip */ }
    }
    return skills;
  }

  /**
   * Get a single skill by its string id.
   */
  async getSkillById(id: string): Promise<ChainSkill | null> {
    if (this.isMock || !this.contract) {
      return [...this.mockSkills.values()].find((s) => s.id === id) ?? null;
    }
    try {
      const c = this.contract as any;
      const raw = await c.getSkillByStringId(id);
      if (!raw.author || raw.author === "0x0000000000000000000000000000000000000000") return null;
      const key = await c.getSkillKey(id) as string;
      return this._parseChainSkill(key, raw);
    } catch {
      return null;
    }
  }

  /**
   * Endorse a skill by its key.
   */
  async endorseSkill(skillKey: string): Promise<string> {
    if (this.isMock || !this.contract) {
      const skill = this.mockSkills.get(skillKey);
      if (skill) { skill.endorsements++; this.mockSkills.set(skillKey, skill); }
      return `0xmock-endorse-${Date.now().toString(16)}`;
    }
    const c = this.contract as any;
    const tx = await c.endorseSkill(skillKey);
    const receipt = await tx.wait();
    return receipt.hash;
  }

  /**
   * Watch for new SkillPublished events in real-time.
   * Returns an unsubscribe function.
   */
  watchNewSkills(callback: (skill: ChainSkill) => void): () => void {
    if (this.isMock || !this.contract) {
      const handler = (skill: ChainSkill) => callback(skill);
      this.on("skillPublished", handler);
      return () => this.off("skillPublished", handler);
    }
    const c = this.contract as any;
    const handler = (
      skillKey: string,
      _author: string,
      id: string,
      name: string,
      contentHash: string,
      version: bigint,
    ) => {
      callback({
        key: skillKey,
        id,
        name,
        description: "",
        contentHash,
        tags: [],
        author: _author,
        version: Number(version),
        publishedAt: Date.now(),
        updatedAt: Date.now(),
        deprecated: false,
        endorsements: 0,
        requiresWallet: false,
        touchesChain: false,
        usesCompute: false,
        usesStorage: false,
      });
    };
    c.on("SkillPublished", handler);
    return () => c.off("SkillPublished", handler);
  }

  get mode(): "mock" | "production" {
    return this.isMock ? "mock" : "production";
  }

  private _parseChainSkill(key: string, raw: Record<string, unknown>): ChainSkill {
    return {
      key,
      id: raw.id as string,
      name: raw.name as string,
      description: raw.description as string,
      contentHash: raw.contentHash as string,
      tags: (raw.tags as string[]) ?? [],
      author: raw.author as string,
      version: Number(raw.version),
      publishedAt: Number(raw.publishedAt) * 1000,
      updatedAt: Number(raw.updatedAt) * 1000,
      deprecated: Boolean(raw.deprecated),
      endorsements: Number(raw.endorsements),
      requiresWallet: Boolean(raw.requiresWallet),
      touchesChain: Boolean(raw.touchesChain),
      usesCompute: Boolean(raw.usesCompute),
      usesStorage: Boolean(raw.usesStorage),
    };
  }
}

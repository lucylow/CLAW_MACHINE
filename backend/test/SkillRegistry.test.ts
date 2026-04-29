import { expect } from "chai";
import { ethers } from "hardhat";

describe("SkillRegistry", function () {
  async function deployFixture() {
    const [admin, owner, curator, operator, other] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("SkillRegistry");
    const registry = await Factory.deploy(admin.address);
    await registry.waitForDeployment();
    await registry.connect(admin).grantRole(await registry.CURATOR_ROLE(), curator.address);
    return { registry, admin, owner, curator, operator, other };
  }

  it("registers a skill and returns deterministic id", async function () {
    const { registry, owner } = await deployFixture();
    const skillId = await registry.skillKey(owner.address, "claw", "research");

    await registry.connect(owner).registerSkill({
      owner: owner.address,
      namespace: "claw",
      name: "research",
      description: "Research skill",
      implementationUri: "ipfs://implementation",
      metadataUri: "ipfs://metadata",
      storageUri: "0g://storage-pointer",
      computeModel: "qwen3.6-plus",
      entrypoint: "main",
      inputSchemaHash: ethers.keccak256(ethers.toUtf8Bytes("input-schema-v1")),
      outputSchemaHash: ethers.keccak256(ethers.toUtf8Bytes("output-schema-v1")),
      codeHash: ethers.keccak256(ethers.toUtf8Bytes("code-v1")),
      requiresWallet: false,
      requiresApproval: false,
      publicUse: true,
      feeBps: 0,
      pinnedStorageUri: "0g://pinned-storage",
      pinnedComputeUri: "0g://pinned-compute",
      explorerUri: "https://explorer.example/skill",
      implementationAddress: owner.address,
      metadataHash: ethers.keccak256(ethers.toUtf8Bytes("metadata-v1")),
      tags: ["research", "memory"],
      capabilityHints: ["search", "summarize"],
    });

    const record = await registry.getSkill(skillId);
    expect(record.owner).to.equal(owner.address);
    expect(record.namespace).to.equal("claw");
    expect(record.name).to.equal("research");
    expect(record.latestVersion).to.equal(1n);
    expect(record.status).to.equal(0n);
  });
});

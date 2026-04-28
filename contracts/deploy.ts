/**
 * Hardhat deploy script for SkillRegistry.sol on 0G Newton Testnet
 *
 * Usage:
 *   npx hardhat run contracts/deploy.ts --network zerog
 *
 * Prerequisites:
 *   npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox
 *   Set PRIVATE_KEY in .env
 *
 * After deployment, set CONTRACT_ADDRESS in .env
 */

import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying SkillRegistry with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await deployer.provider.getBalance(deployer.address)), "OG");

  const SkillRegistry = await ethers.getContractFactory("SkillRegistry");
  const registry = await SkillRegistry.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("\n✓ SkillRegistry deployed to:", address);
  console.log("\nAdd to .env:");
  console.log(`  CONTRACT_ADDRESS=${address}`);
  console.log("\nVerify on 0G Explorer:");
  console.log(`  https://chainscan-newton.0g.ai/address/${address}`);

  // Publish a demo skill to verify the contract works
  console.log("\nPublishing demo skill...");
  const tx = await registry.publishSkill(
    "demo.hello",
    "Hello World Skill",
    "A simple demo skill that greets the user",
    "0x0000000000000000000000000000000000000000000000000000000000000001",
    ["demo", "hello"],
    false, false, false, false
  );
  const receipt = await tx.wait();
  console.log("✓ Demo skill published. TxHash:", receipt!.hash);
  console.log("Total skills:", await registry.totalSkills());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

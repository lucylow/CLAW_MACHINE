import { readFileSync } from "node:fs";
import path from "node:path";
import { ethers } from "ethers";
import { skillRegistryAbi } from "../src/chain/skillRegistryAbi";

async function main() {
  const rpcUrl = process.env.RPC_URL;
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const adminAddress = process.env.ADMIN_ADDRESS;

  if (!rpcUrl || !privateKey || !adminAddress) {
    throw new Error("Missing RPC_URL, DEPLOYER_PRIVATE_KEY, or ADMIN_ADDRESS");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const artifactPath = path.join(process.cwd(), "contracts", "artifacts", "contracts", "SkillRegistry.sol", "SkillRegistry.json");
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8")) as { abi: unknown; bytecode: string };
  const factory = new ethers.ContractFactory(artifact.abi ?? skillRegistryAbi, artifact.bytecode, wallet);
  const contract = await factory.deploy(adminAddress);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(JSON.stringify({ ok: true, address, deployer: wallet.address, adminAddress }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

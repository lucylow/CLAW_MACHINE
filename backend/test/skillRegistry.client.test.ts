import { expect } from "chai";
import { SkillRegistryClient } from "../src/chain/skillRegistryClient";

describe("SkillRegistryClient", () => {
  it("initializes with config", async () => {
    const client = new SkillRegistryClient({
      chainId: 999,
      registryAddress: "0x0000000000000000000000000000000000000001",
      rpcUrl: "http://localhost:8545",
    });
    expect(client).to.exist;
  });
});

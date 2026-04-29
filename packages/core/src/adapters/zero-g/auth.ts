import { Wallet } from "ethers";

/**
 * Wallet-backed auth headers for 0G Storage / indexer HTTP gateways that expect a Bearer token.
 * Token is a base64url JSON blob `{ address, message, signature }` signed with EIP-191.
 */
export class ZeroGAuth {
  constructor(private readonly walletPrivateKey: string) {}

  async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.signRequest();
    return { Authorization: `Bearer ${token}` };
  }

  private async signRequest(): Promise<string> {
    const wallet = new Wallet(this.walletPrivateKey);
    const windowMs = 600_000;
    const slot = Math.floor(Date.now() / windowMs);
    const message = `CLAW_MACHINE_0G_AUTH:${wallet.address}:${slot}`;
    const signature = await wallet.signMessage(message);
    const payload = { address: wallet.address, message, signature };
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }
}

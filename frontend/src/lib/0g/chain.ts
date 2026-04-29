export type ZeroGWalletClient = {
  signMessage: (args: { message: string }) => Promise<string>;
};

export class ZeroGChain {
  async registerAgent(walletClient: ZeroGWalletClient, agentData: unknown) {
    const message = `Registering Agent: ${JSON.stringify(agentData)}`;
    const signature = await walletClient.signMessage({ message });
    return signature;
  }

  getExplorerLink(txHash: string) {
    const base =
      import.meta.env.VITE_OG_EXPLORER?.replace(/\/$/, "") ?? "https://chainscan-galileo.0g.ai";
    return `${base}/tx/${txHash}`;
  }
}

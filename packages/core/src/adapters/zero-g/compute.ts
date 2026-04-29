export interface ZeroGComputeAdapterConfig {
  /** Base URL for inference / embedding HTTP API (or broker-exposed endpoint). */
  provider: string;
  privateKey?: string;
  /** When true, request body includes `teeAttestation: true` for verifiable inference. */
  teeAttestation?: boolean;
}

/**
 * HTTP adapter for sealed inference and embeddings. Wire to your 0G compute gateway;
 * swap the implementation for `@0glabs/0g-serving-broker` (or future compute SDK) when you
 * need on-chain provider discovery and signed request headers.
 */
export class ZeroGComputeAdapter {
  constructor(private readonly config: ZeroGComputeAdapterConfig) {}

  private base(): string {
    return this.config.provider.replace(/\/$/, "");
  }

  async runSealedInference(prompt: string, model: string): Promise<string> {
    const res = await fetch(`${this.base()}/infer`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt,
        model,
        teeAttestation: this.config.teeAttestation ?? true,
      }),
    });
    if (!res.ok) {
      throw new Error(`0g sealed inference failed: ${res.status} ${await res.text()}`);
    }
    return res.text();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const res = await fetch(`${this.base()}/embed`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      throw new Error(`0g embed failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<number[]>;
  }
}

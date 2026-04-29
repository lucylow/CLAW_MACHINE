import type { InferenceModel, TEEAttestation } from "./types";

export class ZeroGCompute {
  async runInference(model: InferenceModel, prompt: string) {
    const base = import.meta.env.VITE_0G_COMPUTE;
    if (!base) throw new Error("VITE_0G_COMPUTE is not configured");
    const response = await fetch(`${base.replace(/\/$/, "")}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt, sealedInference: true }),
    });
    return response.json() as Promise<unknown>;
  }

  async generateReflection(context: string): Promise<{ reflection: string; tee: TEEAttestation }> {
    void context;
    return {
      reflection: "...",
      tee: {
        providerSignature: "0x...",
        model: "DeepSeek-V3.1",
        nonce: "...",
        verified: true,
      },
    };
  }

  async getEmbedding(text: string): Promise<number[]> {
    void text;
    return new Array(1536).fill(0.01);
  }
}

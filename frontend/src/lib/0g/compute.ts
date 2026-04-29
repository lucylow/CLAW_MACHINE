import type { InferenceModel, TEEAttestation } from "./types";

export interface InferenceOptions {
  maxRetries?: number;
  timeoutMs?: number;
  teeAttestation?: boolean;
}

export interface InferenceResult {
  text: string;
  model: InferenceModel;
  tee: TEEAttestation;
  durationMs: number;
  attempt: number;
}

async function sleep(ms: number) { return new Promise<void>(r => setTimeout(r, ms)); }

export class ZeroGCompute {
  async runInference(model: InferenceModel, prompt: string, opts: InferenceOptions = {}): Promise<InferenceResult> {
    const base = (import.meta as any).env?.VITE_0G_COMPUTE;
    const maxRetries = opts.maxRetries ?? 2;
    const timeoutMs = opts.timeoutMs ?? 15_000;
    const tee = opts.teeAttestation ?? true;

    if (!base) {
      return { text: `[mock] Response from ${model}: ${prompt.slice(0, 60)}…`, model,
        tee: { providerSignature: "0xmock", model, nonce: "mock", verified: false }, durationMs: 0, attempt: 0 };
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      const t0 = performance.now();
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const res = await fetch(`${base.replace(/\/$/, "")}/v1/chat`, {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model, prompt, sealedInference: tee }),
        });
        clearTimeout(timer);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
        const json = await res.json() as { text?: string; content?: string; tee?: Partial<TEEAttestation> };
        return { text: json.text ?? json.content ?? "", model,
          tee: { providerSignature: json.tee?.providerSignature ?? "0x", model, nonce: json.tee?.nonce ?? "", verified: json.tee?.verified ?? false },
          durationMs: Math.round(performance.now() - t0), attempt };
      } catch (err) {
        lastError = err;
        if (attempt <= maxRetries) await sleep(300 * attempt);
      }
    }
    throw lastError;
  }

  async generateReflection(context: string, model: InferenceModel = "DeepSeek-V3.1"): Promise<{ reflection: string; tee: TEEAttestation }> {
    const prompt = `You are a self-improvement engine for an AI agent.\nAnalyze the context and return a concise reflection on what went wrong and what the agent should do differently.\n\nContext:\n${context}`;
    try {
      const r = await this.runInference(model, prompt);
      return { reflection: r.text, tee: r.tee };
    } catch {
      return { reflection: "Reflection unavailable — compute endpoint unreachable.", tee: { providerSignature: "0x", model, nonce: "", verified: false } };
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const base = (import.meta as any).env?.VITE_0G_COMPUTE;
    const makeFake = () => {
      const vec = new Array(1536).fill(0);
      for (let i = 0; i < text.length; i++) vec[i % 1536] += (text.charCodeAt(i) % 10) / 10;
      const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0)) || 1;
      return vec.map(v => v / mag);
    };
    if (!base) return makeFake();
    try {
      const ctrl = new AbortController();
      setTimeout(() => ctrl.abort(), 10_000);
      const res = await fetch(`${base.replace(/\/$/, "")}/v1/embed`, {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`embed HTTP ${res.status}`);
      return res.json() as Promise<number[]>;
    } catch { return makeFake(); }
  }
}

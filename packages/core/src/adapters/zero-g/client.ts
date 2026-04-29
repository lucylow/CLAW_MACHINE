export interface ZeroGClientConfig {
  storageEndpoint: string;
  computeEndpoint: string;
  apiKey?: string;
  /** Optional wallet-backed or custom Bearer token (merged after apiKey). */
  auth?: { getAuthHeaders(): Promise<Record<string, string>> };
}

export class ZeroGClient {
  constructor(private readonly config: ZeroGClientConfig) {}

  private async mergeAuth(headers: Record<string, string>): Promise<Record<string, string>> {
    const extra = this.config.auth ? await this.config.auth.getAuthHeaders() : {};
    return { ...headers, ...extra };
  }

  async putKV(key: string, value: unknown, streamId: string) {
    const res = await fetch(`${this.config.storageEndpoint}/kv/put`, {
      method: "POST",
      headers: await this.mergeAuth({
        "content-type": "application/json",
        ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
      }),
      body: JSON.stringify({ key, value, streamId }),
    });
    if (!res.ok) throw new Error("putKV failed");
    return res.json() as Promise<{ id: string; version?: string }>;
  }

  async getKV<T>(key: string, streamId: string): Promise<T | null> {
    const res = await fetch(
      `${this.config.storageEndpoint}/kv/get?${new URLSearchParams({ key, streamId })}`,
      {
        method: "GET",
        headers: await this.mergeAuth({
          ...(this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {}),
        }),
      },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("getKV failed");
    return res.json() as Promise<T>;
  }

  async appendLog(streamId: string, payload: unknown) {
    const res = await fetch(`${this.config.storageEndpoint}/log/append`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ streamId, payload }),
    });
    if (!res.ok) throw new Error("appendLog failed");
    return res.json() as Promise<{ id: string; version?: string }>;
  }

  async searchByEmbedding(streamId: string, vector: number[], topK: number) {
    const res = await fetch(`${this.config.storageEndpoint}/search/embedding`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ streamId, vector, topK }),
    });
    if (!res.ok) throw new Error("searchByEmbedding failed");
    return res.json() as Promise<Array<{ id: string; score: number }>>;
  }

  async getById<T>(id: string): Promise<T | null> {
    const res = await fetch(`${this.config.storageEndpoint}/object/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: await this.mergeAuth({}),
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("getById failed");
    return res.json() as Promise<T>;
  }

  async chat(prompt: string) {
    const res = await fetch(`${this.config.computeEndpoint}/chat`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ prompt }),
    });
    if (!res.ok) throw new Error("compute chat failed");
    return res.text();
  }

  async embed(text: string) {
    const res = await fetch(`${this.config.computeEndpoint}/embed`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error("compute embed failed");
    return res.json() as Promise<number[]>;
  }
}

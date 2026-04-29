export interface ZeroGClientConfig {
  storageEndpoint: string;
  computeEndpoint: string;
  apiKey?: string;
  auth?: { getAuthHeaders(): Promise<Record<string, string>> };
  /** Timeout in ms for all requests. Default 10000. */
  timeoutMs?: number;
}

export class ZeroGClient {
  constructor(private readonly config: ZeroGClientConfig) {}

  private get timeout(): number { return this.config.timeoutMs ?? 10_000; }

  private async mergeAuth(headers: Record<string, string>): Promise<Record<string, string>> {
    const extra = this.config.auth ? await this.config.auth.getAuthHeaders() : {};
    const auth = this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {};
    return { ...headers, ...auth, ...extra };
  }

  private async fetchT(url: string, init: RequestInit): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeout);
    try {
      return await fetch(url, { ...init, signal: ctrl.signal });
    } finally { clearTimeout(timer); }
  }

  // KV
  async putKV(key: string, value: unknown, streamId: string) {
    const res = await this.fetchT(`${this.config.storageEndpoint}/kv/put`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ key, value, streamId }),
    });
    if (!res.ok) throw new Error(`putKV failed: ${res.status}`);
    return res.json() as Promise<{ id: string; version?: string }>;
  }

  async getKV<T>(key: string, streamId: string): Promise<T | null> {
    const res = await this.fetchT(
      `${this.config.storageEndpoint}/kv/get?${new URLSearchParams({ key, streamId })}`,
      { method: "GET", headers: await this.mergeAuth({}) },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getKV failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  async deleteKV(key: string, streamId: string): Promise<{ ok: boolean }> {
    const res = await this.fetchT(`${this.config.storageEndpoint}/kv/delete`, {
      method: "DELETE",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ key, streamId }),
    });
    if (res.status === 404) return { ok: false };
    if (!res.ok) throw new Error(`deleteKV failed: ${res.status}`);
    return res.json() as Promise<{ ok: boolean }>;
  }

  async listKeys(streamId: string, prefix?: string): Promise<string[]> {
    const params = new URLSearchParams({ streamId });
    if (prefix) params.set("prefix", prefix);
    const res = await this.fetchT(
      `${this.config.storageEndpoint}/kv/list?${params}`,
      { method: "GET", headers: await this.mergeAuth({}) },
    );
    if (!res.ok) throw new Error(`listKeys failed: ${res.status}`);
    const json = await res.json() as { keys?: string[] };
    return json.keys ?? [];
  }

  // Log
  async appendLog(streamId: string, payload: unknown) {
    const res = await this.fetchT(`${this.config.storageEndpoint}/log/append`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ streamId, payload }),
    });
    if (!res.ok) throw new Error(`appendLog failed: ${res.status}`);
    return res.json() as Promise<{ id: string; version?: string }>;
  }

  async getLogRange<T>(streamId: string, fromIndex: number, toIndex?: number): Promise<Array<{ index: number; payload: T; appendedAt: string }>> {
    const params = new URLSearchParams({ streamId, from: String(fromIndex) });
    if (toIndex !== undefined) params.set("to", String(toIndex));
    const res = await this.fetchT(
      `${this.config.storageEndpoint}/log/range?${params}`,
      { method: "GET", headers: await this.mergeAuth({}) },
    );
    if (!res.ok) throw new Error(`getLogRange failed: ${res.status}`);
    return res.json() as Promise<Array<{ index: number; payload: T; appendedAt: string }>>;
  }

  // Vector search
  async searchByEmbedding(streamId: string, vector: number[], topK: number) {
    const res = await this.fetchT(`${this.config.storageEndpoint}/search/embedding`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ streamId, vector, topK }),
    });
    if (!res.ok) throw new Error(`searchByEmbedding failed: ${res.status}`);
    return res.json() as Promise<Array<{ id: string; score: number }>>;
  }

  async getById<T>(id: string): Promise<T | null> {
    const res = await this.fetchT(
      `${this.config.storageEndpoint}/object/${encodeURIComponent(id)}`,
      { method: "GET", headers: await this.mergeAuth({}) },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`getById failed: ${res.status}`);
    return res.json() as Promise<T>;
  }

  // Compute
  async chat(prompt: string, model = "DeepSeek-V3.1") {
    const res = await this.fetchT(`${this.config.computeEndpoint}/v1/chat`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ prompt, model, sealedInference: true }),
    });
    if (!res.ok) throw new Error(`chat failed: ${res.status}`);
    const json = await res.json() as { text?: string; content?: string };
    return json.text ?? json.content ?? "";
  }

  async embed(text: string): Promise<number[]> {
    const res = await this.fetchT(`${this.config.computeEndpoint}/v1/embed`, {
      method: "POST",
      headers: await this.mergeAuth({ "content-type": "application/json" }),
      body: JSON.stringify({ text }),
    });
    if (!res.ok) throw new Error(`embed failed: ${res.status}`);
    return res.json() as Promise<number[]>;
  }
}

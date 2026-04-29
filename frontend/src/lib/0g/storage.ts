const jsonHeaders = { "Content-Type": "application/json" } as const;

function bufferToHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class ZeroGStorage {
  async putKV(wallet: string, key: string, value: unknown) {
    const base = import.meta.env.VITE_0G_KV;
    if (!base) throw new Error("VITE_0G_KV is not configured");
    return fetch(`${base.replace(/\/$/, "")}/put`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ wallet, key, value }),
    });
  }

  async appendLog(agentId: string, event: unknown) {
    const base = import.meta.env.VITE_0G_LOG;
    if (!base) throw new Error("VITE_0G_LOG is not configured");
    return fetch(`${base.replace(/\/$/, "")}/append`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ agentId, event, timestamp: Date.now() }),
    });
  }

  async storeBlob(data: unknown): Promise<{ blobId: string; hashHex: string }> {
    const serialized = JSON.stringify(data);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized));
    const hashHex = bufferToHex(hash);
    const base = import.meta.env.VITE_0G_BLOB;
    if (base) {
      await fetch(`${base.replace(/\/$/, "")}/blob`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ data: serialized, hashHex }),
      }).catch(() => {});
    }
    return { blobId: "blob_xyz", hashHex };
  }
}

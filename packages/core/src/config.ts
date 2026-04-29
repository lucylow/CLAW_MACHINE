export interface AppConfig {
  storageEndpoint: string;
  computeEndpoint: string;
  apiKey?: string;
  maxReflectionsPerStream: number;
  topKRecall: number;
  /** Raw env aliases from deployment guides (optional). */
  ogStorageRpc?: string;
  ogComputeProvider?: string;
  /** When false, adapters may skip TEE attestation flags (default true). */
  teeRequired: boolean;
}

export function loadConfig(): AppConfig {
  const storageEndpoint =
    process.env.ZEROG_STORAGE_ENDPOINT ??
    process.env.ogStorageRpc ??
    "http://localhost:8080";
  const computeEndpoint =
    process.env.ZEROG_COMPUTE_ENDPOINT ??
    process.env.ZEROG_COMPUTE_PROVIDER ??
    process.env.ogComputeProvider ??
    "http://localhost:8090";

  return {
    storageEndpoint,
    computeEndpoint,
    apiKey: process.env.ZEROG_API_KEY,
    maxReflectionsPerStream: Number(process.env.MAX_REFLECTIONS_PER_STREAM ?? 100),
    topKRecall: Number(process.env.TOPK_RECALL ?? 5),
    ogStorageRpc: process.env.ZEROG_STORAGE_ENDPOINT ?? process.env.ogStorageRpc,
    ogComputeProvider: process.env.ZEROG_COMPUTE_PROVIDER ?? process.env.ogComputeProvider,
    teeRequired: process.env.TEE_REQUIRED !== "false",
  };
}

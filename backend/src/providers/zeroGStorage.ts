import type { ZeroGStorageAdapter } from "../adapters/ZeroGStorageAdapter";
import type { MultimodalAsset } from "../multimodal/types";
import { createId, sha256 } from "../multimodal/utils";

export interface PersistedMultimodalBlob {
  rootHash: string;
  uri: string;
  sizeBytes: number;
}

/**
 * Upload raw multimodal bytes to 0G Storage (or adapter fallback) and return a stable URI for sealed compute.
 */
export async function persistMultimodalBlob(
  adapter: ZeroGStorageAdapter,
  input: { buffer: Buffer; filename: string; mimeType: string },
): Promise<PersistedMultimodalBlob> {
  const rootHash = await adapter.uploadBlob(input.buffer);
  return {
    rootHash,
    uri: `0g://${rootHash}`,
    sizeBytes: input.buffer.length,
  };
}

/**
 * Build a {@link MultimodalAsset} from an upload result (no inline base64).
 */
export function multimodalAssetFromZeroGBlob(
  kind: "image" | "audio",
  input: {
    filename: string;
    mimeType: string;
    buffer: Buffer;
    persisted: PersistedMultimodalBlob;
    metadata?: Record<string, unknown>;
  },
): MultimodalAsset {
  return {
    id: createId(`asset_${kind}`),
    kind,
    mimeType: input.mimeType,
    filename: input.filename,
    sizeBytes: input.persisted.sizeBytes,
    sha256: sha256(input.buffer),
    uri: input.persisted.uri,
    metadata: { ...input.metadata, rootHash: input.persisted.rootHash },
  };
}

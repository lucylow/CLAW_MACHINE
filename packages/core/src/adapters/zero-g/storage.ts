import { ZeroGClient, type ZeroGClientConfig } from "./client.js";

/**
 * KV + append-only log facade for durable memory and audit trails.
 * Uses the same REST contract as {@link ZeroGClient}; replace internals with
 * `@0glabs/0g-ts-sdk` (indexer / flow) when you move off HTTP gateways.
 */
export class ZeroGStorageAdapter extends ZeroGClient {
  constructor(config: ZeroGClientConfig) {
    super(config);
  }
}

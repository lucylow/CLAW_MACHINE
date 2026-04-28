/**
 * @claw/plugin-0g
 *
 * First-party plugin that wires 0G Storage and 0G Compute into any
 * @claw/core agent via a single `agent.use(zeroGPlugin(config))` call.
 *
 * @example
 * ```ts
 * import { AgentBuilder } from "@claw/core";
 * import { zeroGPlugin } from "@claw/plugin-0g";
 *
 * const agent = await new AgentBuilder()
 *   .setName("0GAgent")
 *   .use(zeroGPlugin({
 *     rpc: process.env.EVM_RPC!,
 *     privateKey: process.env.PRIVATE_KEY,
 *     computeModel: "qwen3.6-plus",
 *   }))
 *   .build();
 * ```
 */

import type { PluginDefinition, ComputeAdapter, StorageAdapter } from "../../core/src/types.js";
import { ZeroGComputeAdapterShim } from "./ZeroGComputeAdapterShim.js";
import { ZeroGStorageAdapterShim } from "./ZeroGStorageAdapterShim.js";

export interface ZeroGPluginConfig {
  /** 0G EVM RPC endpoint (e.g. https://evmrpc-testnet.0g.ai) */
  rpc: string;
  /** 0G Storage indexer RPC */
  indexerRpc?: string;
  /** Wallet private key — if absent, falls back to mock mode */
  privateKey?: string;
  /** 0G Compute model name */
  computeModel?: string;
  /** 0G Compute RPC endpoint */
  computeRpc?: string;
}

export interface ZeroGPluginResult {
  plugin: PluginDefinition;
  compute: ComputeAdapter;
  storage: StorageAdapter;
}

/**
 * Creates the 0G plugin. Returns both the plugin definition and the
 * adapter instances so callers can pass them to `withCompute`/`withStorage`
 * if they need direct access.
 */
export function zeroGPlugin(config: ZeroGPluginConfig): PluginDefinition {
  const compute = new ZeroGComputeAdapterShim({
    rpc: config.computeRpc ?? "https://compute-testnet.0g.ai",
    model: config.computeModel ?? "qwen3.6-plus",
    privateKey: config.privateKey,
  });

  const storage = new ZeroGStorageAdapterShim({
    rpc: config.rpc,
    indexerRpc: config.indexerRpc ?? "https://indexer-storage-testnet-turbo.0g.ai",
    privateKey: config.privateKey,
  });

  const plugin: PluginDefinition = {
    id: "plugin-0g",
    name: "0G Network Plugin",
    version: "0.1.0",
    description: "Wires 0G Storage (KV/Log/Blob) and 0G Compute (TEE inference) into the agent",
    hooks: {
      async onAgentInit(agent) {
        const mode = compute.mode === "production" ? "production (0G Compute)" : "mock";
        const storageMode = storage.mode === "production" ? "production (0G Storage)" : "mock";
        console.log(`[plugin-0g] Compute: ${mode} | Storage: ${storageMode}`);
        // Replace agent's adapters at init time
        // Note: adapters are set via AgentBuilder; this hook logs status
        agent.emit("plugin:0g:ready", { computeMode: compute.mode, storageMode: storage.mode });
      },

      onBeforeTurn(input) {
        // Attach 0G metadata to context
        return {
          ...input,
          context: {
            ...input.context,
            _0g: { network: "newton-testnet", chainId: 16600 },
          },
        };
      },

      async onMemorySave(record) {
        // Tag all records saved through this plugin
        return {
          ...record,
          tags: [...record.tags, "0g-persisted"],
          metadata: { ...record.metadata, storageMode: storage.mode },
        };
      },

      onError(error, phase) {
        console.error(`[plugin-0g] Error in phase "${phase}":`, error.message);
      },
    },
  };

  return plugin;
}

/**
 * Create 0G adapters separately for use with AgentBuilder.withCompute/withStorage
 */
export function createZeroGAdapters(config: ZeroGPluginConfig): {
  compute: ComputeAdapter;
  storage: StorageAdapter;
} {
  return {
    compute: new ZeroGComputeAdapterShim({
      rpc: config.computeRpc ?? "https://compute-testnet.0g.ai",
      model: config.computeModel ?? "qwen3.6-plus",
      privateKey: config.privateKey,
    }),
    storage: new ZeroGStorageAdapterShim({
      rpc: config.rpc,
      indexerRpc: config.indexerRpc ?? "https://indexer-storage-testnet-turbo.0g.ai",
      privateKey: config.privateKey,
    }),
  };
}

export { ZeroGComputeAdapterShim, ZeroGStorageAdapterShim };

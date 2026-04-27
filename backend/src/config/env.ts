import { ConfigurationError } from "../errors/AppError";

export interface AppConfig {
  appVersion: string;
  port: number;
  corsOrigin: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  nodeEnv: "development" | "test" | "production";
  mode: "demo" | "live";
  computeMode: "mock" | "production";
  storageMode: "memory" | "production";
}

function parseNumber(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) {
    throw new ConfigurationError(`Invalid numeric environment value for ${name}`, { expected: "number", received: value });
  }
  return parsed;
}

export function readConfig(): AppConfig {
  const nodeEnvRaw = process.env.NODE_ENV || "development";
  const nodeEnv = (["development", "test", "production"].includes(nodeEnvRaw) ? nodeEnvRaw : "development") as AppConfig["nodeEnv"];
  const mode = process.env.APP_MODE === "live" ? "live" : "demo";
  const port = parseNumber(process.env.PORT, 3001, "PORT");
  const chainId = parseNumber(process.env.OG_CHAIN_ID, 16600, "OG_CHAIN_ID");
  const rpcUrl = process.env.OG_RPC_URL || "https://evmrpc-testnet.0g.ai";
  if (!rpcUrl.startsWith("http")) {
    throw new ConfigurationError("OG_RPC_URL must be a valid http(s) URL", { value: rpcUrl, example: "https://evmrpc-testnet.0g.ai" });
  }

  return {
    appVersion: process.env.APP_VERSION || "2.1.0",
    nodeEnv,
    mode,
    port,
    corsOrigin: process.env.CORS_ORIGIN || "http://localhost:3000",
    chainId,
    rpcUrl,
    explorerUrl: process.env.VITE_OG_EXPLORER || "https://chainscan-newton.0g.ai",
    computeMode: process.env.OG_COMPUTE_MODE === "production" ? "production" : "mock",
    storageMode: process.env.OG_STORAGE_MODE === "production" ? "production" : "memory",
  };
}

import { readFileSync } from "node:fs";
import path from "node:path";
import type { FrameworkConfig, FrameworkEnv, ParsedEnv, ValidationIssue } from "./types";
import { isLikelyUrl, normalizeLogLevel, normalizeUrl, parseCsv, stableFlagObject, toBool, toNumber } from "./util";

function ensureDirSyncPath(target: string): string {
  return path.resolve(target);
}

export class ConfigValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(`Configuration validation failed with ${issues.length} issue(s)`);
    this.name = "ConfigValidationError";
  }
}

export class ConfigLoader {
  static loadEnvFile(filePath: string): ParsedEnv {
    try {
      const content = readFileSync(filePath, "utf8");
      const env: ParsedEnv = {};
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const idx = line.indexOf("=");
        if (idx < 0) continue;
        const key = line.slice(0, idx).trim();
        const value = line
          .slice(idx + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        env[key] = value;
      }
      return env;
    } catch {
      return {};
    }
  }

  static mergeEnvs(...envs: ParsedEnv[]): ParsedEnv {
    return Object.assign({}, ...envs);
  }

  static parse(raw: ParsedEnv): FrameworkConfig {
    const env = (raw.NODE_ENV as FrameworkEnv) || "development";
    const appName = raw.APP_NAME || "CLAW MACHINE";
    const version = raw.APP_VERSION || "0.0.0";
    const port = toNumber(raw.PORT, 3000);
    const host = raw.HOST || "0.0.0.0";
    const baseUrl = normalizeUrl(raw.BASE_URL) || `http://${host}:${port}`;
    const logLevel = normalizeLogLevel(raw.LOG_LEVEL, env === "production" ? "info" : "debug");
    const dataDir = ensureDirSyncPath(raw.DATA_DIR || path.join(process.cwd(), "data"));

    const config: FrameworkConfig = {
      appName,
      env,
      version,
      port,
      host,
      baseUrl,
      logLevel,
      dataDir,
      enableMetrics: toBool(raw.ENABLE_METRICS, true),
      enableTracing: toBool(raw.ENABLE_TRACING, false),
      enableHealthChecks: toBool(raw.ENABLE_HEALTH_CHECKS, true),
      enableFeatureFlags: toBool(raw.ENABLE_FEATURE_FLAGS, true),
      requestTimeoutMs: toNumber(raw.REQUEST_TIMEOUT_MS, 30_000),
      defaultRetryAttempts: toNumber(raw.DEFAULT_RETRY_ATTEMPTS, 3),
      defaultRetryBackoffMs: toNumber(raw.DEFAULT_RETRY_BACKOFF_MS, 500),
      defaultCircuitBreakerThreshold: toNumber(raw.DEFAULT_CIRCUIT_BREAKER_THRESHOLD, 5),
      defaultCircuitBreakerResetMs: toNumber(raw.DEFAULT_CIRCUIT_BREAKER_RESET_MS, 30_000),
      maxConcurrentRequests: toNumber(raw.MAX_CONCURRENT_REQUESTS, 50),
      maxPayloadBytes: toNumber(raw.MAX_PAYLOAD_BYTES, 10 * 1024 * 1024),
      zeroG: {
        chainId: raw.ZERO_G_CHAIN_ID ? toNumber(raw.ZERO_G_CHAIN_ID, 0) : undefined,
        rpcUrl: normalizeUrl(raw.ZERO_G_RPC_URL),
        storageNamespace: raw.ZERO_G_STORAGE_NAMESPACE,
        computeEndpoint: normalizeUrl(raw.ZERO_G_COMPUTE_ENDPOINT),
        daEndpoint: normalizeUrl(raw.ZERO_G_DA_ENDPOINT),
      },
      integrations: {
        a2aQueueBackend: (raw.A2A_QUEUE_BACKEND as FrameworkConfig["integrations"]["a2aQueueBackend"]) || "file",
        skillRegistryAddress: raw.SKILL_REGISTRY_ADDRESS,
        skillRegistryRpcUrl: normalizeUrl(raw.SKILL_REGISTRY_RPC_URL),
      },
      paths: {
        logs: ensureDirSyncPath(raw.LOG_DIR || path.join(dataDir, "logs")),
        data: ensureDirSyncPath(raw.DATA_DIR || dataDir),
        cache: ensureDirSyncPath(raw.CACHE_DIR || path.join(dataDir, "cache")),
        snapshots: ensureDirSyncPath(raw.SNAPSHOT_DIR || path.join(dataDir, "snapshots")),
        manifests: ensureDirSyncPath(raw.MANIFEST_DIR || path.join(dataDir, "manifests")),
      },
      security: {
        enableCsrf: toBool(raw.ENABLE_CSRF, env === "production"),
        allowedOrigins: parseCsv(raw.ALLOWED_ORIGINS),
        adminApiKeys: parseCsv(raw.ADMIN_API_KEYS),
        sessionSecret: raw.SESSION_SECRET,
      },
      featureFlags: {},
    };

    if (raw.FEATURE_FLAGS_JSON) {
      try {
        config.featureFlags = stableFlagObject(JSON.parse(raw.FEATURE_FLAGS_JSON) as Record<string, boolean>);
      } catch {
        config.featureFlags = {};
      }
    }

    if (raw.FEATURE_FLAGS) {
      for (const item of parseCsv(raw.FEATURE_FLAGS)) {
        const [key, value] = item.split(":").map((part) => part.trim());
        if (!key) continue;
        config.featureFlags[key] = ["1", "true", "yes", "on"].includes((value ?? "true").toLowerCase());
      }
      config.featureFlags = stableFlagObject(config.featureFlags);
    }

    return config;
  }

  static validate(config: FrameworkConfig): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!config.appName) {
      issues.push({ field: "appName", code: "required", message: "appName is required" });
    }
    if (!config.version) {
      issues.push({ field: "version", code: "required", message: "version is required" });
    }
    if (!Number.isInteger(config.port) || config.port <= 0 || config.port > 65535) {
      issues.push({ field: "port", code: "invalid_port", message: "port must be between 1 and 65535", actual: config.port });
    }
    if (!config.baseUrl || !isLikelyUrl(config.baseUrl)) {
      issues.push({ field: "baseUrl", code: "invalid_url", message: "baseUrl must be a valid URL", actual: config.baseUrl });
    }
    if (config.requestTimeoutMs < 1000) {
      issues.push({ field: "requestTimeoutMs", code: "too_small", message: "requestTimeoutMs must be at least 1000" });
    }
    if (config.maxConcurrentRequests < 1) {
      issues.push({ field: "maxConcurrentRequests", code: "too_small", message: "maxConcurrentRequests must be at least 1" });
    }
    if (config.maxPayloadBytes < 1024) {
      issues.push({ field: "maxPayloadBytes", code: "too_small", message: "maxPayloadBytes must be at least 1024" });
    }
    if (config.security.enableCsrf && config.security.allowedOrigins.length === 0) {
      issues.push({
        field: "security.allowedOrigins",
        code: "required",
        message: "allowedOrigins should be set when CSRF is enabled",
      });
    }
    if (config.integrations.a2aQueueBackend === "0g-storage" && !config.zeroG.storageNamespace) {
      issues.push({
        field: "zeroG.storageNamespace",
        code: "required",
        message: "storageNamespace is required when using 0g-storage as queue backend",
      });
    }
    return issues;
  }
}

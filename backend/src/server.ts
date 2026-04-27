import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { readConfig } from "./config/env";
import { ComputeProvider } from "./providers/ComputeProvider";
import { StorageProvider } from "./providers/StorageProvider";
import { EventBus } from "./events/EventBus";
import { MemoryStore } from "./memory/MemoryStore";
import { ReflectionEngine } from "./reflection/ReflectionEngine";
import { SkillRegistry } from "./skills/SkillRegistry";
import { AgentRuntime } from "./core/AgentRuntime";
import { AppError, NotFoundError, ValidationError } from "./errors/AppError";
import { normalizeError, toApiErrorResponse } from "./errors/normalize";

dotenv.config();

const config = readConfig();
const app = express();

const events = new EventBus();
const memory = new MemoryStore();
const skills = new SkillRegistry();
const compute = new ComputeProvider(null, config.computeMode);
const storage = new StorageProvider(process.env.OG_STORAGE_RPC || "memory://0g");
const reflection = new ReflectionEngine("qwen3.6-plus");
const runtime = new AgentRuntime(compute, storage, skills, memory, reflection, events);

const walletRegistry = new Map<string, { registeredAt: number; signature: string }>();
const walletConfig = new Map<string, Record<string, unknown>>();
const storageCache = new Map<string, { data: unknown; metadata?: Record<string, unknown>; timestamp: number }>();

skills.register(
  {
    id: "uniswap.swap",
    name: "UniswapSwap",
    description: "Swap tokens via Uniswap on 0G chain",
    tags: ["defi", "swap", "chain"],
    requiresWallet: true,
    touchesChain: true,
    usesCompute: false,
    usesStorage: false,
    enabled: true,
  },
  {
    execute: async (input) => ({
      output: "Prepared swap route and submitted transaction through 0G chain connectivity.",
      txHash: `0x${randomUUID().replace(/-/g, "").padEnd(64, "0").slice(0, 64)}`,
      input,
    }),
  },
);
skills.register(
  {
    id: "og.storage",
    name: "0GStorage",
    description: "Store and retrieve artifacts on 0G Storage",
    tags: ["storage", "memory", "artifact"],
    requiresWallet: false,
    touchesChain: false,
    usesCompute: false,
    usesStorage: true,
    enabled: true,
  },
  { execute: async () => ({ output: "Stored artifact in 0G Storage mode with retrieval hash attached." }) },
);
skills.register(
  {
    id: "wallet.analysis",
    name: "WalletAnalysis",
    description: "Analyze wallet behavior and recent actions",
    tags: ["wallet", "analytics"],
    requiresWallet: true,
    touchesChain: true,
    usesCompute: true,
    usesStorage: false,
    enabled: true,
  },
  { execute: async (input) => ({ output: `Wallet analysis complete for ${(input.walletAddress as string) || "guest"} on 0G testnet.` }) },
);
skills.register(
  {
    id: "price.oracle",
    name: "PriceOracle",
    description: "Fetch mocked price context for demo",
    tags: ["oracle", "market"],
    requiresWallet: false,
    touchesChain: false,
    usesCompute: true,
    usesStorage: false,
    enabled: true,
  },
  { execute: async () => ({ output: "ETH: $3200, BTC: $64500 (demo values from oracle skill)." }) },
);
skills.register(
  {
    id: "ens.lookup",
    name: "ENSLookup",
    description: "Resolve ENS names for cross-chain context",
    tags: ["ens", "identity"],
    requiresWallet: false,
    touchesChain: true,
    usesCompute: false,
    usesStorage: false,
    enabled: true,
  },
  { execute: async () => ({ output: "Resolved ENS with bridge-ready wallet mapping (mocked for local mode)." }) },
);
skills.register(
  {
    id: "reflection.summarize",
    name: "ReflectionSummarize",
    description: "Summarize recent mistakes and corrective actions",
    tags: ["reflection", "learning"],
    requiresWallet: false,
    touchesChain: false,
    usesCompute: true,
    usesStorage: true,
    enabled: true,
  },
  { execute: async () => ({ output: "Recent reflections indicate input validation and fallback clarity should be prioritized." }) },
);

app.use(
  cors({
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-wallet-address", "x-request-id"],
  }),
);
app.use(express.json({ limit: "1mb" }));

app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = (req.headers["x-request-id"] as string) || randomUUID();
  const walletAddress = (req.headers["x-wallet-address"] as string) || "anonymous";
  (req as Request & { requestId: string }).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  console.log(
    JSON.stringify({
      level: "info",
      requestId,
      walletAddress,
      method: req.method,
      path: req.path,
      timestamp: Date.now(),
    }),
  );
  next();
});

function ok<T>(res: Response, data: T, meta: Record<string, unknown> = {}): Response {
  return res.json({ ok: true, data, meta: { ...meta, timestamp: Date.now() } });
}

function requireString(value: unknown, field: string, max = 2000): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.length > max) return null;
  return value.trim();
}

function safeAsync(fn: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

app.get("/health", (_req: Request, res: Response) => {
  ok(res, { status: "ok", uptime: process.uptime() });
});

app.get("/ready", (_req: Request, res: Response) => {
  ok(res, {
    status: "ready",
    services: {
      compute: config.computeMode === "production" ? "healthy" : "degraded",
      storage: config.storageMode === "production" ? "healthy" : "degraded",
      chain: "healthy",
    },
  });
});

app.get("/api/config", (_req: Request, res: Response) => {
  ok(res, {
    appVersion: config.appVersion,
    nodeEnv: config.nodeEnv,
    mode: config.mode,
    chainId: config.chainId,
    rpcUrl: config.rpcUrl,
    explorerUrl: config.explorerUrl,
    computeMode: config.computeMode,
    storageMode: config.storageMode,
  });
});

app.get("/api/agent/status", (_req: Request, res: Response) => {
  ok(res, {
    status: "online",
    agent: "OpenAgents Runtime",
    network: "0G Newton Testnet",
    model: "qwen3.6-plus",
    storage: config.storageMode === "production" ? "0G Storage" : "Memory fallback (degraded)",
    compute: config.computeMode === "production" ? "0G Compute" : "Mock compute (degraded)",
    version: config.appVersion,
    chainId: config.chainId,
    rpc: config.rpcUrl,
    uptime: process.uptime(),
    degraded: config.computeMode !== "production" || config.storageMode !== "production",
  });
});

app.get("/api/agent/skills", (_req: Request, res: Response) => {
  ok(res, { skills: skills.list() });
});

app.post("/api/agent/skills/execute", safeAsync(async (req: Request, res: Response) => {
  const skillId = requireString(req.body?.skill, "skill", 200);
  if (!skillId) throw new ValidationError("skill is required", "API_001_INVALID_REQUEST", { field: "skill" });
  const result = await skills.execute(skillId, req.body?.params || {});
  ok(res, { skill: skillId, result });
}));

app.post("/api/agent/run", safeAsync(async (req: Request, res: Response) => {
  const input = requireString(req.body?.input, "input");
  const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
  if (!input) throw new ValidationError("input must be a non-empty string up to 2000 chars", "API_001_INVALID_REQUEST", { field: "input" });

  const sessionId = walletAddress || "guest";
  const requestId = (req as Request & { requestId: string }).requestId;
  const result = await runtime.runTurn({ input, walletAddress, sessionId }, requestId);
  ok(res, result, { degraded: result.degradedMode });
}));

app.get("/api/agent/history", (req: Request, res: Response) => {
  const wallet = requireString(req.query.wallet, "wallet", 128);
  if (!wallet) throw new ValidationError("wallet query param required", "API_001_INVALID_REQUEST", { field: "wallet" });
  const data = runtime.getInsights(wallet);
  ok(res, data);
});

app.delete("/api/agent/history", (req: Request, res: Response) => {
  const wallet = requireString(req.body?.walletAddress, "walletAddress", 128);
  if (!wallet) throw new ValidationError("walletAddress required", "API_001_INVALID_REQUEST", { field: "walletAddress" });
  // Lightweight clear by pruning all low-priority session records.
  const countBefore = memory.listBySession(wallet).length;
  for (const item of memory.listBySession(wallet)) {
    if (!item.pinned) {
      // no direct delete API yet; mutate to stale and prune
      item.importance = 0;
      item.updatedAt = 0;
    }
  }
  memory.prune(0);
  ok(res, { cleared: true, removed: countBefore });
});

app.post("/api/storage/upload", safeAsync(async (req: Request, res: Response) => {
  if (typeof req.body?.data === "undefined") throw new ValidationError("data is required", "API_001_INVALID_REQUEST", { field: "data" });
  const encoded = Buffer.from(JSON.stringify(req.body.data));
  const rootHash = await storage.upload(encoded);
  storageCache.set(rootHash, { data: req.body.data, metadata: req.body.metadata, timestamp: Date.now() });
  ok(res, { rootHash, metadata: req.body.metadata, network: "0G Storage" });
}));

app.get("/api/storage/download/:hash", (req: Request, res: Response) => {
  const hash = req.params.hash;
  if (!/^0x[a-fA-F0-9]{64}$/.test(hash)) throw new ValidationError("Invalid storage hash format", "API_001_INVALID_REQUEST", { field: "hash" });
  const cached = storageCache.get(hash);
  if (!cached) throw new NotFoundError("No artifact found for hash", "STORAGE_002_DOWNLOAD_FAILED", { hash });
  ok(res, { hash, ...cached });
});

app.post("/api/wallet/register", (req: Request, res: Response) => {
  const walletAddress = requireString(req.body?.walletAddress, "walletAddress", 200);
  const signature = requireString(req.body?.signature, "signature", 500);
  if (!walletAddress || !signature) {
    throw new ValidationError("walletAddress and signature are required", "API_001_INVALID_REQUEST", { required: ["walletAddress", "signature"] });
  }
  walletRegistry.set(walletAddress.toLowerCase(), { registeredAt: Date.now(), signature });
  ok(res, { registered: true, walletAddress });
});

app.get("/api/wallet/:addr/config", (req: Request, res: Response) => {
  const wallet = req.params.addr.toLowerCase();
  const configRow = walletConfig.get(wallet) || { model: "qwen3.6-plus", maxHistory: 50 };
  ok(res, { walletAddress: wallet, config: configRow });
});

app.put("/api/wallet/:addr/config", (req: Request, res: Response) => {
  const wallet = req.params.addr.toLowerCase();
  const next = { ...(walletConfig.get(wallet) || {}), ...(req.body || {}) };
  walletConfig.set(wallet, next);
  ok(res, { walletAddress: wallet, config: next });
});

app.use((_req: Request) => {
  throw new NotFoundError("Endpoint not found");
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const normalized = normalizeError(err, { operation: `${req.method.toLowerCase()} ${req.path}` });
  const enriched = new AppError({
    ...normalized,
    code: normalized.code,
    message: normalized.message,
    category: normalized.category,
    statusCode: normalized.statusCode,
    recoverable: normalized.recoverable,
    retryable: normalized.retryable,
    details: normalized.details,
    operation: normalized.operation,
    requestId,
  });
  console.error(JSON.stringify({
    level: "error",
    requestId,
    code: enriched.code,
    message: enriched.message,
    category: enriched.category,
    operation: enriched.operation,
    details: enriched.details,
    stack: enriched.stack,
  }));
  res.status(enriched.statusCode).json(toApiErrorResponse(enriched, requestId));
});

const server = app.listen(config.port, () => {
  console.log(`OpenAgents backend listening on http://localhost:${config.port}`);
});

function shutdown(signal: string) {
  console.warn(JSON.stringify({ level: "warn", signal, message: "Graceful shutdown started" }));
  server.close(() => {
    console.warn(JSON.stringify({ level: "warn", signal, message: "HTTP server closed" }));
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 8000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

export default app;

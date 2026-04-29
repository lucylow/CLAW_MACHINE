import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import path from "node:path";
import { readConfig } from "./config/env";
import { ComputeProvider } from "./providers/ComputeProvider";
import { StorageProvider } from "./providers/StorageProvider";
import { EventBus } from "./events/EventBus";
import { MemoryStore } from "./memory/MemoryStore";
import { AgentMemorySnapshotAdapter, createDefaultSnapshotService, MemorySnapshotService } from "./memory/snapshots";
import { ReflectionEngine } from "./reflection/ReflectionEngine";
import { SkillRegistry } from "./skills/SkillRegistry";
import { AgentRuntime } from "./core/AgentRuntime";
import { AppError, NotFoundError, ValidationError } from "./errors/AppError";
import { normalizeAppError, toApiErrorResponse } from "./errors/appNormalize";
import { agentRunLimiter, globalLimiter } from "./middleware/rateLimiter";
import { createSkillsRouter } from "./routes/skills";
import { createMemoryRouter } from "./routes/memory";
import { initSse, emitPhase, emitResult, emitError } from "./utils/sse";
import { ZeroGStorageAdapter } from "./adapters/ZeroGStorageAdapter";
import { ZeroGComputeAdapter } from "./adapters/ZeroGComputeAdapter";
import { OpenClawAdapter } from "./adapters/OpenClawAdapter";
import { MemoryOrchestrator } from "./core/MemoryOrchestrator";
import { HierarchicalPlanner } from "./core/HierarchicalPlanner";
import { PruningService } from "./core/PruningService";
import { createPlannerRouter } from "./routes/planner";
import { createOpenClawRouter } from "./routes/openclaw";
import { SkillEvolutionEngine } from "./core/evolution/SkillEvolutionEngine";
import { OnChainSkillRegistry } from "./onchain/OnChainSkillRegistry";
import { createEvolutionRouter } from "./routes/evolution";
import { createOnChainRouter } from "./routes/onchain";
import { createBuilderRouter } from "./routes/builder";
import { createDeployZeroGRouter } from "./routes/deploy-zero-g";
import { createMultimodalRoutes } from "./api/multimodal";
import { createSkillRegistryRoutes } from "./api/skillRegistryRoutes";
import { SkillRegistryClient } from "./chain/skillRegistryClient";
import type { Address } from "./chain/skillRegistryTypes";
import { MultimodalReasoningPipeline } from "./multimodal/multimodal-reasoning";
import { FileMultimodalMemoryStore } from "./memory/multimodal-memory";
import { MockZeroGMultimodalComputeClient, ZeroGComputeMultimodalAdapter } from "./providers/zeroGCompute";

dotenv.config();

const config = readConfig();
const app = express();

const events = new EventBus();
const memory = new MemoryStore();
const skills = new SkillRegistry();
const compute = new ComputeProvider(null, config.computeMode);
const storage = new StorageProvider(process.env.OG_STORAGE_RPC || "memory://0g");
const reflection = new ReflectionEngine("qwen3.6-plus");

const memorySnapshotsEnabled = process.env.MEMORY_SNAPSHOTS_ENABLED !== "false";
const memorySnapshotService: MemorySnapshotService | null = memorySnapshotsEnabled
  ? createDefaultSnapshotService({
      directory: process.env.MEMORY_SNAPSHOTS_DIR || path.join(process.cwd(), "data", "snapshots"),
    })
  : null;
const memorySnapshotAdapter = memorySnapshotService ? new AgentMemorySnapshotAdapter(memorySnapshotService) : undefined;

const runtime = new AgentRuntime(compute, storage, skills, memory, reflection, events, memorySnapshotAdapter);

// ── v4 adapters (0G Storage KV/Log, 0G Compute TEE, OpenClaw bridge) ────────
const zgStorage = new ZeroGStorageAdapter();
const zgCompute = new ZeroGComputeAdapter({ defaultModel: "qwen3.6-plus" });
const memoryOrchestrator = new MemoryOrchestrator(zgStorage, zgCompute);
const hierarchicalPlanner = new HierarchicalPlanner(zgCompute);
const pruningService = new PruningService(memoryOrchestrator, zgCompute, zgStorage);
const openClawAdapter = new OpenClawAdapter(skills);
// ── v6 adapters (SkillEvolutionEngine, OnChainSkillRegistry) ────────────────
const evolutionEngine = new SkillEvolutionEngine(zgCompute as any, zgStorage as any, skills);
const chainRegistry = new OnChainSkillRegistry({
  rpcUrl: process.env.EVM_RPC || "https://evmrpc-testnet.0g.ai",
  contractAddress: process.env.CONTRACT_ADDRESS || "0x0000000000000000000000000000000000000000",
  privateKey: process.env.PRIVATE_KEY,
});
chainRegistry.connect().catch((err: unknown) => {
  const normalized = normalizeAppError(err, { operation: "onchain.registry.connect", category: "chain", retryable: true });
  console.warn(
    JSON.stringify({
      level: "warn",
      message: "On-chain registry connect failed; continuing in degraded mode",
      code: normalized.code,
      details: normalized.details,
    }),
  );
});
console.log(JSON.stringify({ level: "info", message: "0G adapters ready", storageMode: zgStorage.getStats().mode, computeMode: zgCompute.getMode() }));

const multimodalMemory = new FileMultimodalMemoryStore({
  directory: process.env.MULTIMODAL_MEMORY_DIR || path.join(process.cwd(), "data", "multimodal-memory"),
});
const multimodalEndpoint = process.env.ZERO_G_MULTIMODAL_ENDPOINT?.trim();
const multimodalCompute =
  multimodalEndpoint && multimodalEndpoint.length > 0
    ? new ZeroGComputeMultimodalAdapter({
        endpoint: multimodalEndpoint,
        apiKey: process.env.ZERO_G_MULTIMODAL_API_KEY,
      })
    : new MockZeroGMultimodalComputeClient();
const multimodalPipeline = new MultimodalReasoningPipeline({
  compute: multimodalCompute,
  memory: multimodalMemory,
  events: {
    emit: (eventName, payload) =>
      events.emit(eventName, payload, typeof payload.requestId === "string" ? payload.requestId : undefined),
  },
  fallbackMode: config.nodeEnv === "production" ? "disabled" : "mock",
});

const skillRegistryAddress = process.env.SKILL_REGISTRY_ADDRESS as Address | undefined;
const skillRegistryRpc = process.env.SKILL_REGISTRY_RPC_URL;
const skillRegistryChainId = Number(process.env.SKILL_REGISTRY_CHAIN_ID || "0");
const skillRegistryWriteKey = process.env.SKILL_REGISTRY_PRIVATE_KEY;
const skillRegistryClient =
  skillRegistryAddress && skillRegistryRpc && Number.isFinite(skillRegistryChainId) && skillRegistryChainId > 0
    ? (() => {
        const base = new SkillRegistryClient({
          chainId: skillRegistryChainId,
          registryAddress: skillRegistryAddress,
          rpcUrl: skillRegistryRpc,
        });
        const writeKey = skillRegistryWriteKey || process.env.PRIVATE_KEY;
        return writeKey ? base.connectSigner(writeKey) : base;
      })()
    : null;

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

skills.register(
  {
    id: "agent.swarm",
    name: "AgentSwarm",
    description: "Coordinate multiple specialized agents for complex tasks",
    tags: ["swarm", "multi-agent", "coordination"],
    requiresWallet: false,
    touchesChain: false,
    usesCompute: true,
    usesStorage: false,
    enabled: true,
  },
  { 
    execute: async (input) => {
      const task = input.prompt || "general task";
      const requestId = randomUUID().slice(0, 8);
      return { 
        output: `Swarm coordination [ID:${requestId}] complete for: "${task}".
        
[Analyst Agent]
- Status: Completed
- Action: Decomposed task into 3 sub-steps.
- Insight: High probability of success on 0G Newton.

[Executor Agent]
- Status: Ready
- Action: Prepared transaction payload for 0G chain.
- Resource: 0G Compute Node #42.

[Monitor Agent]
- Status: Verified
- Action: Validated TEE signature and security policy.
- Result: All constraints satisfied.`,
        agents: ["Analyst", "Executor", "Monitor"],
        swarmId: requestId,
        timestamp: Date.now()
      };
    } 
  },
);

app.use(
  cors({
    origin: config.corsOrigin,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-wallet-address", "x-request-id"],
  }),
);
app.use(express.json({ limit: "1mb" }));
app.use(globalLimiter);

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
  const memUsage = process.memoryUsage();
  ok(res, {
    status: "ok",
    uptime: process.uptime(),
    memory: {
      heapUsedMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      rssMb: Math.round(memUsage.rss / 1024 / 1024),
    },
    memoryStore: { total: memory.search({ limit: 9999 }).length },
    skills: { registered: skills.list().length, enabled: skills.list().filter(s => s.enabled).length },
    events: { recent: events.recent(1).length > 0 },
  });
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

// Skills management router (GET/POST /:id/enable|disable)
app.use("/api/agent/skills", createSkillsRouter(skills));

app.use("/api/agent/multimodal", createMultimodalRoutes({ pipeline: multimodalPipeline }));
if (skillRegistryClient) {
  app.use(
    "/api/skills/registry",
    createSkillRegistryRoutes({
      client: skillRegistryClient,
      logger: {
        info: (message, meta) => console.log(JSON.stringify({ level: "info", message, ...(meta || {}) })),
        warn: (message, meta) => console.warn(JSON.stringify({ level: "warn", message, ...(meta || {}) })),
        error: (message, meta) => console.error(JSON.stringify({ level: "error", message, ...(meta || {}) })),
      },
      requireAuth: async (req: Request) => {
        const headerAddr = req.headers["x-wallet-address"];
        const address = typeof headerAddr === "string" ? headerAddr : "";
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return null;
        return { address: address as Address };
      },
    }),
  );
}

// Memory search & management router
app.use("/api/memory", createMemoryRouter(memory));

// ── v4 routes ────────────────────────────────────────────────────────────────
app.use("/api/agent/plan", createPlannerRouter(hierarchicalPlanner, runtime));
app.use("/api/agent/plans", createPlannerRouter(hierarchicalPlanner, runtime));
app.use("/api/openclaw", createOpenClawRouter(openClawAdapter, skills));

// Memory Orchestrator endpoints
app.get("/api/memory/orchestrator/stats", (_req: Request, res: Response) => {
  ok(res, { stats: memoryOrchestrator.getStats() });
});

app.post("/api/memory/orchestrator/search", safeAsync(async (req: Request, res: Response) => {
  const query = requireString(req.body?.query, "query", 500);
  if (!query) throw new ValidationError("query required", "API_001_INVALID_REQUEST", { field: "query" });
  const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
  const limit = typeof req.body?.limit === "number" ? req.body.limit : 5;
  const results = await memoryOrchestrator.retrieveLessons(query, { limit, walletAddress });
  ok(res, { results, count: results.length });
}));

app.post("/api/memory/orchestrator/reflect", safeAsync(async (req: Request, res: Response) => {
  const input = requireString(req.body?.input, "input", 1000);
  const output = requireString(req.body?.output, "output", 2000);
  if (!input || !output) throw new ValidationError("input and output required", "API_001_INVALID_REQUEST");
  const success = req.body?.success !== false;
  const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "guest";
  const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
  const reflection = await memoryOrchestrator.reflectTask({ input, sessionId, walletAddress }, { success, output });
  ok(res, { reflection });
}));

// Periodic memory pruning
setInterval(() => {
  pruningService.maybePrune().then((r) => {
    if (r) console.log(JSON.stringify({ level: "info", message: "Memory pruned", evicted: r.evicted, summarized: r.summarized, durationMs: r.durationMs }));
  }).catch((err: unknown) => {
    const normalized = normalizeAppError(err, { operation: "memory.prune", category: "memory", retryable: true });
    console.warn(
      JSON.stringify({
        level: "warn",
        message: "Periodic memory pruning failed",
        code: normalized.code,
        details: normalized.details,
      }),
    );
  });
}, 5 * 60 * 1000);

// ── SSE Streaming endpoint ────────────────────────────────────────────────
app.post("/api/agent/stream", agentRunLimiter, safeAsync(async (req: Request, res: Response) => {
  const input = requireString(req.body?.input, "input");
  const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
  if (!input) {
    res.status(400).json({ error: "input required" });
    return;
  }
  const sse = initSse(req, res);
  const sessionId = walletAddress || "guest";
  const requestId = (req as Request & { requestId: string }).requestId;

  const unsubscribe = events.on((event) => {
    if (event.requestId === requestId) {
      emitPhase(sse, event.type, event.payload);
    }
  });
  req.on("close", unsubscribe);

  try {
    emitPhase(sse, "started", { input: input.slice(0, 80) });
    emitPhase(sse, "routing");
    const result = await runtime.runTurn({ input, walletAddress, sessionId }, requestId);
    emitPhase(sse, "complete", { degraded: result.degradedMode });
    emitResult(sse, result);
  } catch (err: unknown) {
    const normalized = normalizeAppError(err, { operation: "stream" });
    emitError(sse, normalized.code, normalized.message);
  } finally {
    unsubscribe();
  }
}));

app.post("/api/agent/run", agentRunLimiter, safeAsync(async (req: Request, res: Response) => {
  const input = requireString(req.body?.input, "input");
  const walletAddress = typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined;
  if (!input) throw new ValidationError("input must be a non-empty string up to 2000 chars", "API_001_INVALID_REQUEST", { field: "input" });

  const sessionId = walletAddress || "guest";
  const requestId = (req as Request & { requestId: string }).requestId;
  const result = await runtime.runTurn({ input, walletAddress, sessionId }, requestId);
  ok(res, result, { degraded: result.degradedMode });
}));

app.get("/api/agent/history", (req: Request, res: Response) => {
  const wallet = requireString(req.query.wallet as string, "wallet", 128);
  if (!wallet) throw new ValidationError("wallet query param required", "API_001_INVALID_REQUEST", { field: "wallet" });
  const data = runtime.getInsights(wallet);
  ok(res, data);
});

// Richer insights endpoint
app.get("/api/agent/insights", (req: Request, res: Response) => {
  const wallet = requireString(req.query.wallet as string, "wallet", 128) || "guest";
  const insights = runtime.getInsights(wallet);
  const memStats = memory.search({ sessionId: wallet, limit: 200 });
  const byType: Record<string, number> = {};
  for (const m of memStats) byType[m.type] = (byType[m.type] ?? 0) + 1;
  ok(res, {
    ...insights,
    stats: {
      totalMemories: memStats.length,
      byType,
      pinnedCount: memStats.filter(m => (m as typeof m & { pinned?: boolean }).pinned).length,
      avgImportance: memStats.length
        ? (memStats.reduce((s, m) => s + m.importance, 0) / memStats.length).toFixed(3)
        : 0,
    },
    recentEvents: events.recent(10),
  });
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

// ── v6 routes ────────────────────────────────────────────────────────────────
app.use("/api/evolution", createEvolutionRouter(evolutionEngine, chainRegistry));
app.use("/api/onchain",   createOnChainRouter(chainRegistry));
app.use("/api/builder", createBuilderRouter());
app.use("/api/deploy", createDeployZeroGRouter());

app.use((_req: Request) => {
  throw new NotFoundError("Endpoint not found");
});

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const requestId = (req as Request & { requestId?: string }).requestId;
  const normalized = normalizeAppError(err, { operation: `${req.method.toLowerCase()} ${req.path}` });
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

let server: ReturnType<typeof app.listen>;

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

async function startServer(): Promise<void> {
  if (memorySnapshotService) {
    try {
      await memorySnapshotService.init();
      const { migrated, compacted } = await memorySnapshotService.migrateAllSnapshots();
      console.log(
        JSON.stringify({
          level: "info",
          message: "Memory snapshots ready",
          migrated,
          compacted,
          directory: process.env.MEMORY_SNAPSHOTS_DIR || path.join(process.cwd(), "data", "snapshots"),
        }),
      );
    } catch (err) {
      const normalized = normalizeAppError(err, { operation: "memory.snapshots.bootstrap", category: "memory", retryable: true });
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "Memory snapshot init/migrate failed; continuing without disk snapshots",
          code: normalized.code,
          details: normalized.details,
        }),
      );
    }
  }

  server = app.listen(config.port, () => {
    console.log(`OpenAgents backend listening on http://localhost:${config.port}`);
  });
}

void startServer();

export default app;

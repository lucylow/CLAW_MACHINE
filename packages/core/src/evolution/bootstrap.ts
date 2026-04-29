import { SelfEvolvingSkillEngine } from "./engine.js";
import { InMemoryEvolutionStore, JsonFileEvolutionStore, ZeroGStorageEvolutionStore } from "./store.js";
import { registerEvolutionRoutes } from "./routes.js";
import type { LiveSkillRunnerLike } from "./registry.js";

export function createEvolutionEngineFromEnv(args: {
  compute: {
    generate(
      prompt: string,
      opts?: { temperature?: number; maxTokens?: number; json?: boolean; systemPrompt?: string }
    ): Promise<{ text: string; confidence?: number; model?: string }>;
    mode?: "mock" | "default" | "production" | "hybrid";
  };
  runner: LiveSkillRunnerLike;
  storage?: {
    put(
      key: string,
      value: unknown,
      opts?: { contentType?: string; compress?: boolean; encrypt?: boolean; ttlMs?: number; metadata?: Record<string, unknown> }
    ): Promise<{
      key: string;
      checksum: string;
      createdAt: number;
      updatedAt: number;
      ttlMs?: number;
      contentType?: string;
      metadata?: Record<string, unknown>;
      bytes: number;
    }>;
    get<T = unknown>(key: string): Promise<T | undefined>;
    list(prefix?: string): Promise<
      Array<{
        key: string;
        checksum: string;
        createdAt: number;
        updatedAt: number;
        ttlMs?: number;
        contentType?: string;
        metadata?: Record<string, unknown>;
        bytes: number;
      }>
    >;
    del(key: string): Promise<boolean>;
  };
  dataFile?: string;
  useZeroGStorage?: boolean;
  useFileStore?: boolean;
}) {
  const store =
    args.useZeroGStorage && args.storage
      ? new ZeroGStorageEvolutionStore(args.storage, "evolution")
      : args.useFileStore && args.dataFile
        ? new JsonFileEvolutionStore(args.dataFile)
        : new InMemoryEvolutionStore();

  return new SelfEvolvingSkillEngine({
    compute: args.compute,
    store,
    runner: args.runner,
    policy: {
      minPassRate: 1,
      minScore: 0.82,
      maxRepairRounds: 2,
      allowHotRegister: true,
      allowRepairedPromotions: true,
      persistAllAttempts: true,
      sandboxTimeoutMs: 1800,
      requireAtLeastOnePositiveTest: true,
    },
  });
}

export function mountEvolutionPackage(app: { get: (...args: unknown[]) => void; post: (...args: unknown[]) => void }, engine: SelfEvolvingSkillEngine) {
  registerEvolutionRoutes(app, { engine });
  return engine;
}

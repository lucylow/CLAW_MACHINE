import type { FrameworkConfig, FrameworkKernelOptions, ParsedEnv } from "./types";
import { ConfigLoader, ConfigValidationError } from "./config";
import {
  AgentRuntimePlugin,
  CoreTelemetryPlugin,
  FeatureFlagsPlugin,
  SafetyPlugin,
} from "./builtin-plugins";
import { FrameworkKernel } from "./kernel";

export function createFrameworkKernel(
  config: FrameworkConfig,
  overrides?: Partial<Omit<FrameworkKernelOptions, "config">>,
): FrameworkKernel {
  const kernel = new FrameworkKernel({
    config,
    logger: overrides?.logger,
    metrics: overrides?.metrics,
    events: overrides?.events,
    health: overrides?.health,
    flags: overrides?.flags,
    rateLimiter: overrides?.rateLimiter,
    breakers: overrides?.breakers,
    context: overrides?.context,
  });

  kernel.registerPlugin(CoreTelemetryPlugin, true);
  kernel.registerPlugin(FeatureFlagsPlugin, true);
  kernel.registerPlugin(SafetyPlugin, true);
  kernel.registerPlugin(AgentRuntimePlugin, true);

  return kernel;
}

export async function bootstrapFrameworkFromEnv(env: ParsedEnv = process.env as ParsedEnv): Promise<FrameworkKernel> {
  const fileEnv = env.ENV_FILE ? ConfigLoader.loadEnvFile(env.ENV_FILE) : {};
  const merged = ConfigLoader.mergeEnvs(fileEnv, env);
  const config = ConfigLoader.parse(merged);
  const issues = ConfigLoader.validate(config);
  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }
  const kernel = createFrameworkKernel(config);
  await kernel.start();

  // ── Graceful shutdown ──────────────────────────────────────────────────────
  // Register SIGTERM and SIGINT handlers so the kernel stops cleanly when the
  // process is terminated (e.g. by Docker, Kubernetes, or Ctrl-C).
  const shutdown = async (signal: string) => {
    kernel.logger.info(`Received ${signal} — shutting down gracefully`);
    try {
      await kernel.stop();
      process.exit(0);
    } catch (err) {
      kernel.logger.error("Error during graceful shutdown", { error: String(err) });
      process.exit(1);
    }
  };

  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT",  () => shutdown("SIGINT"));

  return kernel;
}


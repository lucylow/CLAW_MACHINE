import fs from "node:fs/promises";
import path from "node:path";
import type {
  BreakerRegistry,
  EventBus,
  FeatureFlagService,
  FrameworkConfig,
  FrameworkKernelOptions,
  FrameworkPlugin,
  HealthCheckResult,
  HealthRegistry,
  HealthStatus,
  KernelState,
  Logger,
  MetricsClient,
  PluginCapabilityMap,
  PluginRegistration,
  RateLimitPolicy,
  RateLimiter,
  RequestContext,
  RequestContextStore,
  ServiceDefinition,
} from "./types";
import { ConfigValidationError, ConfigLoader } from "./config";
import { FrameworkError, wrapError } from "./errors";
import { createBreakerRegistry } from "./breaker";
import { createContextStore } from "./context";
import { createEventBus } from "./events";
import { createFeatureFlags } from "./feature-flags";
import { createHealthRegistry } from "./health";
import { createLogger } from "./logger";
import { createMetrics } from "./metrics";
import { createRateLimiter } from "./rate-limit";
import { createId, errorToRecord, nowIso, nowMs, stableJson } from "./util";

export class ServiceRegistry {
  private services = new Map<string, ServiceDefinition>();

  register(service: ServiceDefinition): void {
    this.services.set(service.name, service);
  }

  get(name: string): ServiceDefinition | null {
    return this.services.get(name) ?? null;
  }

  list(): ServiceDefinition[] {
    return [...this.services.values()];
  }

  names(): string[] {
    return [...this.services.keys()];
  }
}

export class FrameworkKernel {
  readonly config: FrameworkConfig;
  readonly logger: Logger;
  readonly metrics: MetricsClient;
  readonly events: EventBus;
  readonly health: HealthRegistry;
  readonly flags: FeatureFlagService;
  readonly rateLimiter: RateLimiter;
  readonly breakers: BreakerRegistry;
  readonly context: RequestContextStore;
  readonly services = new ServiceRegistry();

  private plugins = new Map<string, PluginRegistration>();
  private pluginOrder: string[] = [];
  private booted = false;
  private started = false;
  private bootedAt?: string;
  private startedAt?: string;
  private stoppedAt?: string;

  constructor(options: FrameworkKernelOptions) {
    this.config = options.config;
    this.logger =
      options.logger ??
      createLogger(options.config.logLevel, { service: options.config.appName, env: options.config.env });
    this.metrics = options.metrics ?? createMetrics();
    this.events = options.events ?? createEventBus();
    this.health = options.health ?? createHealthRegistry();
    this.flags = options.flags ?? createFeatureFlags(options.config.featureFlags);
    this.rateLimiter = options.rateLimiter ?? createRateLimiter();
    this.breakers =
      options.breakers ??
      createBreakerRegistry(
        {
          threshold: options.config.defaultCircuitBreakerThreshold,
          resetAfterMs: options.config.defaultCircuitBreakerResetMs,
          halfOpenMaxRequests: 1,
        },
        this.logger,
      );
    this.context = options.context ?? createContextStore();
    this.bootedAt = nowIso();
  }

  registerService(service: ServiceDefinition): void {
    this.services.register(service);
    if (service.health) {
      this.health.register({
        name: service.name,
        kind: service.kind,
        timeoutMs: 5_000,
        run: service.health,
      });
    }
  }

  registerPlugin(plugin: FrameworkPlugin, enabled = true): void {
    if (this.plugins.has(plugin.name)) {
      throw new FrameworkError({
        category: "plugin",
        code: "PLUGIN_DUPLICATE",
        message: `Plugin ${plugin.name} is already registered`,
        retryable: false,
        statusCode: 409,
      });
    }

    this.plugins.set(plugin.name, {
      plugin,
      enabled,
      loadedAt: nowIso(),
    });
    this.pluginOrder.push(plugin.name);
  }

  enablePlugin(name: string): void {
    const reg = this.plugins.get(name);
    if (!reg) return;
    reg.enabled = true;
  }

  disablePlugin(name: string): void {
    const reg = this.plugins.get(name);
    if (!reg) return;
    reg.enabled = false;
  }

  getPlugin(name: string): FrameworkPlugin | null {
    return this.plugins.get(name)?.plugin ?? null;
  }

  listPlugins(): PluginRegistration[] {
    return this.pluginOrder.map((name) => this.plugins.get(name)!).filter(Boolean);
  }

  async boot(): Promise<void> {
    if (this.booted) return;
    const validation = ConfigLoader.validate(this.config);
    if (validation.length > 0) throw new ConfigValidationError(validation);

    this.context.set({
      requestId: createId("boot"),
      traceId: createId("trace"),
      spanId: createId("span"),
      startTime: nowMs(),
      metadata: { phase: "boot" },
    });

    this.logger.info("Booting framework kernel", {
      appName: this.config.appName,
      env: this.config.env,
      version: this.config.version,
      dataDir: this.config.dataDir,
    });

    await fs.mkdir(this.config.paths.data, { recursive: true });
    await fs.mkdir(this.config.paths.logs, { recursive: true });
    await fs.mkdir(this.config.paths.cache, { recursive: true });
    await fs.mkdir(this.config.paths.snapshots, { recursive: true });
    await fs.mkdir(this.config.paths.manifests, { recursive: true });

    for (const registration of this.listPlugins()) {
      if (!registration.enabled) continue;
      await this.initPlugin(registration.plugin);
    }

    this.booted = true;
    this.metrics.increment("kernel.booted", 1, { app: this.config.appName, env: this.config.env });
    this.logger.info("Kernel boot completed", { bootedAt: nowIso() });
  }

  async start(): Promise<void> {
    if (this.started) return;
    await this.boot();
    for (const registration of this.listPlugins()) {
      if (!registration.enabled) continue;
      await this.startPlugin(registration.plugin);
    }
    this.started = true;
    this.startedAt = nowIso();
    this.logger.info("Kernel started", { startedAt: this.startedAt, plugins: this.pluginOrder.length });
  }

  async stop(): Promise<void> {
    for (const registration of [...this.listPlugins()].reverse()) {
      if (!registration.enabled) continue;
      await this.stopPlugin(registration.plugin);
    }
    this.started = false;
    this.stoppedAt = nowIso();
    this.metrics.increment("kernel.stopped", 1, { app: this.config.appName, env: this.config.env });
    this.logger.info("Kernel stopped", { stoppedAt: this.stoppedAt });
  }

  async healthReport(): Promise<HealthCheckResult[]> {
    return this.health.run();
  }

  healthSummary(): { status: HealthStatus; healthy: number; degraded: number; unhealthy: number; checks: number } {
    return this.health.summary();
  }

  snapshot(): KernelState {
    return {
      started: this.started,
      bootedAt: this.bootedAt,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      plugins: this.listPlugins(),
    };
  }

  async writeSnapshot(fileName = `kernel-${Date.now()}.json`): Promise<string> {
    const payload = {
      state: this.snapshot(),
      health: await this.healthReport(),
      config: {
        ...this.config,
        security: {
          ...this.config.security,
          adminApiKeys: this.config.security.adminApiKeys.length > 0 ? ["[redacted]"] : [],
          sessionSecret: this.config.security.sessionSecret ? "[redacted]" : undefined,
        },
      },
      metrics: this.metrics.snapshot(),
      features: this.flags.list(),
      breakers: this.breakers.snapshot(),
      timestamp: nowIso(),
    };
    const filePath = path.join(this.config.paths.snapshots, fileName);
    await fs.writeFile(filePath, stableJson(payload), "utf8");
    return filePath;
  }

  async guard<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const breaker = this.breakers.get(name);
    const start = nowMs();
    try {
      const result = await breaker.execute(operation);
      this.metrics.timing(`guard.${name}.latency_ms`, nowMs() - start);
      return result;
    } catch (error) {
      const wrapped = wrapError(error, `${name.toUpperCase()}_FAILED`);
      this.metrics.increment(`guard.${name}.error`, 1, { category: wrapped.category, retryable: wrapped.retryable });
      this.logger.error(`Guarded operation failed: ${name}`, { error: errorToRecord(error) });
      throw wrapped;
    }
  }

  async withRateLimit<T>(key: string, policy: RateLimitPolicy, operation: () => Promise<T>): Promise<T> {
    const check = await this.rateLimiter.allow(key, policy);
    if (!check.allowed) {
      throw new FrameworkError({
        category: "rate-limit",
        code: "RATE_LIMITED",
        message: `Rate limit exceeded for ${key}`,
        retryable: true,
        statusCode: 429,
        details: { key, remaining: check.remaining, resetAt: check.resetAt },
      });
    }
    return operation();
  }

  async emit<T>(event: string, payload: T, meta?: Record<string, unknown>): Promise<void> {
    const ctx = this.context.get();
    await this.events.emit(event, payload, {
      ...meta,
      requestId: ctx?.requestId,
      traceId: ctx?.traceId,
      spanId: ctx?.spanId,
    });
    this.metrics.increment(`event.${event}`, 1, { app: this.config.appName });
  }

  async createRequestContext(patch?: Partial<RequestContext>): Promise<RequestContext> {
    const ctx = this.context.fork(patch);
    this.logger.debug("Request context created", {
      requestId: ctx.requestId,
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      route: ctx.route,
    });
    return ctx;
  }

  async runWithContext<T>(patch: Partial<RequestContext>, operation: () => Promise<T>): Promise<T> {
    const ctx = this.context.fork(patch);
    const start = nowMs();
    try {
      const result = await operation();
      this.metrics.timing("context.operation.latency_ms", nowMs() - start, { route: ctx.route ?? "unknown" });
      return result;
    } finally {
      this.context.clear();
    }
  }

  private async initPlugin(plugin: FrameworkPlugin): Promise<void> {
    const capabilities = this.capabilities();
    try {
      await plugin.init?.(this, capabilities);
      const registration = this.plugins.get(plugin.name);
      if (registration) registration.loadedAt = nowIso();
      this.logger.info("Plugin initialized", { plugin: plugin.name, version: plugin.version });
    } catch (error) {
      throw new FrameworkError({
        category: "plugin",
        code: "PLUGIN_INIT_FAILED",
        message: `Failed to initialize plugin ${plugin.name}`,
        retryable: false,
        statusCode: 500,
        details: errorToRecord(error),
        cause: error,
      });
    }
  }

  private async startPlugin(plugin: FrameworkPlugin): Promise<void> {
    const capabilities = this.capabilities();
    try {
      await plugin.start?.(this, capabilities);
      const registration = this.plugins.get(plugin.name);
      if (registration) registration.startedAt = nowIso();
      this.logger.info("Plugin started", { plugin: plugin.name });
    } catch (error) {
      throw new FrameworkError({
        category: "plugin",
        code: "PLUGIN_START_FAILED",
        message: `Failed to start plugin ${plugin.name}`,
        retryable: false,
        statusCode: 500,
        details: errorToRecord(error),
        cause: error,
      });
    }
  }

  private async stopPlugin(plugin: FrameworkPlugin): Promise<void> {
    const capabilities = this.capabilities();
    try {
      await plugin.stop?.(this, capabilities);
      const registration = this.plugins.get(plugin.name);
      if (registration) registration.stoppedAt = nowIso();
      this.logger.info("Plugin stopped", { plugin: plugin.name });
    } catch (error) {
      this.logger.warn("Plugin stop failed", { plugin: plugin.name, error: errorToRecord(error) });
    }
  }

  private capabilities(): PluginCapabilityMap {
    return {
      config: this.config,
      logger: this.logger,
      metrics: this.metrics,
      events: this.events,
      health: this.health,
      featureFlags: this.flags,
      rateLimiter: this.rateLimiter,
      breaker: this.breakers,
      context: this.context,
    };
  }
}

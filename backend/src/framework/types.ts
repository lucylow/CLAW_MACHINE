export type FrameworkEnv = "development" | "test" | "staging" | "production";
export type LogLevel = "debug" | "info" | "warn" | "error";
export type HealthStatus = "healthy" | "degraded" | "unhealthy";
export type ServiceKind =
  | "agent-runtime"
  | "memory"
  | "queue"
  | "compute"
  | "chain"
  | "skill-registry"
  | "storage"
  | "api";
export type ErrorCategory =
  | "validation"
  | "config"
  | "auth"
  | "quota"
  | "rate-limit"
  | "timeout"
  | "dependency"
  | "network"
  | "storage"
  | "compute"
  | "chain"
  | "memory"
  | "queue"
  | "plugin"
  | "internal";

export interface FrameworkConfig {
  appName: string;
  env: FrameworkEnv;
  version: string;
  port: number;
  host: string;
  baseUrl: string;
  logLevel: LogLevel;
  dataDir: string;
  enableMetrics: boolean;
  enableTracing: boolean;
  enableHealthChecks: boolean;
  enableFeatureFlags: boolean;
  requestTimeoutMs: number;
  defaultRetryAttempts: number;
  defaultRetryBackoffMs: number;
  defaultCircuitBreakerThreshold: number;
  defaultCircuitBreakerResetMs: number;
  maxConcurrentRequests: number;
  maxPayloadBytes: number;
  zeroG: {
    chainId?: number;
    rpcUrl?: string;
    storageNamespace?: string;
    computeEndpoint?: string;
    daEndpoint?: string;
  };
  integrations: {
    a2aQueueBackend: "0g-storage" | "file" | "memory";
    skillRegistryAddress?: string;
    skillRegistryRpcUrl?: string;
  };
  paths: {
    logs: string;
    data: string;
    cache: string;
    snapshots: string;
    manifests: string;
  };
  security: {
    enableCsrf?: boolean;
    allowedOrigins: string[];
    adminApiKeys: string[];
    sessionSecret?: string;
  };
  featureFlags: Record<string, boolean>;
}

export interface ParsedEnv {
  [key: string]: string | undefined;
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
  expected?: string;
  actual?: unknown;
}

export interface StructuredError extends Error {
  id: string;
  category: ErrorCategory;
  code: string;
  retryable: boolean;
  statusCode: number;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export interface LogRecord {
  ts: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  service?: string;
}

export interface MetricPoint {
  name: string;
  value: number;
  tags?: Record<string, string | number | boolean>;
  ts: string;
}

export interface HealthCheckResult {
  name: string;
  kind: ServiceKind;
  status: HealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
  checkedAt: string;
}

export interface Logger {
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export interface MetricsClient {
  increment(name: string, value?: number, tags?: Record<string, string | number | boolean>): void;
  gauge(name: string, value: number, tags?: Record<string, string | number | boolean>): void;
  timing(name: string, valueMs: number, tags?: Record<string, string | number | boolean>): void;
  snapshot(): MetricPoint[];
}

export interface EventBus {
  on(event: string, handler: EventHandler): () => void;
  once(event: string, handler: EventHandler): () => void;
  emit<T>(event: string, payload: T, meta?: Record<string, unknown>): Promise<void>;
  clear(): void;
}

export interface RetryPolicy {
  attempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterRatio: number;
  retryableCategories: ErrorCategory[];
}

export interface BreakerPolicy {
  threshold: number;
  resetAfterMs: number;
  halfOpenMaxRequests: number;
}

export interface RateLimitPolicy {
  windowMs: number;
  maxRequests: number;
  burst?: number;
}

export interface RequestContext {
  requestId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  userId?: string;
  sessionId?: string;
  turnId?: string;
  actor?: string;
  route?: string;
  tags?: string[];
  startTime: number;
  deadline?: number;
  metadata: Record<string, unknown>;
}

export interface RequestContextStore {
  set(context: RequestContext): void;
  get(): RequestContext | null;
  clear(): void;
  fork(patch?: Partial<RequestContext>): RequestContext;
}

export interface FeatureFlagService {
  isEnabled(flag: string, defaultValue?: boolean): boolean;
  get(flag: string): boolean | undefined;
  set(flag: string, value: boolean): void;
  list(): Record<string, boolean>;
}

export interface HealthRegistry {
  register(check: HealthCheck): void;
  unregister(name: string): void;
  run(): Promise<HealthCheckResult[]>;
  summary(): { status: HealthStatus; healthy: number; degraded: number; unhealthy: number; checks: number };
}

export interface HealthCheck {
  name: string;
  kind: ServiceKind;
  timeoutMs?: number;
  run: () => Promise<HealthCheckResult> | HealthCheckResult;
}

export interface RateLimiter {
  allow(key: string, policy?: RateLimitPolicy): Promise<{ allowed: boolean; remaining: number; resetAt: number }>;
  snapshot(): Record<string, { remaining: number; resetAt: number }>;
}

export interface CircuitBreaker {
  name: string;
  state: "closed" | "open" | "half-open";
  failures: number;
  successCount: number;
  lastFailureAt?: number;
  lastSuccessAt?: number;
  nextAttemptAt?: number;
  execute<T>(operation: () => Promise<T>): Promise<T>;
  recordSuccess(): void;
  recordFailure(error: unknown): void;
}

export interface BreakerRegistry {
  get(name: string): CircuitBreaker;
  snapshot(): Record<string, { state: string; failures: number; successCount: number; nextAttemptAt?: number }>;
}

export interface EventEnvelope<T = unknown> {
  event: string;
  payload: T;
  ts: string;
  source?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
  meta?: Record<string, unknown>;
}

export type EventHandler<T = unknown> = (envelope: EventEnvelope<T>) => Promise<void> | void;

export interface PluginCapabilityMap {
  config?: FrameworkConfig;
  logger?: Logger;
  metrics?: MetricsClient;
  events?: EventBus;
  health?: HealthRegistry;
  featureFlags?: FeatureFlagService;
  rateLimiter?: RateLimiter;
  breaker?: BreakerRegistry;
  context?: RequestContextStore;
}

/** Kernel API surface exposed to plugins (keeps types acyclic vs. the concrete kernel class). */
export interface FrameworkKernelForPlugins {
  readonly config: FrameworkConfig;
  registerService(service: ServiceDefinition): void;
  readonly health: HealthRegistry;
}

export interface FrameworkPlugin {
  name: string;
  version: string;
  description?: string;
  dependencies?: string[];
  init?(kernel: FrameworkKernelForPlugins, capabilities: PluginCapabilityMap): Promise<void> | void;
  start?(kernel: FrameworkKernelForPlugins, capabilities: PluginCapabilityMap): Promise<void> | void;
  stop?(kernel: FrameworkKernelForPlugins, capabilities: PluginCapabilityMap): Promise<void> | void;
  healthCheck?(
    kernel: FrameworkKernelForPlugins,
    capabilities: PluginCapabilityMap,
  ): Promise<HealthCheckResult> | HealthCheckResult;
}

export interface PluginRegistration {
  plugin: FrameworkPlugin;
  enabled: boolean;
  loadedAt: string;
  startedAt?: string;
  stoppedAt?: string;
}

export interface ServiceDefinition<T = unknown> {
  name: string;
  kind: ServiceKind;
  version: string;
  start?: () => Promise<T> | T;
  stop?: () => Promise<void> | void;
  health?: () => Promise<HealthCheckResult> | HealthCheckResult;
  metadata?: Record<string, unknown>;
}

export interface FrameworkKernelOptions {
  config: FrameworkConfig;
  logger?: Logger;
  metrics?: MetricsClient;
  events?: EventBus;
  health?: HealthRegistry;
  flags?: FeatureFlagService;
  rateLimiter?: RateLimiter;
  breakers?: BreakerRegistry;
  context?: RequestContextStore;
}

export interface KernelState {
  started: boolean;
  bootedAt?: string;
  startedAt?: string;
  stoppedAt?: string;
  plugins: PluginRegistration[];
}

export interface HttpLikeRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  body?: unknown;
}

export interface HttpLikeResponse {
  status(code: number): HttpLikeResponse;
  json(value: unknown): void;
  setHeader(name: string, value: string): void;
}

export interface FrameworkReport {
  config: FrameworkConfig;
  state: KernelState;
  health: HealthCheckResult[];
  healthSummary: { status: HealthStatus; healthy: number; degraded: number; unhealthy: number; checks: number };
  features: Record<string, boolean>;
  services: Array<{ name: string; kind: ServiceKind; version: string; metadata?: Record<string, unknown> }>;
  metrics: MetricPoint[];
  breakers: Record<string, { state: string; failures: number; successCount: number; nextAttemptAt?: number }>;
  generatedAt: string;
}

export interface ApiEnvelope<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    id?: string;
    code: string;
    category: ErrorCategory;
    message: string;
    retryable: boolean;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId?: string;
    traceId?: string;
    spanId?: string;
    generatedAt: string;
  };
}

export interface FrameworkArtifactStore {
  writeJson(name: string, value: unknown): Promise<string>;
  readJson<T = unknown>(name: string): Promise<T | null>;
  writeText(name: string, text: string): Promise<string>;
  readText(name: string): Promise<string | null>;
  list(prefix?: string): Promise<string[]>;
}

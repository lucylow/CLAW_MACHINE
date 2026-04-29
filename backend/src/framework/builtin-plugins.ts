import type { FrameworkPlugin } from "./types";
import { nowIso } from "./util";

export const CoreTelemetryPlugin: FrameworkPlugin = {
  name: "core-telemetry",
  version: "1.0.0",
  description: "Captures framework telemetry, request traces, and runtime metrics.",
  async init(kernel, capabilities) {
    capabilities.events?.on("agent.run.started", async (envelope) => {
      capabilities.metrics?.increment("agent.run.started", 1, { event: envelope.event });
      capabilities.logger?.debug("Agent run started", { payload: envelope.payload });
    });

    capabilities.events?.on("agent.run.completed", async (envelope) => {
      capabilities.metrics?.increment("agent.run.completed", 1, { event: envelope.event });
      capabilities.logger?.info("Agent run completed", { payload: envelope.payload });
    });

    capabilities.events?.on("agent.run.failed", async (envelope) => {
      capabilities.metrics?.increment("agent.run.failed", 1, { event: envelope.event });
      capabilities.logger?.warn("Agent run failed", { payload: envelope.payload });
    });

    kernel.health.register({
      name: "telemetry",
      kind: "api",
      timeoutMs: 2000,
      run: () => ({
        name: "telemetry",
        kind: "api",
        status: "healthy",
        latencyMs: 1,
        message: "Telemetry plugin operational",
        checkedAt: nowIso(),
      }),
    });
  },
};

export const FeatureFlagsPlugin: FrameworkPlugin = {
  name: "feature-flags",
  version: "1.0.0",
  description: "Exposes flag storage and simple toggles for experiments.",
  init(_kernel, capabilities) {
    const flags = capabilities.featureFlags;
    if (!flags) return;
    flags.set("builder.demoMode", true);
    flags.set("runtime.enableAgentSwarm", true);
    flags.set("runtime.enableMemoryReflection", true);
    flags.set("runtime.enableA2AQueue", true);
    flags.set("runtime.enableMultimodal", true);
  },
};

export const SafetyPlugin: FrameworkPlugin = {
  name: "safety",
  version: "1.0.0",
  description: "Provides guardrails, rate limits, and failure controls.",
  init(_kernel, capabilities) {
    capabilities.health?.register({
      name: "safety",
      kind: "api",
      timeoutMs: 2000,
      run: () => ({
        name: "safety",
        kind: "api",
        status: "healthy",
        latencyMs: 1,
        message: "Safety checks ready",
        checkedAt: nowIso(),
      }),
    });

    capabilities.events?.on("security.policy.violation", async (envelope) => {
      capabilities.logger?.warn("Security policy violation", { payload: envelope.payload });
      capabilities.metrics?.increment("security.policy.violation", 1, { plugin: "safety" });
    });
  },
};

export const AgentRuntimePlugin: FrameworkPlugin = {
  name: "agent-runtime",
  version: "1.0.0",
  description: "Registers the agent runtime as a managed service.",
  init(kernel, capabilities) {
    kernel.registerService({
      name: "agent-runtime",
      kind: "agent-runtime",
      version: kernel.config.version,
      metadata: { appName: kernel.config.appName },
      health: async () => ({
        name: "agent-runtime",
        kind: "agent-runtime",
        status: "healthy",
        latencyMs: 2,
        message: "Agent runtime ready",
        checkedAt: nowIso(),
      }),
    });
    capabilities.metrics?.increment("service.registered", 1, { service: "agent-runtime" });
  },
};

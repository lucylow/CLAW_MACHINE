import type { FrameworkKernel } from "./kernel";
import type { FrameworkReport } from "./types";
import { nowIso } from "./util";

export async function buildFrameworkReport(kernel: FrameworkKernel): Promise<FrameworkReport> {
  const health = await kernel.healthReport();
  return {
    config: {
      ...kernel.config,
      security: {
        ...kernel.config.security,
        adminApiKeys: kernel.config.security.adminApiKeys.length > 0 ? ["[redacted]"] : [],
        sessionSecret: kernel.config.security.sessionSecret ? "[redacted]" : undefined,
      },
    },
    state: kernel.snapshot(),
    health,
    healthSummary: kernel.healthSummary(),
    features: kernel.flags.list(),
    services: kernel.services.list().map((service) => ({
      name: service.name,
      kind: service.kind,
      version: service.version,
      metadata: service.metadata,
    })),
    metrics: kernel.metrics.snapshot(),
    breakers: kernel.breakers.snapshot(),
    generatedAt: nowIso(),
  };
}

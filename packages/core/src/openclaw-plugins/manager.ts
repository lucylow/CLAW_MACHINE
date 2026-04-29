import { PluginDiscovery } from "./discovery.js";
import { PluginPolicyEngine } from "./policy.js";
import { PluginValidator, validatePluginManifest } from "./validate.js";
import { SnapshotCache } from "./snapshot.js";
import { detectConflicts, detectExclusiveSlotViolations } from "./conflicts.js";
import { selectSlots } from "./slots.js";
import type { PluginPolicy } from "./policy.js";
import type { DiscoveryRoots } from "./discovery.js";
import type { PluginRecord } from "./contracts.js";
import { attachSecurityDiagnostics, type SecurityPolicy } from "./security.js";
import { inferOpenClawSurfaceKind } from "./contracts.js";

const defaultSecurity: SecurityPolicy = {
  allowWorkspacePlugins: true,
  allowUnknownPlugins: true,
  requireSignedManifests: false,
};

/**
 * OpenClaw-aligned plugin control plane: discover → validate → policy → security → conflicts.
 * Distinct from hook-based {@link PluginManager} in `PluginManager.ts`.
 */
export class OpenClawPluginManager {
  private readonly snapshot = new SnapshotCache();
  private readonly validator = new PluginValidator();

  constructor(
    private readonly roots: DiscoveryRoots,
    private readonly policy: PluginPolicy,
    private readonly security: SecurityPolicy = defaultSecurity
  ) {}

  async refresh(): Promise<PluginRecord[]> {
    const discovery = new PluginDiscovery(this.roots);
    const discovered = await discovery.discover();
    let validated = discovered.map((r) => this.validator.attachValidation(r));
    validated = attachSecurityDiagnostics(validated, this.security);
    const afterPolicy = new PluginPolicyEngine(this.policy).apply(validated);

    const surfaceIssues = detectExclusiveSlotViolations(afterPolicy, this.policy.slots);
    const ownershipIssues = detectConflicts(afterPolicy);
    const allIssues = [...surfaceIssues, ...ownershipIssues];

    const final = allIssues.length
      ? afterPolicy.map((r) => ({
          ...r,
          diagnostics: [...r.diagnostics, ...allIssues],
          status: r.status === "enabled" ? ("blocked" as const) : r.status,
        }))
      : afterPolicy;

    this.snapshot.set(final);
    return final;
  }

  getSnapshot() {
    return this.snapshot.get();
  }

  getSlots() {
    const snap = this.snapshot.get();
    return selectSlots(snap?.records ?? [], this.policy.slots ?? {});
  }

  /**
   * Imperative enable path with Zod validation and memory-slot exclusivity (OpenClaw-style).
   */
  enablePlugin(
    pluginId: string,
    manifest: unknown,
    enabled: Map<string, { manifest: PluginRecord["manifest"]; config: Record<string, unknown> }>
  ): void {
    const validation = validatePluginManifest(manifest);
    if (!validation.success) {
      throw new Error(`Invalid manifest for ${pluginId}: ${validation.error.message}`);
    }
    const m = manifest as PluginRecord["manifest"];
    if (m.kind === "native" && inferOpenClawSurfaceKind(m) === "memory") {
      for (const [, v] of enabled) {
        const other = v.manifest;
        if (other.kind === "native" && inferOpenClawSurfaceKind(other) === "memory") {
          throw new Error("Memory slot is already occupied by another provider.");
        }
      }
    }
    enabled.set(pluginId, { manifest: m, config: {} });
  }
}

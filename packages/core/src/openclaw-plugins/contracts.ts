export type PluginKind = "native" | "bundle";

export type PluginStatus = "enabled" | "disabled" | "blocked" | "missing" | "invalid";

export type PluginShape =
  | "plain-capability"
  | "hybrid-capability"
  | "hook-only"
  | "non-capability";

/** OpenClaw exclusive-slot surfaces (memory, tool family, channel family). */
export type OpenClawSurfaceKind = "memory" | "tool" | "channel";

export interface PluginManifest {
  id: string;
  name: string;
  version?: string;
  kind: PluginKind;
  entry?: string;
  manifestPath: string;
  enabledByDefault?: boolean;
  capabilities?: string[];
  hooks?: string[];
  commands?: string[];
  tools?: string[];
  routes?: string[];
  configSchema?: unknown;
  channelSchema?: unknown;
  workspaceOrigin?: boolean;
  /** When set, participates in exclusive-slot checks (e.g. memory). */
  surfaceKind?: OpenClawSurfaceKind;
  /** Optional detached signature blob for security policies. */
  signature?: string;
}

export interface PluginRecord {
  manifest: PluginManifest;
  status: PluginStatus;
  shape: PluginShape;
  diagnostics: string[];
  owners: {
    capabilities: string[];
    tools: string[];
    commands: string[];
    channels: string[];
    services: string[];
  };
}

export function inferOpenClawSurfaceKind(manifest: PluginManifest): OpenClawSurfaceKind | undefined {
  if (manifest.surfaceKind) return manifest.surfaceKind;
  const caps = (manifest.capabilities ?? []).map((c) => c.toLowerCase());
  if (caps.some((c) => c === "memory" || c.endsWith("/memory"))) return "memory";
  if (caps.some((c) => c.includes("channel"))) return "channel";
  if ((manifest.tools?.length ?? 0) > 0 || caps.some((c) => c === "tool")) return "tool";
  return undefined;
}

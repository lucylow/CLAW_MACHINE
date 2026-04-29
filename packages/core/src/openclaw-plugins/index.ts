export type {
  PluginKind,
  PluginStatus,
  PluginShape,
  OpenClawSurfaceKind,
  PluginManifest,
  PluginRecord,
} from "./contracts.js";
export { inferOpenClawSurfaceKind } from "./contracts.js";

export type { DiscoveryRoots } from "./discovery.js";
export { PluginDiscovery } from "./discovery.js";

export type { PluginPolicy } from "./policy.js";
export { PluginPolicyEngine } from "./policy.js";

export type { ValidationResult } from "./validate.js";
export {
  PluginValidator,
  OpenClawPluginManifestSchema,
  validatePluginManifest,
} from "./validate.js";

export type { RegistrationMode, PluginApi, PluginEntry } from "./runtime.js";
export { PluginRuntime } from "./runtime.js";

export type { CapabilityRegistry } from "./capabilities.js";
export {
  createCapabilityRegistry,
  CapabilityRegistrar,
  createPluginApiFromRegistry,
} from "./capabilities.js";

export type { LoadedPlugin } from "./native-loader.js";
export { NativePluginLoader } from "./native-loader.js";

export { BundleAdapter } from "./bundles.js";

export { detectConflicts, detectExclusiveSlotViolations } from "./conflicts.js";

export type { PluginSnapshot } from "./snapshot.js";
export { SnapshotCache } from "./snapshot.js";

export type { SecurityPolicy } from "./security.js";
export { securityCheck, attachSecurityDiagnostics } from "./security.js";

export type { SlotConfig } from "./slots.js";
export { selectSlots } from "./slots.js";

export { OpenClawPluginManager } from "./manager.js";

export type { OpenClawMemory, ClawMachineMemoryConfig } from "./memory-provider.js";
export { ClawMachineMemory } from "./memory-provider.js";

export { createMemoryPluginEntry } from "./memory-plugin.js";

export { registerPluginCommands } from "./cli.js";

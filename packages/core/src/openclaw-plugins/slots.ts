import type { PluginRecord } from "./contracts.js";

export interface SlotConfig {
  memory?: string;
  contextEngine?: string;
}

export function selectSlots(records: PluginRecord[], slots: SlotConfig) {
  const memory = slots.memory ? records.find((r) => r.manifest.id === slots.memory) : undefined;
  const contextEngine = slots.contextEngine
    ? records.find((r) => r.manifest.id === slots.contextEngine)
    : undefined;

  return {
    memory,
    contextEngine,
  };
}

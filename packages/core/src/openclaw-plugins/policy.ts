import type { PluginRecord, PluginStatus } from "./contracts.js";

export interface PluginPolicy {
  enabled: boolean;
  allow: string[];
  deny: string[];
  slots: {
    memory?: string;
    contextEngine?: string;
  };
}

export class PluginPolicyEngine {
  constructor(private readonly policy: PluginPolicy) {}

  apply(records: PluginRecord[]): PluginRecord[] {
    return records.map((record) => {
      if (record.status === "invalid" || record.status === "blocked") {
        return record;
      }
      const id = record.manifest.id;
      if (!this.policy.enabled) {
        return { ...record, status: "disabled" as PluginStatus };
      }
      if (this.policy.deny.includes(id)) {
        return {
          ...record,
          status: "blocked" as PluginStatus,
          diagnostics: [...record.diagnostics, "Denied by policy"],
        };
      }
      if (
        this.policy.allow.length > 0 &&
        !this.policy.allow.includes(id) &&
        !record.manifest.enabledByDefault
      ) {
        return { ...record, status: "disabled" as PluginStatus };
      }
      if (this.policy.slots.memory && this.policy.slots.memory === id) {
        return { ...record, status: "enabled" as PluginStatus };
      }
      if (this.policy.slots.contextEngine && this.policy.slots.contextEngine === id) {
        return { ...record, status: "enabled" as PluginStatus };
      }
      if (record.manifest.enabledByDefault) {
        return { ...record, status: "enabled" as PluginStatus };
      }
      if (this.policy.allow.includes(id)) {
        return { ...record, status: "enabled" as PluginStatus };
      }
      return { ...record, status: "disabled" as PluginStatus };
    });
  }
}

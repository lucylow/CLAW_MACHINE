import { inferOpenClawSurfaceKind, type PluginRecord } from "./contracts.js";

export function detectConflicts(records: PluginRecord[]): string[] {
  const tools = new Map<string, string>();
  const channels = new Map<string, string>();
  const commands = new Map<string, string>();
  const errors: string[] = [];

  for (const r of records) {
    if (r.status !== "enabled") continue;
    for (const tool of r.owners.tools) {
      if (tools.has(tool))
        errors.push(`tool conflict: ${tool} owned by ${tools.get(tool)} and ${r.manifest.id}`);
      else tools.set(tool, r.manifest.id);
    }
    for (const channel of r.owners.channels) {
      if (channels.has(channel))
        errors.push(
          `channel conflict: ${channel} owned by ${channels.get(channel)} and ${r.manifest.id}`
        );
      else channels.set(channel, r.manifest.id);
    }
    for (const command of r.owners.commands) {
      if (commands.has(command))
        errors.push(
          `command conflict: ${command} owned by ${commands.get(command)} and ${r.manifest.id}`
        );
      else commands.set(command, r.manifest.id);
    }
  }

  return errors;
}

/** Enforces one active memory provider and slot id alignment (OpenClaw-style). */
export function detectExclusiveSlotViolations(
  records: PluginRecord[],
  slots?: { memory?: string; contextEngine?: string }
): string[] {
  const errors: string[] = [];
  const memoryEnabled = records.filter(
    (r) => r.status === "enabled" && inferOpenClawSurfaceKind(r.manifest) === "memory"
  );

  if (slots?.memory) {
    for (const r of memoryEnabled) {
      if (r.manifest.id !== slots.memory) {
        errors.push(
          `memory slot is reserved for "${slots.memory}" but "${r.manifest.id}" is also enabled for memory`
        );
      }
    }
  } else if (memoryEnabled.length > 1) {
    errors.push(
      `multiple memory providers enabled: ${memoryEnabled.map((r) => r.manifest.id).join(", ")}; set plugins.slots.memory`
    );
  }

  if (slots?.contextEngine) {
    const ctxClaim = records.filter(
      (r) =>
        r.status === "enabled" &&
        (r.manifest.capabilities ?? []).some((c) => c.toLowerCase() === "context-engine")
    );
    for (const r of ctxClaim) {
      if (r.manifest.id !== slots.contextEngine) {
        errors.push(
          `contextEngine slot is "${slots.contextEngine}" but "${r.manifest.id}" also registers context-engine`
        );
      }
    }
  }

  return errors;
}

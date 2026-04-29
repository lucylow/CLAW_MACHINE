import type { PluginApi, PluginEntry } from "./runtime.js";
import { ClawMachineMemory, type ClawMachineMemoryConfig } from "./memory-provider.js";

/** Plugin entry: register exclusive memory provider + optional reflect tool. */
export function createMemoryPluginEntry(
  id: string,
  name: string,
  config: ClawMachineMemoryConfig = {}
): PluginEntry {
  return {
    id,
    name,
    async register(api: PluginApi) {
      const merged = { ...(api.config as ClawMachineMemoryConfig | undefined), ...config };
      const provider = new ClawMachineMemory(merged);
      api.registerProvider({
        id,
        kind: "memory",
        surfaceKind: "memory",
        provider,
      });

      if (api.registrationMode === "full") {
        api.registerTool({
          name: "reflect",
          description: "Trigger reflection on the 0G-backed memory loop",
          run: async (args: unknown) => {
            const outcome =
              typeof args === "object" && args !== null && "outcome" in args
                ? (args as { outcome?: string }).outcome === "failure"
                  ? "failure"
                  : "success"
                : "success";
            await provider.reflect(outcome, [args]);
            return { ok: true };
          },
        });
      }
    },
  };
}

import { Command } from "commander";
import type { PluginRecord } from "./contracts.js";

export function registerPluginCommands(
  program: Command,
  getRecords: () => Promise<PluginRecord[]>
): void {
  const plugins = program.command("plugins").description("OpenClaw plugin inventory");
  plugins
    .command("list")
    .description("List discovered plugins")
    .action(async () => {
      const records = await getRecords();
      console.table(
        records.map((r) => ({
          id: r.manifest.id,
          name: r.manifest.name,
          status: r.status,
          shape: r.shape,
          kind: r.manifest.kind,
        }))
      );
    });

  plugins
    .command("inspect")
    .description("Inspect a plugin")
    .argument("<id>", "plugin id")
    .action(async (id: string) => {
      const records = await getRecords();
      const record = records.find((r) => r.manifest.id === id);
      if (!record) throw new Error(`plugin not found: ${id}`);
      console.log(JSON.stringify(record, null, 2));
    });
}

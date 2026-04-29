import fs from "node:fs";
import path from "node:path";
import type { PluginManifest } from "./contracts.js";

export class BundleAdapter {
  readBundle(root: string): PluginManifest[] {
    const results: PluginManifest[] = [];
    const bundleFiles = [
      path.join(root, ".codex-plugin", "plugin.json"),
      path.join(root, ".claude-plugin", "plugin.json"),
      path.join(root, ".cursor-plugin", "plugin.json"),
    ];

    for (const file of bundleFiles) {
      if (!fs.existsSync(file)) continue;
      const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
      const id = typeof raw.id === "string" ? raw.id : path.basename(root);
      const name = typeof raw.name === "string" ? raw.name : path.basename(root);
      results.push({
        id,
        name,
        kind: "bundle",
        manifestPath: file,
        enabledByDefault: typeof raw.enabledByDefault === "boolean" ? raw.enabledByDefault : false,
        capabilities: Array.isArray(raw.capabilities) ? (raw.capabilities as string[]) : [],
        hooks: Array.isArray(raw.hooks) ? (raw.hooks as string[]) : [],
        tools: Array.isArray(raw.tools) ? (raw.tools as string[]) : [],
        commands: Array.isArray(raw.commands) ? (raw.commands as string[]) : [],
        routes: Array.isArray(raw.routes) ? (raw.routes as string[]) : [],
      });
    }

    return results;
  }
}

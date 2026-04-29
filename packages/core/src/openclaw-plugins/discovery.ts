import fs from "node:fs";
import path from "node:path";
import type { PluginManifest, PluginRecord } from "./contracts.js";
import { BundleAdapter } from "./bundles.js";

export interface DiscoveryRoots {
  configPaths: string[];
  workspaceRoots: string[];
  globalRoots: string[];
  bundledRoots: string[];
}

export class PluginDiscovery {
  private readonly bundles = new BundleAdapter();

  constructor(private readonly roots: DiscoveryRoots) {}

  async discover(): Promise<PluginRecord[]> {
    const manifests: PluginManifest[] = [];
    manifests.push(...(await this.scanRoots(this.roots.configPaths, false)));
    manifests.push(...(await this.scanRoots(this.roots.workspaceRoots, true)));
    manifests.push(...(await this.scanRoots(this.roots.globalRoots, false)));
    manifests.push(...(await this.scanRoots(this.roots.bundledRoots, false)));
    return this.normalize(manifests);
  }

  private async scanRoots(roots: string[], workspaceOrigin: boolean): Promise<PluginManifest[]> {
    const out: PluginManifest[] = [];
    for (const root of roots) {
      if (!fs.existsSync(root)) continue;
      const stat = fs.statSync(root);
      if (stat.isDirectory()) {
        const pluginFile = path.join(root, "openclaw.plugin.json");
        if (fs.existsSync(pluginFile)) {
          const manifest = JSON.parse(fs.readFileSync(pluginFile, "utf8")) as PluginManifest;
          out.push({ ...manifest, manifestPath: pluginFile, workspaceOrigin });
        }
        if (workspaceOrigin) {
          for (const bundle of this.bundles.readBundle(root)) {
            out.push({ ...bundle, workspaceOrigin: true });
          }
        }
      } else if (root.endsWith(".json")) {
        const manifest = JSON.parse(fs.readFileSync(root, "utf8")) as PluginManifest;
        out.push({ ...manifest, manifestPath: root, workspaceOrigin });
      }
    }
    return out;
  }

  private normalize(manifests: PluginManifest[]): PluginRecord[] {
    const seen = new Map<string, PluginRecord>();

    for (const manifest of manifests) {
      if (seen.has(manifest.id)) continue;

      const capabilities = manifest.capabilities ?? [];
      const hooks = manifest.hooks ?? [];
      const tools = manifest.tools ?? [];
      const commands = manifest.commands ?? [];

      const shape: PluginRecord["shape"] =
        capabilities.length === 1 && hooks.length === 0 && tools.length === 0 && commands.length === 0
          ? "plain-capability"
          : capabilities.length > 1
            ? "hybrid-capability"
            : hooks.length > 0 && capabilities.length === 0 && tools.length === 0 && commands.length === 0
              ? "hook-only"
              : "non-capability";

      const routes = manifest.routes ?? [];

      seen.set(manifest.id, {
        manifest,
        status: "disabled",
        shape,
        diagnostics: [],
        owners: {
          capabilities,
          tools,
          commands,
          channels: routes,
          services: [],
        },
      });
    }

    return [...seen.values()];
  }
}

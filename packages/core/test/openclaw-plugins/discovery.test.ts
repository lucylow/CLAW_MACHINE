import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { PluginDiscovery } from "../../src/openclaw-plugins/discovery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("plugin discovery", () => {
  it("loads plugin manifests from configured roots", async () => {
    const discovery = new PluginDiscovery({
      configPaths: [],
      workspaceRoots: [],
      globalRoots: [],
      bundledRoots: [],
    });

    const records = await discovery.discover();
    expect(records).toEqual([]);
  });

  it("discovers openclaw.plugin.json under a workspace root", async () => {
    const root = path.join(__dirname, "../fixtures/workspace-a");
    const discovery = new PluginDiscovery({
      configPaths: [],
      workspaceRoots: [root],
      globalRoots: [],
      bundledRoots: [],
    });
    const records = await discovery.discover();
    expect(records).toHaveLength(1);
    expect(records[0].manifest.id).toBe("fixture-a");
    expect(records[0].manifest.manifestPath).toContain("openclaw.plugin.json");
  });
});

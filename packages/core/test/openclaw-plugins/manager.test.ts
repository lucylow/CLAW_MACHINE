import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { OpenClawPluginManager } from "../../src/openclaw-plugins/manager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("OpenClawPluginManager", () => {
  it("marks invalid manifests and blocks refresh when policy enables bad native", async () => {
    const root = path.join(__dirname, "../fixtures/bad-native");
    const mgr = new OpenClawPluginManager(
      {
        configPaths: [],
        workspaceRoots: [root],
        globalRoots: [],
        bundledRoots: [],
      },
      { enabled: true, allow: [], deny: [], slots: {} }
    );
    const records = await mgr.refresh();
    expect(records[0].status).toBe("invalid");
  });
});

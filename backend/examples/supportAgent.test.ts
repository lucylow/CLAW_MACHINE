/**
 * Integration-style test for the support agent demo flow.
 * Validates the 3-turn lifecycle, failure handling, reflection, and recovery.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("supportAgent demo", () => {
  it("runs without crashing and outputs valid JSON stats", () => {
    const agentPath = path.resolve(__dirname, "supportAgent.ts");
    let stdout = "";
    try {
      stdout = execSync(`npx tsx "${agentPath}"`, { timeout: 15_000 }).toString();
    } catch (err: any) {
      throw new Error(`supportAgent crashed: ${err.stderr?.toString() ?? err.message}`);
    }

    // Find the final JSON block (last {...} in output)
    const match = stdout.match(/(\{[\s\S]*\})\s*$/);
    expect(match, "No JSON output found").toBeTruthy();

    const stats = JSON.parse(match![1]);
    expect(stats.summary.totalTurns).toBe(3);
    expect(stats.summary.failures).toBe(1);
    expect(stats.summary.reflectionsGenerated).toBe(1);
    expect(stats.summary.lessonsApplied).toBe(1);
    expect(stats.summary.totalMemoryItems).toBeGreaterThan(0);
    expect(stats.reflectionSample).not.toBeNull();
    expect(stats.reflectionSample.severity).toBe("high");
  });
});

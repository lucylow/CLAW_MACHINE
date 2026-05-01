/**
 * Tests for MarketAgent pricing logic.
 */
import { describe, it, expect } from "vitest";
import { execSync } from "child_process";
import path from "path";

describe("marketAgent", () => {
  it("runs without crashing and produces a valid listing", () => {
    const agentPath = path.resolve(__dirname, "marketAgent.ts");
    let stdout = "";
    try {
      stdout = execSync(`npx tsx "${agentPath}"`, { timeout: 15_000 }).toString();
    } catch (err: any) {
      throw new Error(`marketAgent crashed: ${err.stderr?.toString() ?? err.message}`);
    }
    const match = stdout.match(/(\{[\s\S]*\})\s*$/);
    expect(match, "No JSON output found").toBeTruthy();
    const result = JSON.parse(match![1]);
    expect(result.listing.price0G).toBeGreaterThan(0);
    expect(result.listing.priceLow0G).toBeLessThan(result.listing.price0G);
    expect(result.listing.priceHigh0G).toBeGreaterThan(result.listing.price0G);
    expect(result.listing.capabilities).toBeInstanceOf(Array);
    expect(result.listing.capabilities.length).toBeGreaterThan(0);
    expect(result.pricing.factors.reliabilityScore).toBeGreaterThan(0);
    expect(result.stats.successes).toBe(1);
    expect(result.stats.toolCalls).toBeGreaterThanOrEqual(3);
  });
});

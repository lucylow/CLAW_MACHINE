/**
 * CLAW MACHINE — Market Agent Demo
 *
 * Demonstrates: agent capability scoring, comparable pricing, confidence
 * intervals, multi-factor listing composition, and on-chain publish stub.
 *
 * Run: npx tsx backend/examples/marketAgent.ts
 */

import { BaseAgent, AgentTurn } from "./baseAgent";

// ── Types ─────────────────────────────────────────────────────────────────────

interface AgentCapabilityProfile {
  name: string;
  version: string;
  skills: string[];
  reflectionCount: number;
  successRate: number;    // 0–1
  avgResponseMs: number;
  memoryDepth: number;    // number of stored episodes
  onChainPublished: boolean;
}

interface MarketComparable {
  name: string;
  price0G: number;
  successRate: number;
  skills: number;
  reflections: number;
}

interface PricingResult {
  basePrice: number;
  adjustedPrice: number;
  confidenceLow: number;
  confidenceHigh: number;
  factors: Record<string, number>;
  rationale: string;
}

interface ListingDraft {
  title: string;
  description: string;
  price0G: number;
  priceLow0G: number;
  priceHigh0G: number;
  tags: string[];
  capabilities: string[];
  onChainTxStub: string;
}

// ── Tool implementations ──────────────────────────────────────────────────────

function fetchMarketComps(segment: string): MarketComparable[] {
  // In production: queries 0G Storage index of published agents
  const comps: MarketComparable[] = [
    { name: "SupportAgentV2",   price0G: 15.0, successRate: 0.88, skills: 4, reflections: 12 },
    { name: "OpsAgentV1",       price0G: 22.0, successRate: 0.91, skills: 6, reflections: 20 },
    { name: "ResearchAgentV3",  price0G: 18.5, successRate: 0.85, skills: 5, reflections: 8  },
    { name: "PlannerAgentV1",   price0G: 12.0, successRate: 0.79, skills: 3, reflections: 5  },
    { name: "CoordAgentV2",     price0G: 28.0, successRate: 0.93, skills: 8, reflections: 30 },
  ];
  console.log(`  [tool] fetchMarketComps(${segment}) → ${comps.length} comparables`);
  return comps;
}

function scoreCapabilities(profile: AgentCapabilityProfile): Record<string, number> {
  const skillScore       = Math.min(profile.skills.length / 10, 1.0);         // 0–1
  const reliabilityScore = profile.successRate;                                 // 0–1
  const memoryScore      = Math.min(profile.memoryDepth / 50, 1.0);           // 0–1
  const reflectionScore  = Math.min(profile.reflectionCount / 30, 1.0);       // 0–1
  const speedScore       = Math.max(0, 1 - profile.avgResponseMs / 5000);     // 0–1 (lower latency = higher)
  const onChainBonus     = profile.onChainPublished ? 0.05 : 0;

  return { skillScore, reliabilityScore, memoryScore, reflectionScore, speedScore, onChainBonus };
}

function computePrice(
  profile: AgentCapabilityProfile,
  comps: MarketComparable[],
  strategy: "conservative" | "market" | "premium",
): PricingResult {
  const factors = scoreCapabilities(profile);

  // Weighted composite score
  const composite =
    factors.skillScore       * 0.30 +
    factors.reliabilityScore * 0.30 +
    factors.memoryScore      * 0.15 +
    factors.reflectionScore  * 0.15 +
    factors.speedScore       * 0.05 +
    factors.onChainBonus     * 0.05;

  // Market anchor: median comparable price
  const sortedPrices = comps.map((c) => c.price0G).sort((a, b) => a - b);
  const medianPrice = sortedPrices[Math.floor(sortedPrices.length / 2)];

  // Base price from composite × market anchor
  const basePrice = medianPrice * composite * 1.8;

  // Strategy multiplier
  const multiplier = strategy === "conservative" ? 0.85 : strategy === "premium" ? 1.20 : 1.0;
  const adjustedPrice = Math.round(basePrice * multiplier * 10) / 10;

  // Confidence interval (±15% for conservative, ±25% for premium)
  const spread = strategy === "conservative" ? 0.15 : strategy === "premium" ? 0.25 : 0.20;
  const confidenceLow  = Math.round(adjustedPrice * (1 - spread) * 10) / 10;
  const confidenceHigh = Math.round(adjustedPrice * (1 + spread) * 10) / 10;

  const rationale = [
    `Composite score: ${(composite * 100).toFixed(1)}%`,
    `Market median: ${medianPrice} 0G`,
    `Strategy: ${strategy} (×${multiplier})`,
    `Skills: ${profile.skills.length}, Reliability: ${(profile.successRate * 100).toFixed(0)}%`,
    `Reflections: ${profile.reflectionCount}, Memory depth: ${profile.memoryDepth}`,
  ].join(". ");

  return { basePrice, adjustedPrice, confidenceLow, confidenceHigh, factors, rationale };
}

function composeListing(profile: AgentCapabilityProfile, pricing: PricingResult): ListingDraft {
  const tags = [
    ...profile.skills.map((s) => s.toLowerCase().replace(/\s+/g, "-")),
    profile.onChainPublished ? "on-chain-verified" : "off-chain",
    `v${profile.version}`,
  ];

  return {
    title: `${profile.name} v${profile.version}`,
    description:
      `Autonomous agent with ${profile.skills.length} skills, ` +
      `${(profile.successRate * 100).toFixed(0)}% success rate, ` +
      `${profile.reflectionCount} reflections, and ${profile.memoryDepth} stored episodes. ` +
      `Average response time: ${profile.avgResponseMs}ms.`,
    price0G: pricing.adjustedPrice,
    priceLow0G: pricing.confidenceLow,
    priceHigh0G: pricing.confidenceHigh,
    tags,
    capabilities: profile.skills,
    // In production: calls SkillRegistry.sol publishSkill() on 0G Chain
    onChainTxStub: `0x${Math.random().toString(16).slice(2, 66).padEnd(64, "0")}`,
  };
}

// ── Agent ─────────────────────────────────────────────────────────────────────

class MarketAgent extends BaseAgent {
  constructor() { super("marketAgent"); }

  async run() {
    const convo: AgentTurn[] = [
      { role: "user",      content: "Analyze whether to list an agent for sale.", timestamp: new Date().toISOString() },
      { role: "assistant", content: "I will review capability profile, market comparables, and price elasticity.", timestamp: new Date().toISOString() },
      { role: "user",      content: "Use a conservative pricing model.", timestamp: new Date().toISOString() },
    ];
    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan("price and list an agent in the marketplace");

    // Agent profile (in production: loaded from 0G Storage KV)
    const profile: AgentCapabilityProfile = {
      name: "SupportAgent",
      version: "3.1.0",
      skills: ["policyLookup", "refundProcessor", "toneAdapter", "escalationRouter"],
      reflectionCount: 14,
      successRate: 0.91,
      avgResponseMs: 820,
      memoryDepth: 38,
      onChainPublished: false,
    };

    // Fetch comparables
    const comps = this.toolCall(
      "marketComps",
      { segment: "support agents" },
      fetchMarketComps("support agents"),
    ).output as MarketComparable[];

    // Score and price
    const pricing = computePrice(profile, comps, "conservative");
    this.toolCall("priceModel", { strategy: "conservative", composite: pricing.factors }, pricing);
    console.log(`  [price] ${pricing.adjustedPrice} 0G  [${pricing.confidenceLow}–${pricing.confidenceHigh}]`);
    console.log(`  [rationale] ${pricing.rationale}`);

    // Compose listing
    const listing = composeListing(profile, pricing);
    this.toolCall("listingComposer", { fields: ["capabilities", "level", "reflections"] }, listing);
    console.log(`  [listing] "${listing.title}" — ${listing.price0G} 0G`);
    console.log(`  [tags] ${listing.tags.join(", ")}`);

    this.success();

    return { plan, profile, pricing, listing, stats: this.finalize() };
  }
}

void (async () => {
  const agent = new MarketAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

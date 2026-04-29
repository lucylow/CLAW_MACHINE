import type { EvolutionScore, SkillDefinitionLike, SkillTestResult } from "./types.js";

export interface ScoreInput {
  skill: SkillDefinitionLike;
  tests: SkillTestResult[];
  source: string;
  repairedRounds: number;
  diagnostics?: string[];
  policyWarnings?: string[];
}

export function scoreCandidate(input: ScoreInput): EvolutionScore {
  const passWeight = input.tests.reduce((sum, t) => sum + (t.passed ? 1 : 0), 0);
  const passRate = input.tests.length ? passWeight / input.tests.length : 0;

  const averageTestScore = input.tests.length ? input.tests.reduce((sum, t) => sum + t.score, 0) / input.tests.length : 0;

  const handleQuality = input.tests.length
    ? clamp(
        input.tests
          .map((t) => {
            if (t.handleScore === undefined) return 0.5;
            if (t.passed) return Math.min(1, t.handleScore);
            return Math.max(0, t.handleScore);
          })
          .reduce((a, b) => a + b, 0) / input.tests.length,
        0,
        1
      )
    : 0.5;

  const safetyQuality = computeSafetyQuality(input.source, input.policyWarnings ?? []);
  const codeQuality = computeCodeQuality(input.source, input.diagnostics ?? []);
  const repairQuality = computeRepairQuality(input.repairedRounds, input.tests);
  const performanceQuality = computePerformanceQuality(input.tests);

  const total =
    0.28 * passRate +
    0.16 * averageTestScore +
    0.14 * handleQuality +
    0.12 * safetyQuality +
    0.12 * codeQuality +
    0.09 * repairQuality +
    0.09 * performanceQuality;

  const note =
    passRate >= 1 ? "All tests passed." : passRate >= 0.67 ? "Most tests passed; candidate is close." : "Candidate needs more repair work.";

  return {
    total: clamp(total, 0, 1),
    testPassRate: clamp(passRate, 0, 1),
    averageTestScore: clamp(averageTestScore, 0, 1),
    handleQuality,
    safetyQuality,
    codeQuality,
    repairQuality,
    performanceQuality,
    note,
  };
}

function computeSafetyQuality(source: string, warnings: string[]): number {
  const lowRisk = ["require(", "process.", "child_process", "fs.", "net.", "http.", "https.", "eval(", "new Function"];
  let penalty = 0;
  for (const needle of lowRisk) {
    if (source.includes(needle)) penalty += 0.2;
  }
  penalty += Math.min(0.3, warnings.length * 0.05);
  return clamp(1 - penalty, 0, 1);
}

function computeCodeQuality(source: string, diagnostics: string[]): number {
  let score = 0.6;
  if (/export\s+(default\s+)?(const|function)\s+skill/.test(source)) score += 0.12;
  if (/canHandle\s*\(/.test(source)) score += 0.08;
  if (/run\s*\(/.test(source)) score += 0.08;
  if (/tags\s*:\s*\[/.test(source)) score += 0.04;
  if (diagnostics.length) score -= Math.min(0.3, diagnostics.length * 0.05);
  if (source.length > 8000) score -= 0.1;
  return clamp(score, 0, 1);
}

function computeRepairQuality(repairedRounds: number, tests: SkillTestResult[]): number {
  if (!repairedRounds) return 0.45 + Math.min(0.25, tests.filter((t) => t.passed).length * 0.05);
  return clamp(0.5 + 0.12 * repairedRounds + 0.08 * tests.filter((t) => t.passed).length, 0, 1);
}

function computePerformanceQuality(tests: SkillTestResult[]): number {
  if (!tests.length) return 0.5;
  const avgMs = tests.reduce((sum, t) => sum + t.durationMs, 0) / tests.length;
  if (avgMs < 10) return 1;
  if (avgMs < 50) return 0.92;
  if (avgMs < 150) return 0.8;
  if (avgMs < 400) return 0.65;
  return 0.45;
}

function clamp(n: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * CLAW MACHINE — Ops Agent Demo
 * Demonstrates: incident triage, failure detection, reflection, rollback recovery.
 * Run: npx tsx backend/examples/opsAgent.ts
 */
import { BaseAgent, AgentTurn } from "./baseAgent";

interface IncidentReport {
  id: string;
  service: string;
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: string;
  symptoms: string[];
}

interface RollbackResult {
  success: boolean;
  targetVersion: string;
  durationMs: number;
  error?: string;
}

class OpsAgent extends BaseAgent {
  private incident: IncidentReport | null = null;
  private rollbackAttempts = 0;

  constructor() { super("opsAgent"); }

  private detectIncident(): IncidentReport {
    return {
      id: `inc-${Date.now()}`,
      service: "payment-service",
      severity: "high",
      detectedAt: new Date().toISOString(),
      symptoms: ["error rate > 15%", "p99 latency > 8s", "health check failing"],
    };
  }

  private async attemptRollback(targetVersion: string, simulateFail: boolean): Promise<RollbackResult> {
    const t0 = Date.now();
    await new Promise((r) => setTimeout(r, 80));
    if (simulateFail) return { success: false, targetVersion, durationMs: Date.now() - t0, error: "rollback_lock_timeout: deployment lock held by another process" };
    return { success: true, targetVersion, durationMs: Date.now() - t0 };
  }

  async run() {
    const convo: AgentTurn[] = [
      { role: "user", content: "Investigate the failed deployment and suggest a rollback.", timestamp: new Date().toISOString() },
      { role: "assistant", content: "Inspecting logs, comparing checkpoints, and preparing rollback plan.", timestamp: new Date().toISOString() },
      { role: "user", content: "Provide a full incident summary.", timestamp: new Date().toISOString() },
    ];
    convo.forEach((t) => this.recordTurn(t));

    const plan = this.plan("triage deployment incident and execute rollback");
    this.toolCall("logReader", { source: "deployment-logs", window: "15m" });
    this.toolCall("checkpointDiff", { between: ["v2.4.1-good", "v2.4.2-bad"] });

    // Detect incident
    this.incident = this.detectIncident();
    this.emit("incident.detected", this.incident);
    console.log(`[opsAgent] Incident detected: ${this.incident.id} severity=${this.incident.severity}`);
    console.log(`[opsAgent] Symptoms: ${this.incident.symptoms.join(", ")}`);

    // First rollback attempt — simulated failure
    this.rollbackAttempts++;
    const firstAttempt = await this.attemptRollback("v2.4.1", true);
    if (!firstAttempt.success) {
      this.failure();
      console.log(`[opsAgent] Rollback attempt 1 FAILED: ${firstAttempt.error}`);
      this.emit("reflection.needed", { error: firstAttempt.error, task: "rollback" });
      console.log(`[opsAgent] Reflection: deployment lock must be released before rollback. Waiting 2s.`);
      await new Promise((r) => setTimeout(r, 200)); // shortened for demo
    }

    // Second rollback attempt — recovery
    this.rollbackAttempts++;
    const secondAttempt = await this.attemptRollback("v2.4.1", false);
    if (secondAttempt.success) {
      this.success();
      console.log(`[opsAgent] Rollback attempt 2 SUCCEEDED in ${secondAttempt.durationMs}ms`);
    }

    return {
      plan,
      incident: this.incident,
      rollbackAttempts: this.rollbackAttempts,
      rollbackSuccess: secondAttempt.success,
      incidentSummary: "Detected config drift in v2.4.2. Rollback to v2.4.1 succeeded after releasing deployment lock.",
      stats: this.finalize(),
    };
  }
}

void (async () => {
  const agent = new OpsAgent();
  console.log(JSON.stringify(await agent.run(), null, 2));
})();

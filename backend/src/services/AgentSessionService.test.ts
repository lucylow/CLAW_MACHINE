import { describe, it, expect, beforeEach } from "vitest";
import { AgentSessionService } from "./AgentSessionService.js";

describe("AgentSessionService (in-memory fallback)", () => {
  let service: AgentSessionService;

  beforeEach(() => {
    service = new AgentSessionService(null, "test-stream");
  });

  it("creates a session with a unique ID", async () => {
    const s1 = await service.createSession("0xabc");
    const s2 = await service.createSession("0xdef");
    expect(s1.sessionId).not.toBe(s2.sessionId);
    expect(s1.walletAddress).toBe("0xabc");
    expect(s1.turns).toHaveLength(0);
    expect(s1.stats.turnCount).toBe(0);
  });

  it("retrieves a session by ID", async () => {
    const s = await service.createSession(null);
    const retrieved = await service.getSession(s.sessionId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.sessionId).toBe(s.sessionId);
  });

  it("returns null for unknown session ID", async () => {
    const result = await service.getSession("non-existent-id");
    expect(result).toBeNull();
  });

  it("appends turns and increments turnCount", async () => {
    const s = await service.createSession(null);
    await service.appendTurn(s.sessionId, { role: "user", content: "hello" });
    await service.appendTurn(s.sessionId, { role: "assistant", content: "hi there" });

    const updated = await service.getSession(s.sessionId);
    expect(updated!.turns).toHaveLength(2);
    expect(updated!.stats.turnCount).toBe(2);
    expect(updated!.turns[0].role).toBe("user");
    expect(updated!.turns[1].role).toBe("assistant");
  });

  it("updateContext merges patch into context", async () => {
    const s = await service.createSession(null);
    await service.updateContext(s.sessionId, { planId: "plan-123", model: "DeepSeek-V3.1" });
    await service.updateContext(s.sessionId, { planId: "plan-456" }); // partial update

    const updated = await service.getSession(s.sessionId);
    expect(updated!.context.planId).toBe("plan-456");
    expect(updated!.context.model).toBe("DeepSeek-V3.1");
  });

  it("deleteSession removes from local cache", async () => {
    const s = await service.createSession(null);
    await service.deleteSession(s.sessionId);

    const result = await service.getSession(s.sessionId);
    expect(result).toBeNull();
  });

  it("listLocalSessions returns all active session IDs", async () => {
    const s1 = await service.createSession(null);
    const s2 = await service.createSession(null);
    const ids = service.listLocalSessions();
    expect(ids).toContain(s1.sessionId);
    expect(ids).toContain(s2.sessionId);
  });

  it("auto-creates a session when appendTurn is called with unknown ID", async () => {
    const state = await service.appendTurn("unknown-session", { role: "user", content: "test" });
    expect(state.sessionId).toBe("unknown-session");
    expect(state.turns).toHaveLength(1);
  });
});

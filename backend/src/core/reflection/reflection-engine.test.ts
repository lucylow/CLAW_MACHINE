import { describe, it, expect, vi } from "vitest";
import { ReflectionEngine } from "./reflection-engine.js";

const mockStorage = { appendLog: vi.fn().mockResolvedValue(undefined) };

describe("ReflectionEngine", () => {
  it("parses valid LLM JSON response", async () => {
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          rootCause: "null pointer",
          mistakeSummary: "dereferenced null",
          correctiveAdvice: "add null check",
          severity: "high",
        }),
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s1", task: "test", trace: [], outcome: "failure", error: "NPE" });
    expect(result.rootCause).toBe("null pointer");
    expect(result.isFallback).toBeFalsy();
    expect(mockStorage.appendLog).toHaveBeenCalledOnce();
  });

  it("uses fallback when LLM returns invalid JSON", async () => {
    const mockLlm = { chat: vi.fn().mockResolvedValue({ text: "Sorry, I cannot help with that." }) };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s2", task: "test", trace: [], outcome: "failure" });
    expect(result.isFallback).toBe(true);
    expect(result.rootCause).toContain("unparseable");
  });

  it("uses fallback when LLM call throws", async () => {
    const mockLlm = { chat: vi.fn().mockRejectedValue(new Error("LLM unavailable")) };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s3", task: "test", trace: [], outcome: "failure" });
    expect(result.isFallback).toBe(true);
  });

  it("does not throw when storage fails", async () => {
    const failStorage = { appendLog: vi.fn().mockRejectedValue(new Error("storage down")) };
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({ rootCause: "r", mistakeSummary: "m", correctiveAdvice: "a", severity: "low" }),
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, failStorage as any);
    await expect(engine.generate({ streamId: "s4", task: "test", trace: [], outcome: "failure" })).resolves.not.toThrow();
  });

  it("normalises invalid severity to medium", async () => {
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({ rootCause: "r", mistakeSummary: "m", correctiveAdvice: "a", severity: "EXTREME" }),
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s5", task: "test", trace: [], outcome: "failure" });
    expect(result.severity).toBe("medium");
  });

  it("extracts JSON embedded in prose", async () => {
    const mockLlm = {
      chat: vi.fn().mockResolvedValue({
        text: 'Here is the analysis: {"rootCause":"timeout","mistakeSummary":"slow","correctiveAdvice":"cache it","severity":"low"} Hope that helps!',
      }),
    };
    const engine = new ReflectionEngine(mockLlm as any, mockStorage as any);
    const result = await engine.generate({ streamId: "s6", task: "test", trace: [], outcome: "failure" });
    expect(result.rootCause).toBe("timeout");
    expect(result.isFallback).toBeFalsy();
  });
});

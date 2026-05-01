import { describe, it, expect, vi } from "vitest";
import { withRetry, MaxRetriesExceededError, RetryAbortedError } from "./withRetry.js";

describe("withRetry", () => {
  it("returns result on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on failure and succeeds on second attempt", async () => {
    let call = 0;
    const fn = vi.fn().mockImplementation(async () => {
      call++;
      if (call < 2) throw new Error("transient");
      return "recovered";
    });
    const result = await withRetry(fn, { maxAttempts: 3, baseMs: 1, jitterMs: 0 });
    expect(result).toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws MaxRetriesExceededError after all attempts fail", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, { maxAttempts: 3, baseMs: 1, jitterMs: 0 })).rejects.toThrow(MaxRetriesExceededError);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("does not retry when retryIf returns false", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("non-retryable"));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseMs: 1, jitterMs: 0, retryIf: () => false }),
    ).rejects.toThrow(MaxRetriesExceededError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("calls onRetry with correct attempt number", async () => {
    const onRetry = vi.fn();
    let call = 0;
    await withRetry(
      async () => { call++; if (call < 3) throw new Error("err"); return "done"; },
      { maxAttempts: 3, baseMs: 1, jitterMs: 0, onRetry },
    );
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][1]).toBe(2); // next attempt number
    expect(onRetry.mock.calls[1][1]).toBe(3);
  });

  it("aborts on signal", async () => {
    const ctrl = new AbortController();
    const fn = vi.fn().mockImplementation(async () => {
      ctrl.abort();
      throw new Error("fail");
    });
    await expect(
      withRetry(fn, { maxAttempts: 5, baseMs: 1, jitterMs: 0, signal: ctrl.signal }),
    ).rejects.toThrow(RetryAbortedError);
  });
});

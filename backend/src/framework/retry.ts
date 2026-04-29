import type { Logger, RetryPolicy } from "./types";
import { classifyError } from "./errors";
import { errorToRecord, sleep } from "./util";

export async function withRetry<T>(operation: () => Promise<T>, policy: RetryPolicy, logger?: Logger): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= policy.attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const classification = classifyError(error);
      if (!policy.retryableCategories.includes(classification.category) || attempt === policy.attempts) {
        throw error;
      }
      const delay = Math.min(policy.maxDelayMs, policy.baseDelayMs * Math.pow(2, attempt - 1));
      const jitter = delay * policy.jitterRatio * Math.random();
      const sleepMs = delay + jitter;
      logger?.warn("Retrying operation", { attempt, sleepMs, error: errorToRecord(error) });
      await sleep(sleepMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("retry failed");
}

import { setTimeout as sleep } from "node:timers/promises";

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter?: boolean;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void,
): Promise<T> {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < options.maxAttempts) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      attempt += 1;
      if (attempt >= options.maxAttempts) break;

      const exp = Math.min(options.baseDelayMs * Math.pow(2, attempt - 1), options.maxDelayMs);
      const delayMs = options.jitter ? exp * (0.5 + Math.random() / 2) : exp;
      onRetry?.(attempt, error, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

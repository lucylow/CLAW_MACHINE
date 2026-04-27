export interface RetryOptions {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitter: boolean;
}

const defaults: RetryOptions = {
  retries: 2,
  baseDelayMs: 200,
  maxDelayMs: 2000,
  jitter: true,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelay(attempt: number, options: RetryOptions): number {
  const exp = Math.min(options.maxDelayMs, options.baseDelayMs * (2 ** attempt));
  if (!options.jitter) return exp;
  const factor = 0.7 + Math.random() * 0.6;
  return Math.floor(exp * factor);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  options: Partial<RetryOptions> = {},
): Promise<T> {
  const merged = { ...defaults, ...options };
  let lastError: unknown;
  for (let i = 0; i <= merged.retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i === merged.retries || !shouldRetry(error)) {
        throw error;
      }
      await sleep(backoffDelay(i, merged));
    }
  }
  throw lastError;
}

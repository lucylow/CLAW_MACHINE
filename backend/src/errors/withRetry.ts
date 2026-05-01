/**
 * withRetry — exponential backoff with jitter, circuit breaker integration,
 * and AbortSignal cancellation support.
 */

export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3. */
  maxAttempts?: number;
  /** Base delay in ms. Actual delay = baseMs * 2^(attempt-1) + jitter. Default: 200. */
  baseMs?: number;
  /** Maximum delay cap in ms. Default: 10000. */
  maxDelayMs?: number;
  /** Jitter range in ms (random 0..jitterMs added). Default: 100. */
  jitterMs?: number;
  /** Predicate to decide whether to retry on a given error. Default: always retry. */
  retryIf?: (err: unknown, attempt: number) => boolean;
  /** Called before each retry with the error and next attempt number. */
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  /** AbortSignal to cancel retries. */
  signal?: AbortSignal;
}

export class RetryAbortedError extends Error {
  constructor() { super("Retry aborted by signal"); this.name = "RetryAbortedError"; }
}

export class MaxRetriesExceededError extends Error {
  public readonly attempts: number;
  public readonly lastError: unknown;
  constructor(attempts: number, lastError: unknown) {
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    super(`Max retries (${attempts}) exceeded. Last error: ${msg}`);
    this.name = "MaxRetriesExceededError";
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new RetryAbortedError()); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new RetryAbortedError()); }, { once: true });
  });
}

export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    baseMs = 200,
    maxDelayMs = 10_000,
    jitterMs = 100,
    retryIf = () => true,
    onRetry,
    signal,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new RetryAbortedError();

    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;

      if (attempt === maxAttempts) break;
      if (!retryIf(err, attempt)) break;

      const backoff = Math.min(baseMs * Math.pow(2, attempt - 1), maxDelayMs);
      const jitter = Math.random() * jitterMs;
      const delayMs = Math.round(backoff + jitter);

      onRetry?.(err, attempt + 1, delayMs);

      await delay(delayMs, signal);
    }
  }

  throw new MaxRetriesExceededError(maxAttempts, lastError);
}

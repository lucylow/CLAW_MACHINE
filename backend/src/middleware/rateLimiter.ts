/**
 * Simple in-process token-bucket rate limiter.
 * No external dependency required.
 */
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../errors/AppError";

interface Bucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterOptions {
  /** Max requests per window */
  limit: number;
  /** Window in milliseconds */
  windowMs: number;
  /** Key extractor — defaults to IP */
  keyFn?: (req: Request) => string;
  /** Message shown on 429 */
  message?: string;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const { limit, windowMs, message = "Too many requests" } = opts;
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup to prevent unbounded growth
  setInterval(() => {
    const cutoff = Date.now() - windowMs * 2;
    for (const [key, bucket] of buckets) {
      if (bucket.lastRefill < cutoff) buckets.delete(key);
    }
  }, windowMs * 5).unref();

  return function rateLimiter(req: Request, res: Response, next: NextFunction) {
    const key = opts.keyFn ? opts.keyFn(req) : (req.ip ?? "unknown");
    const now = Date.now();
    let bucket = buckets.get(key);

    if (!bucket || now - bucket.lastRefill >= windowMs) {
      bucket = { tokens: limit, lastRefill: now };
    }

    if (bucket.tokens <= 0) {
      const retryAfter = Math.ceil((bucket.lastRefill + windowMs - now) / 1000);
      res.setHeader("Retry-After", retryAfter);
      res.setHeader("X-RateLimit-Limit", limit);
      res.setHeader("X-RateLimit-Remaining", 0);
      throw new AppError({
        code: "RATE_001_LIMIT_EXCEEDED",
        message,
        statusCode: 429,
        category: "rate_limit",
        recoverable: true,
        retryable: true,
        details: { retryAfterSeconds: retryAfter },
      });
    }

    bucket.tokens -= 1;
    buckets.set(key, bucket);

    res.setHeader("X-RateLimit-Limit", limit);
    res.setHeader("X-RateLimit-Remaining", bucket.tokens);
    res.setHeader("X-RateLimit-Reset", Math.ceil((bucket.lastRefill + windowMs) / 1000));

    next();
  };
}

/** Per-wallet rate limiter (stricter) */
export const agentRunLimiter = createRateLimiter({
  limit: 30,
  windowMs: 60_000,
  keyFn: (req) =>
    (req.headers["x-wallet-address"] as string) ?? req.ip ?? "anon",
  message: "Agent run rate limit exceeded. Max 30 requests/minute per wallet.",
});

/** Global API limiter */
export const globalLimiter = createRateLimiter({
  limit: 200,
  windowMs: 60_000,
  message: "Global rate limit exceeded.",
});

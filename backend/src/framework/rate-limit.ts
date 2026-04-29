import type { RateLimitPolicy, RateLimiter } from "./types";
import { nowMs } from "./util";

interface BucketState {
  remaining: number;
  resetAt: number;
}

class MemoryRateLimiter implements RateLimiter {
  private buckets = new Map<string, BucketState>();

  async allow(key: string, policy?: RateLimitPolicy): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
    const windowMs = policy?.windowMs ?? 60_000;
    const maxRequests = policy?.maxRequests ?? 100;
    const burst = policy?.burst ?? maxRequests;
    const now = nowMs();
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { remaining: burst - 1, resetAt });
      return { allowed: true, remaining: burst - 1, resetAt };
    }

    if (current.remaining <= 0) {
      return { allowed: false, remaining: 0, resetAt: current.resetAt };
    }

    current.remaining -= 1;
    return { allowed: true, remaining: current.remaining, resetAt: current.resetAt };
  }

  snapshot(): Record<string, { remaining: number; resetAt: number }> {
    return [...this.buckets.entries()].reduce<Record<string, { remaining: number; resetAt: number }>>((acc, [key, value]) => {
      acc[key] = { ...value };
      return acc;
    }, {});
  }
}

export function createRateLimiter(): RateLimiter {
  return new MemoryRateLimiter();
}

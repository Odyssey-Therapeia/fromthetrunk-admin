/**
 * In-memory rate-limiter adapter.
 *
 * Wraps the original lib/http/rate-limit.ts window logic UNCHANGED.
 * This is the default adapter when no Upstash env vars are set.
 */

import type { RateLimiterPort, RateLimitOptions, RateLimitResult } from "@/lib/ports/rate-limiter";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createInMemoryRateLimiter(): RateLimiterPort {
  const store = new Map<string, RateLimitEntry>();

  // Clean up expired entries every 60 seconds
  if (typeof setInterval !== "undefined") {
    setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of store) {
        if (entry.resetAt <= now) {
          store.delete(key);
        }
      }
    }, 60_000);
  }

  return {
    check(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
      const now = Date.now();
      const windowMs = options.windowSeconds * 1000;

      let entry = store.get(key);

      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + windowMs };
        store.set(key, entry);
      }

      entry.count += 1;

      const remaining = Math.max(0, options.limit - entry.count);
      const success = entry.count <= options.limit;

      return Promise.resolve({ success, remaining, resetAt: entry.resetAt });
    },
  };
}

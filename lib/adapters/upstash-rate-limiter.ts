/**
 * Upstash Redis rate-limiter adapter.
 *
 * Only instantiated when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
 * are both set. Uses a sliding-window algorithm so limits are consistent
 * across multiple instances/edge functions.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

import type { RateLimiterPort, RateLimitOptions, RateLimitResult } from "@/lib/ports/rate-limiter";

export function createUpstashRateLimiter(
  restUrl: string,
  restToken: string
): RateLimiterPort {
  const redis = new Redis({ url: restUrl, token: restToken });

  // Cache Ratelimit instances keyed by "limit:windowSeconds" to avoid
  // re-creating them on every request.
  const limiterCache = new Map<string, Ratelimit>();

  const getLimiter = (options: RateLimitOptions): Ratelimit => {
    const cacheKey = `${options.limit}:${options.windowSeconds}`;
    let limiter = limiterCache.get(cacheKey);
    if (!limiter) {
      limiter = new Ratelimit({
        redis,
        limiter: Ratelimit.slidingWindow(options.limit, `${options.windowSeconds} s`),
        analytics: false,
      });
      limiterCache.set(cacheKey, limiter);
    }
    return limiter;
  };

  return {
    async check(key: string, options: RateLimitOptions): Promise<RateLimitResult> {
      const limiter = getLimiter(options);
      const response = await limiter.limit(key);

      return {
        success: response.success,
        remaining: response.remaining,
        resetAt: response.reset,
      };
    },
  };
}

/**
 * Port (interface) for the rate-limiter abstraction.
 *
 * The default adapter is in-memory (current behaviour, unchanged).
 * A durable adapter (e.g. Upstash Redis) is selected when the relevant
 * env vars are present — see the factory in this file.
 */

export interface RateLimitOptions {
  /** Maximum number of requests in the window. */
  limit: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/** The pluggable rate-limiter port. */
export interface RateLimiterPort {
  check(key: string, options: RateLimitOptions): Promise<RateLimitResult>;
}

// ── Factory ─────────────────────────────────────────────────────────────────

import { createInMemoryRateLimiter } from "@/lib/adapters/in-memory-rate-limiter";
import { createUpstashRateLimiter } from "@/lib/adapters/upstash-rate-limiter";

let _instance: RateLimiterPort | null = null;

/**
 * Returns the singleton rate-limiter adapter.
 *
 * Selection rules (evaluated once at module initialisation):
 *  1. UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN both present → Upstash adapter.
 *  2. Otherwise → in-memory adapter (default; identical behaviour to the
 *     original lib/http/rate-limit.ts checkRateLimit).
 *
 * Call sites do NOT need to know which adapter is active.
 */
export function getRateLimiter(): RateLimiterPort {
  if (_instance) return _instance;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    _instance = createUpstashRateLimiter(url, token);
  } else {
    _instance = createInMemoryRateLimiter();
  }

  return _instance;
}

/**
 * Reset the cached singleton (test helper — do NOT call in production code).
 */
export function _resetRateLimiterInstance(): void {
  _instance = null;
}

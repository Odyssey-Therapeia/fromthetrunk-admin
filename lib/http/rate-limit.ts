/**
 * Rate-limiter façade — backward-compatible shim.
 *
 * All production logic now lives behind the port/adapter pair:
 *   - Port:              lib/ports/rate-limiter.ts
 *   - Default adapter:   lib/adapters/in-memory-rate-limiter.ts  (unchanged logic)
 *   - Durable adapter:   lib/adapters/upstash-rate-limiter.ts    (selected by env)
 *
 * This file preserves the original exported surface so existing callers
 * (payments.ts, users.ts, newsletter.ts, cart.ts, tests) need no changes.
 */

import { getRateLimiter } from "@/lib/ports/rate-limiter";

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

/**
 * Check rate limit for a given key (e.g., user ID, IP address).
 *
 * Delegates to the active adapter (in-memory by default).
 * The async adapter result is synchronised here so callers that already
 * await the outer route handler don't need a signature change.
 * For pure-sync callers that still import checkRateLimit directly, this
 * returns a Promise<RateLimitResult> — TypeScript infers the type; existing
 * tests that await the call work unchanged.
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): Promise<RateLimitResult> {
  return getRateLimiter().check(key, options);
}

/**
 * Extract a rate-limit key from a request.
 * Uses user ID if available (from headers set by middleware), otherwise IP.
 *
 * IP resolution order:
 *  1. x-real-ip  — set by Vercel from the TLS connection; not client-controllable.
 *  2. Last hop of x-forwarded-for — the closest trusted proxy entry; harder to forge
 *     than the first hop, which a client can freely prepend.
 */
export function getRateLimitKey(request: Request, prefix: string): string {
  // Vercel sets x-real-ip from the TLS connection — unforgeable by clients
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return `${prefix}:${realIp.trim()}`;
  // Fallback: last hop in x-forwarded-for (hardest to forge)
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",").pop()?.trim() || "unknown";
  return `${prefix}:${ip}`;
}

/**
 * Convenience: check rate limit and return a 429 Response if exceeded.
 * Returns null if the request is within limits.
 */
export async function rateLimitResponse(
  request: Request,
  prefix: string,
  options: RateLimitOptions
): Promise<Response | null> {
  const key = getRateLimitKey(request, prefix);
  const result = await checkRateLimit(key, options);

  if (!result.success) {
    return new Response(
      JSON.stringify({
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again later.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        },
      }
    );
  }

  return null;
}

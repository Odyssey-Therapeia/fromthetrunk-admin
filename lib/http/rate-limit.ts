/**
 * Simple in-memory rate limiter for API routes.
 *
 * For production at scale, replace with Upstash Redis or similar distributed
 * rate limiting. This implementation works well for single-instance deployments.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

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

interface RateLimitOptions {
  /** Maximum number of requests in the window. */
  limit: number;
  /** Window duration in seconds. */
  windowSeconds: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check rate limit for a given key (e.g., user ID, IP address).
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): RateLimitResult {
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

  return { success, remaining, resetAt: entry.resetAt };
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
export function getRateLimitKey(
  request: Request,
  prefix: string
): string {
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
export function rateLimitResponse(
  request: Request,
  prefix: string,
  options: RateLimitOptions
): Response | null {
  const key = getRateLimitKey(request, prefix);
  const result = checkRateLimit(key, options);

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
          "Retry-After": String(
            Math.ceil((result.resetAt - Date.now()) / 1000)
          ),
        },
      }
    );
  }

  return null;
}

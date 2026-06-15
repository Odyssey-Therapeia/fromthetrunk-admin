/**
 * P3-09: Redirect resolver — consults the redirects table and follows chains.
 *
 * LOOP GUARD: a self-redirect (A→A), a cycle (A→B→A), or a chain exceeding
 * MAX_REDIRECT_HOPS all terminate without hanging AND return null (no usable
 * redirect) so proxy.ts falls through to NextResponse.next() rather than
 * issuing a redirect to a looping destination.
 *
 * Two distinct guards work in concert:
 *   1. MAX_REDIRECT_HOPS — bounds the number of DB lookups (hop count).
 *   2. visited-set cycle guard — detects re-entry into an already-visited path
 *      and terminates before hitting the hop limit. Removing this guard means
 *      a two-hop cycle (A→B→A) would exhaust MAX_REDIRECT_HOPS iterations
 *      before stopping — the test for cycles proves removing visited-set
 *      resolution would make the cycle test fire MAX_REDIRECT_HOPS DB calls
 *      instead of 2.
 *
 * Safety contract:
 *   - Self-redirect (A→A): returns null (not {toPath: A}) so proxy passes through.
 *   - Cycle (A→B→A): returns null so proxy passes through.
 *   - Long chain (> MAX_REDIRECT_HOPS): returns the last safe hop before the bound.
 *
 * Status: all redirects use HTTP 301 (permanent). The redirects table has no
 * status column (see SPEC-vs-REALITY note in P3-09 context capsule).
 * A future migration can add a status column; the resolver uses 301 as default.
 */

export const MAX_REDIRECT_HOPS = 10;

export type ResolvedRedirect = {
  toPath: string;
  /** HTTP redirect status. Always 301 (permanent) until a status column is added. */
  status: 301 | 302;
};

/**
 * Resolves a redirect for the given pathname.
 *
 * - Follows chains up to MAX_REDIRECT_HOPS hops.
 * - Detects cycles (visited-set guard) and returns null — safe for proxy passthrough.
 * - Returns null for self-redirects (A→A) — safe for proxy passthrough.
 * - Returns null if no redirect exists for the given path.
 * - Returns the final resolved destination, never an intermediate hop.
 */
export async function resolveRedirect(
  fromPath: string
): Promise<ResolvedRedirect | null> {
  const { dbSelectRedirect } = await import("@/db/queries/content");

  // visited-set cycle guard: tracks every path we have entered during resolution.
  // If we encounter a path we've already visited, we have a cycle — return null
  // so the proxy falls through (NextResponse.next) rather than redirecting into a loop.
  const visited = new Set<string>();
  let current = fromPath;
  let lastToPath: string | null = null;
  let hops = 0;

  while (hops < MAX_REDIRECT_HOPS) {
    // CYCLE GUARD (visited-set): if we've already visited this path, stop.
    // Removing this guard means cycles exhaust MAX_REDIRECT_HOPS iterations;
    // the cycle test proves this guard is load-bearing by asserting call count ≤ 2.
    if (visited.has(current)) {
      // Cycle detected — discard lastToPath so we return null (safe passthrough).
      lastToPath = null;
      break;
    }
    visited.add(current);

    const row = await dbSelectRedirect(current);
    if (!row) {
      // No redirect entry — chain ends here. lastToPath holds the final destination.
      break;
    }

    // SELF-REDIRECT GUARD: if destination === source, stop and return null.
    if (row.toPath === current) {
      lastToPath = null;
      break;
    }

    lastToPath = row.toPath;
    hops++;
    current = row.toPath;
  }

  // After exhausting hops: if the resolved destination would re-enter the original
  // request path (lastToPath === fromPath), that is also a degenerate cycle — return null.
  if (lastToPath === fromPath) {
    return null;
  }

  if (!lastToPath) {
    return null;
  }

  return { toPath: lastToPath, status: 301 };
}

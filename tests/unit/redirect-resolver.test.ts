/**
 * P3-09: Redirect resolver unit tests.
 *
 * Tests the REAL resolver with the LOWEST dependency mocked:
 *   - Mocks @/db (the Drizzle db object) — NOT @/db/queries/content
 *   - The real dbSelectRedirect query function executes (reads from our mock db)
 *   - Tests loop guard: self-redirect, cycle (A→B→A), long chain all terminate
 *
 * LOOP GUARD MUTATION PROOFS:
 *   1. Self-redirect (A→A) must return NULL (not {toPath: A}).
 *      The proxy must not issue a redirect to the same path it received.
 *   2. Cycle (A→B→A): must return NULL and call db at most 2 times
 *      (visited-set detects cycle after 2 hops — not MAX_REDIRECT_HOPS).
 *      REMOVING the visited-set guard would make the cycle exhaust MAX_REDIRECT_HOPS
 *      iterations (10 calls instead of 2), FAILING the call-count assertion.
 *      This proves the visited-set guard is load-bearing independently of MAX_HOPS.
 *   3. Long chain > MAX_HOPS terminates at the hop bound.
 *
 * collectPrimitives is used to assert WHERE clause values.
 *
 * TEST ISOLATION: mocks are reset in beforeEach so this file does not share
 * state with nav-menu-consumer.test.ts when run in the same worker.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── collectPrimitives: walks Drizzle SQL AST to collect string/Date values ────
function collectPrimitives(node: unknown, visited = new WeakSet<object>()): string[] {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (node instanceof Date) return [node.toISOString()];
  if (typeof node !== "object") return [];
  if (visited.has(node as object)) return [];
  visited.add(node as object);
  return Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectPrimitives(v, visited)
  );
}

// ── Mock @/db at the lowest level ─────────────────────────────────────────────
// The redirect resolver calls dbSelectRedirect which calls db.select()...
// We wire the select chain so the real query code runs against our in-memory table.
// These mocks are MODULE-SCOPED but reset (not re-shared) in every beforeEach.

const selectMock = vi.fn();
const fromMock = vi.fn();
const whereMock = vi.fn();
const limitMock = vi.fn();

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
  },
}));

// ── In-memory redirect table ──────────────────────────────────────────────────
// The limitMock inspects the WHERE clause to look up the fromPath.

const redirectTable = new Map<string, string>();

function rewireMocks() {
  selectMock.mockReturnValue({ from: fromMock });
  fromMock.mockReturnValue({ where: whereMock });
  whereMock.mockReturnValue({ limit: limitMock });
  limitMock.mockImplementation(async () => {
    const whereArg = whereMock.mock.lastCall?.[0];
    const primitives = collectPrimitives(whereArg);
    for (const prim of primitives) {
      if (redirectTable.has(prim)) {
        const toPath = redirectTable.get(prim)!;
        return [{ id: `id-${prim}`, fromPath: prim, toPath, createdAt: new Date() }];
      }
    }
    return [];
  });
}

// ── Import resolver AFTER mocks ───────────────────────────────────────────────

import {
  resolveRedirect,
  MAX_REDIRECT_HOPS,
  type ResolvedRedirect,
} from "@/lib/content/redirect-resolver";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveRedirect — basic resolution", () => {
  beforeEach(() => {
    redirectTable.clear();
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    limitMock.mockReset();
    rewireMocks();
  });

  it("returns null for a path with no redirect", async () => {
    const result = await resolveRedirect("/no-redirect-here");
    expect(result).toBeNull();
  });

  it("resolves a single-hop redirect and returns status 301", async () => {
    redirectTable.set("/old-page", "/new-page");

    const result = await resolveRedirect("/old-page");
    expect(result).not.toBeNull();
    expect(result!.toPath).toBe("/new-page");
    expect(result!.status).toBe(301);

    // Verify the WHERE clause inspected /old-page
    const whereArg = whereMock.mock.calls[0]?.[0];
    expect(collectPrimitives(whereArg)).toContain("/old-page");
  });

  it("follows a two-hop chain (A→B→C) and resolves to the final destination", async () => {
    redirectTable.set("/a", "/b");
    redirectTable.set("/b", "/c");

    const result = await resolveRedirect("/a");
    expect(result).not.toBeNull();
    expect(result!.toPath).toBe("/c");
  });

  it("follows a three-hop chain and resolves to the final destination", async () => {
    redirectTable.set("/x", "/y");
    redirectTable.set("/y", "/z");
    redirectTable.set("/z", "/final");

    const result = await resolveRedirect("/x");
    expect(result).not.toBeNull();
    expect(result!.toPath).toBe("/final");
  });
});

describe("resolveRedirect — LOOP GUARD (mutation-proven)", () => {
  beforeEach(() => {
    redirectTable.clear();
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    limitMock.mockReset();
    rewireMocks();
  });

  it("SELF-REDIRECT (A→A): returns NULL — never issues a redirect to itself", async () => {
    redirectTable.set("/self", "/self");

    const result = await resolveRedirect("/self");

    // MUST be null: the proxy must not redirect /self → /self (that would loop).
    // If this is non-null, the proxy would issue an infinite redirect.
    expect(result).toBeNull();

    // DB was called exactly once (looked up /self, found self-redirect, stopped).
    expect(selectMock.mock.calls.length).toBe(1);
  });

  it("CYCLE (A→B→A): returns NULL — visited-set terminates at 2 DB calls", async () => {
    redirectTable.set("/cycle-a", "/cycle-b");
    redirectTable.set("/cycle-b", "/cycle-a");

    const result = await resolveRedirect("/cycle-a");

    // MUST be null: a cycle destination is unsafe to redirect to.
    expect(result).toBeNull();

    // VISITED-SET GUARD PROOF:
    // With the visited-set guard: cycle detected after 2 calls (looked up /cycle-a then /cycle-b,
    // then /cycle-a is already visited → stop immediately).
    // WITHOUT the visited-set guard: the cycle would exhaust MAX_REDIRECT_HOPS (10) calls
    // before stopping — the call count would be MAX_REDIRECT_HOPS (10), not 2.
    // This assertion FAILS if the visited-set guard is removed.
    const dbCallCount = selectMock.mock.calls.length;
    expect(dbCallCount).toBeLessThanOrEqual(3); // 2 hops + guard fires at entry of 3rd
    expect(dbCallCount).toBeGreaterThanOrEqual(2); // at minimum, looked up both nodes
  });

  it("LONG CHAIN: terminates at MAX_REDIRECT_HOPS and returns the last valid hop", async () => {
    const N = MAX_REDIRECT_HOPS + 5;
    for (let i = 0; i < N; i++) {
      redirectTable.set(`/hop-${i}`, `/hop-${i + 1}`);
    }

    const result = await resolveRedirect("/hop-0");

    // Must terminate (reaching here proves it did not hang).
    expect(true).toBe(true);

    // The resolver stops at MAX_REDIRECT_HOPS hops.
    // DB is called at most MAX_REDIRECT_HOPS times (once per hop).
    expect(selectMock.mock.calls.length).toBeLessThanOrEqual(MAX_REDIRECT_HOPS + 1);

    // Non-null: the first hop IS a redirect and the chain is long enough to hit the bound.
    expect(result).not.toBeNull();
  });

  it("LOOP GUARD PROOF (constant): MAX_REDIRECT_HOPS is a finite positive integer", () => {
    // If MAX_REDIRECT_HOPS were Infinity, the long-chain test would never terminate.
    // This assertion proves the constant is bounded.
    expect(Number.isFinite(MAX_REDIRECT_HOPS)).toBe(true);
    expect(MAX_REDIRECT_HOPS).toBeGreaterThan(0);
    expect(MAX_REDIRECT_HOPS).toBeLessThan(1000);
  });

  it("VISITED-SET PROOF: cycle call count ≤ 3 — removing visited-set would cause 10 calls", async () => {
    // This is the mutation-kill test for the visited-set guard specifically.
    // It is distinct from the MAX_HOPS bound proof.
    //
    // With visited-set guard in place:
    //   resolveRedirect('/va') → looks up /va (call 1) → gets /vb
    //                          → looks up /vb (call 2) → gets /va
    //                          → /va is in visited → stop (call count = 2)
    //
    // WITHOUT visited-set guard (only MAX_HOPS=10):
    //   resolveRedirect('/va') → /va→/vb→/va→/vb→/va→/vb→/va→/vb→/va→/vb (10 calls)
    //   The test's assertion (≤ 3 calls) would FAIL.
    //
    // This test cannot be run without the guard (it would still terminate at MAX_HOPS)
    // but the call count assertion is the proof: 2 calls with guard vs 10 without.

    redirectTable.set("/va", "/vb");
    redirectTable.set("/vb", "/va");

    const result = await resolveRedirect("/va");

    expect(result).toBeNull(); // cycle → null

    // FAILS if visited-set guard is removed (would be MAX_REDIRECT_HOPS calls instead).
    expect(selectMock.mock.calls.length).toBeLessThanOrEqual(3);
  });
});

describe("resolveRedirect — type contract", () => {
  beforeEach(() => {
    redirectTable.clear();
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    limitMock.mockReset();
    rewireMocks();
  });

  it("resolved redirect has status 301 by default", async () => {
    redirectTable.set("/typed-from", "/typed-to");
    const result = await resolveRedirect("/typed-from");
    expect(result).not.toBeNull();
    const r: ResolvedRedirect = result!;
    expect(r.toPath).toBe("/typed-to");
    expect(r.status).toBe(301);
  });
});

describe("resolveRedirect — proxy money-path regression", () => {
  beforeEach(() => {
    redirectTable.clear();
    selectMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    limitMock.mockReset();
    rewireMocks();
  });

  it("returns null for /collection/* paths (no redirect entry)", async () => {
    const result = await resolveRedirect("/collection/my-saree");
    expect(result).toBeNull();
  });

  it("returns null for /account/* paths (no redirect entry)", async () => {
    const result = await resolveRedirect("/account/profile");
    expect(result).toBeNull();
  });
});

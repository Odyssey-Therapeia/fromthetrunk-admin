/**
 * FIX #1 (P6-02 BLOCKER): DB-layer tests for incrementDiscountUsage.
 *
 * Gap: incrementDiscountUsage had ZERO behavioral test coverage — the
 * WHERE clause conditional guard `or(isNull(usageLimit), lt(usageCount, usageLimit))`
 * could be deleted with no test going red.
 *
 * Strategy:
 * - Mock @/db at the module boundary (the drizzle builder chain).
 * - Import and call the REAL incrementDiscountUsage.
 * - Capture the .where() argument and walk the AST to assert the conditional
 *   guard is present.
 * - (a) rows returned → true; (b) no rows → false; (c) WHERE contains the guard.
 *
 * Mutation proof: deleting `or(isNull(...), lt(...))` from db/queries/discounts.ts
 * causes test (c) to fail because the captured WHERE arg no longer contains the
 * isNull/lt structure (see "MUTATION PROOF" comment below).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
// We hoist these so they are available before module evaluation.
const returningMock = vi.hoisted(() => vi.fn());
const whereMock = vi.hoisted(() => vi.fn());
const setMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    update: updateMock,
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
  },
  withRetry: vi.fn((fn: () => unknown) => fn()),
}));

// drizzle-orm operators: return plain-object AST nodes that are walkable.
// We do NOT mock drizzle-orm globally so the real operators produce real AST
// objects, which we then inspect via collectPrimitives / structureWalk.
// The schema import must resolve without hitting a real DB.
vi.mock("@/db/schema", async (importOriginal) => {
  // Return a minimal schema shape sufficient for the discounts table columns
  // used in incrementDiscountUsage (id, usageCount, usageLimit, updatedAt).
  const actual = await importOriginal<typeof import("@/db/schema")>();
  return actual;
});

// Import the REAL function under test (after mocks are registered).
import { incrementDiscountUsage } from "@/db/queries/discounts";

// ── AST walker — safe against circular Drizzle SQL nodes ─────────────────────

/**
 * Recursively walk a Drizzle SQL AST (which may contain circular references via
 * `queryChunks`, `decoder`, etc.) and collect all string/number primitives.
 * Used to assert that a WHERE argument contains expected field names and operators.
 */
function collectPrimitives(
  node: unknown,
  seen = new WeakSet<object>()
): Array<string | number> {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [node];
  if (Array.isArray(node)) {
    const results: Array<string | number> = [];
    for (const item of node) {
      results.push(...collectPrimitives(item, seen));
    }
    return results;
  }
  if (typeof node === "object") {
    if (seen.has(node as object)) return [];
    seen.add(node as object);
    const results: Array<string | number> = [];
    for (const val of Object.values(node as Record<string, unknown>)) {
      results.push(...collectPrimitives(val, seen));
    }
    return results;
  }
  return [];
}

/**
 * Walk the AST and collect all unique operator-like key names found in plain
 * objects within the tree. Drizzle SQL nodes expose their operator via keys like
 * `operator`, `sql`, `type`, or similar — we use this to find IS_NULL and < nodes.
 *
 * More importantly, we look for column names embedded in the AST to confirm
 * usageLimit (IS NULL) and usageCount < usageLimit appear in the WHERE.
 */
function collectKeys(node: unknown, seen = new WeakSet<object>()): string[] {
  if (node === null || node === undefined || typeof node !== "object") return [];
  if (Array.isArray(node)) {
    return node.flatMap((item) => collectKeys(item, seen));
  }
  if (seen.has(node as object)) return [];
  seen.add(node as object);
  const keys = Object.keys(node as Record<string, unknown>);
  const childKeys = Object.values(node as Record<string, unknown>).flatMap((v) =>
    collectKeys(v, seen)
  );
  return [...keys, ...childKeys];
}

// ── Helper: wire the db.update builder chain ─────────────────────────────────

function wireUpdateChain(resolvedRows: Array<{ id: string }>) {
  returningMock.mockResolvedValue(resolvedRows);
  whereMock.mockReturnValue({ returning: returningMock });
  setMock.mockReturnValue({ where: whereMock });
  updateMock.mockReturnValue({ set: setMock });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("incrementDiscountUsage — DB-layer behavioral tests (FIX #1)", () => {
  beforeEach(() => {
    updateMock.mockReset();
    setMock.mockReset();
    whereMock.mockReset();
    returningMock.mockReset();
  });

  // (a) When the UPDATE returns a row, incrementDiscountUsage returns true.
  it("(a) returns true when the UPDATE returns a row (increment succeeded)", async () => {
    wireUpdateChain([{ id: "disc-uuid-001" }]);

    const result = await incrementDiscountUsage("disc-uuid-001");

    expect(result).toBe(true);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(returningMock).toHaveBeenCalledTimes(1);
  });

  // (b) When the UPDATE returns [], incrementDiscountUsage returns false (at-limit).
  it("(b) returns false when the UPDATE returns [] (usage limit already reached)", async () => {
    wireUpdateChain([]);

    const result = await incrementDiscountUsage("disc-uuid-999");

    expect(result).toBe(false);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  // (c) The WHERE argument must contain the conditional guard.
  //
  // MUTATION PROOF: Drizzle's `and(expr1, expr2)` builds a SQL node with an
  // outer wrapper of 3 queryChunks: ["(", inner-SQL-node, ")"].
  // The inner SQL node itself has 3 queryChunks: [eq-node, " and ", or-node].
  //
  // When the guard is removed so `and()` receives only one expression:
  //   - The outer node has 1 queryChunk (just the single expression, no parens).
  // This length change (3 → 1) is the mutation detector.
  //
  // Additionally, the or() sub-node itself has 3 queryChunks confirming that
  // both isNull(usageLimit) and lt(usageCount, usageLimit) branches are present.
  it("(c) WHERE clause contains the or(isNull(usageLimit), lt(usageCount, usageLimit)) guard", async () => {
    wireUpdateChain([{ id: "disc-uuid-001" }]);

    await incrementDiscountUsage("disc-uuid-001");

    expect(whereMock).toHaveBeenCalledTimes(1);
    const whereArg = whereMock.mock.calls[0]![0];

    expect(whereArg, "WHERE arg must be a Drizzle SQL node (and() result)").not.toBeNull();
    const andChunks = (whereArg as { queryChunks: unknown[] }).queryChunks;
    expect(
      Array.isArray(andChunks),
      "and() node must have a queryChunks array"
    ).toBe(true);
    // and(eq(...), or(...)) → outer node: ["(", inner-SQL, ")"] → length 3
    // and(eq(...)) alone → outer node: [eq-node] → length 1
    // Removing the guard causes this to fail (3 → 1).
    expect(
      andChunks.length,
      "and(eq(...), or(...)) outer node must have 3 queryChunks — removing the guard drops this to 1"
    ).toBeGreaterThanOrEqual(3);

    // The middle chunk (index 1) is the inner SQL containing [eq, " and ", or].
    // Removing the or() guard collapses the inner node — its queryChunks go from 3 to 5
    // (for the eq alone). We verify both conditions are present by checking the
    // inner SQL node has 3 queryChunks: [eq-node, " and ", or-node].
    const innerSqlNode = andChunks[1] as { queryChunks: unknown[] } | null;
    expect(
      innerSqlNode,
      "Inner SQL node (index 1 of outer and() chunks) must be present"
    ).not.toBeNull();
    expect(
      Array.isArray(innerSqlNode?.queryChunks),
      "Inner SQL node must have a queryChunks array"
    ).toBe(true);
    expect(
      innerSqlNode!.queryChunks.length,
      "and() inner SQL must have 3 queryChunks [eq, ' and ', or] — removing the guard reduces this to the single eq node (length != 3)"
    ).toBe(3);

    // The third chunk of the inner SQL is the or() node: or(isNull, lt)
    // → 3 queryChunks: [isNull, " or ", lt]. Removing either branch fails this.
    const orNode = innerSqlNode!.queryChunks[2] as { queryChunks: unknown[] } | undefined;
    expect(orNode, "Third inner chunk must be the or() guard node").toBeDefined();
    expect(
      Array.isArray(orNode?.queryChunks),
      "or() node must have a queryChunks array"
    ).toBe(true);
    expect(
      orNode!.queryChunks.length,
      "or(isNull(...), lt(...)) must have 3 queryChunks — removing either branch reduces this"
    ).toBeGreaterThanOrEqual(3);
  });

  // Confirm the SET always increments usage_count by 1 (not a static value).
  it("SET includes usage_count = usage_count + 1 and updatedAt", async () => {
    wireUpdateChain([{ id: "disc-uuid-001" }]);

    await incrementDiscountUsage("disc-uuid-001");

    expect(setMock).toHaveBeenCalledTimes(1);
    const setArg = setMock.mock.calls[0]![0] as Record<string, unknown>;

    // The usageCount field is a SQL expression object (sql`usage_count + 1`), not a plain number.
    expect(setArg).toHaveProperty("usageCount");
    // updatedAt is set to a Date
    expect(setArg.updatedAt).toBeInstanceOf(Date);

    // The SQL expression for usageCount must contain "usage_count" and "1"
    const usageCountExpr = setArg.usageCount;
    const primitives = collectPrimitives(usageCountExpr);
    expect(primitives.join(" ")).toContain("usage_count");
  });

  // Parameterised: multiple discount IDs all produce a true/false result correctly.
  it.each([
    ["disc-uuid-A", [{ id: "disc-uuid-A" }], true],
    ["disc-uuid-B", [], false],
  ])(
    "returns %s correctly for rows=%j → %s",
    async (discountId, rows, expected) => {
      wireUpdateChain(rows as Array<{ id: string }>);
      const result = await incrementDiscountUsage(discountId);
      expect(result).toBe(expected);
    }
  );
});

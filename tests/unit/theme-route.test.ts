/**
 * P3-07: Admin theme route tests — REAL query layer, @/db mocked.
 *
 * TEST DISCIPLINE:
 *   - Mocks @/db (the Drizzle builder) NOT @/db/queries/content.
 *   - The real dbUpsertThemeSettings + dbInsertThemeVersion functions are called.
 *   - Uses a queue-driven insert/select mock so each DB call dequeues one result.
 *   - WHERE-clause arguments are captured and inspected via collectPrimitives.
 *   - The Drizzle adapter (lib/adapters/drizzle-content-store.ts) and route
 *     (api/hono/routes/theme.ts) run unmodified — only the lowest layer is mocked.
 *
 * L2 mutation-proofs:
 *   - POST /theme persists tokens via the real dbUpsertThemeSettings call.
 *   - POST /theme writes a version row via the real dbInsertThemeVersion call.
 *   - Mutating token value produces a different DB insert payload.
 *   - GET /theme returns 404 when no row exists.
 *   - GET /versions returns newest-first version list.
 *   - POST /versions/:id/restore restores prior tokens as the new current.
 *   - requireAdmin guard: 401 if unauthenticated.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Queue-driven db mock — mirrors postgres-catalog-search.test.ts exactly ───
//
// select() dequeues rows from selectQueue (FIFO).
// insert() dequeues rows from insertQueue (FIFO) and captures the values() payload.
// WHERE args are captured for AST inspection.

const selectQueue = vi.hoisted(() => [] as unknown[][]);
const insertQueue = vi.hoisted(() => [] as unknown[][]);

/** Stores all values() payloads from db.insert().values(...), in call order. */
const capturedInsertValues = vi.hoisted(() => [] as unknown[]);

/** Stores all WHERE args from db.select().where(...), in call order. */
const capturedWhereArgs = vi.hoisted(() => [] as unknown[]);

/**
 * makeSelectBuilder: factory that returns a chainable Drizzle select builder.
 * Dequeues the next row array from selectQueue when instantiated.
 * Captures .where() arguments for AST inspection.
 */
const makeSelectBuilder = vi.hoisted(() => () => {
  const rows = selectQueue.shift() ?? [];
  const builder: Record<string, unknown> = {};

  for (const method of ["from", "innerJoin", "leftJoin", "orderBy", "limit", "offset", "groupBy"]) {
    builder[method] = () => builder;
  }

  builder["where"] = (arg: unknown) => {
    capturedWhereArgs.push(arg);
    return builder;
  };

  // Thenable so `await db.select()...` resolves.
  builder.then = (resolve: (v: unknown[]) => unknown) => resolve(rows);
  return builder;
});

/**
 * makeInsertBuilder: factory that returns a chainable Drizzle insert builder.
 * Dequeues the next row array from insertQueue when instantiated.
 * Captures the payload passed to .values() for mutation-proof assertions.
 */
const makeInsertBuilder = vi.hoisted(() => () => {
  const rows = insertQueue.shift() ?? [];
  const builder: Record<string, unknown> = {};

  builder["values"] = (payload: unknown) => {
    capturedInsertValues.push(payload);
    // After values(), further chaining: onConflictDoUpdate, returning, etc.
    const afterValues: Record<string, unknown> = {};
    afterValues["onConflictDoUpdate"] = () => afterValues;
    afterValues["returning"] = () => afterValues;
    afterValues.then = (resolve: (v: unknown[]) => unknown) => resolve(rows);
    return afterValues;
  };

  return builder;
});

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => makeSelectBuilder()),
    insert: vi.fn(() => makeInsertBuilder()),
  },
  withRetry: vi.fn((op: () => Promise<unknown>) => op()),
}));

// ── Import AFTER the mock is registered ──────────────────────────────────────

import { createRouteHarness } from "../helpers/route-harness";
import { registerThemeRoutes } from "@/api/hono/routes/theme";
import { createDrizzleContentStore } from "@/lib/adapters/drizzle-content-store";

// ── AST inspector — identical pattern to postgres-catalog-search.test.ts ─────

function collectPrimitives(
  node: unknown,
  seen = new WeakSet<object>()
): Array<string | number> {
  if (node === null || node === undefined) return [];
  if (typeof node === "string") return [node];
  if (typeof node === "number") return [node];
  if (Array.isArray(node)) {
    const out: Array<string | number> = [];
    for (const item of node) out.push(...collectPrimitives(item, seen));
    return out;
  }
  if (typeof node === "object") {
    if (seen.has(node as object)) return [];
    seen.add(node as object);
    const out: Array<string | number> = [];
    for (const val of Object.values(node as Record<string, unknown>))
      out.push(...collectPrimitives(val, seen));
    return out;
  }
  return [];
}

// ── Fixture rows ──────────────────────────────────────────────────────────────

const mkThemeRow = (tokens: Record<string, unknown> = { "--primary": "#6b1d1d" }) => ({
  id: 1,
  tokens,
  updatedAt: new Date("2024-01-01T00:00:00Z"),
});

const mkVersionRow = (
  tokens: Record<string, unknown> = { "--primary": "#6b1d1d" },
  id = "ver-1"
) => ({
  id,
  tokens,
  createdBy: "admin-1",
  createdAt: new Date("2024-01-01T00:00:00Z"),
});

// ── Admin user + harness helpers ──────────────────────────────────────────────

const adminUser = { id: "admin-1", email: "admin@example.com", role: "admin" } as const;

function makeHarness() {
  const store = createDrizzleContentStore();
  const harness = createRouteHarness({
    register: (app) => registerThemeRoutes(app, store),
    authUser: adminUser,
  });
  return { harness };
}

function makeUnauthenticatedHarness() {
  const store = createDrizzleContentStore();
  const harness = createRouteHarness({
    register: (app) => registerThemeRoutes(app, store),
    authUser: null,
  });
  return { harness };
}

// ── Reset queues before each test ─────────────────────────────────────────────

beforeEach(() => {
  selectQueue.length = 0;
  insertQueue.length = 0;
  capturedInsertValues.length = 0;
  capturedWhereArgs.length = 0;
});

// ── GET / — read current settings ─────────────────────────────────────────────

describe("GET / (theme)", () => {
  it("returns 404 when no theme row exists (select returns empty)", async () => {
    selectQueue.push([]); // dbSelectThemeSettings → no row
    const { harness } = makeHarness();
    const res = await harness.request("/");
    expect(res.status).toBe(404);
  });

  it("returns 200 with token payload when a row exists", async () => {
    selectQueue.push([mkThemeRow({ "--primary": "#6b1d1d" })]);
    const { harness } = makeHarness();
    const res = await harness.request("/");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Record<string, unknown> };
    expect(body.tokens["--primary"]).toBe("#6b1d1d");
  });

  it("requires admin — 401 when unauthenticated", async () => {
    const { harness } = makeUnauthenticatedHarness();
    const res = await harness.request("/");
    expect(res.status).toBe(401);
  });
});

// ── POST / — save theme tokens ────────────────────────────────────────────────

describe("POST / (theme) — real dbUpsertThemeSettings + dbInsertThemeVersion", () => {
  it("calls dbUpsertThemeSettings and dbInsertThemeVersion on save (two inserts fired)", async () => {
    const tokens = { "--primary": "#6b1d1d", "--accent": "#b8860b" };

    // dbUpsertThemeSettings: insert.values({…}).onConflictDoUpdate({…}).returning() → [themeRow]
    insertQueue.push([mkThemeRow(tokens)]);
    // dbInsertThemeVersion: insert.values({…}).returning() → [versionRow]
    insertQueue.push([mkVersionRow(tokens)]);

    const { harness } = makeHarness();
    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Record<string, unknown> };
    expect(body.tokens["--primary"]).toBe("#6b1d1d");

    // Two inserts must have fired: upsert (theme_settings) + append (theme_versions)
    expect(capturedInsertValues).toHaveLength(2);
  });

  it("mutation-proof: changing --primary produces a different insert payload", async () => {
    const tokens1 = { "--primary": "#6b1d1d" };
    const tokens2 = { "--primary": "#ff0000" };

    // First save
    insertQueue.push([mkThemeRow(tokens1)]);
    insertQueue.push([mkVersionRow(tokens1, "ver-a")]);

    const { harness } = makeHarness();
    await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: tokens1 }),
    });

    const payload1 = capturedInsertValues[0] as { tokens: Record<string, unknown>; id?: number };

    // Reset captured state for second save
    capturedInsertValues.length = 0;

    // Second save
    insertQueue.push([mkThemeRow(tokens2)]);
    insertQueue.push([mkVersionRow(tokens2, "ver-b")]);

    await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: tokens2 }),
    });

    const payload2 = capturedInsertValues[0] as { tokens: Record<string, unknown>; id?: number };

    // The payloads must differ — proves mutation changes the actual DB insert
    expect(payload1.tokens["--primary"]).toBe("#6b1d1d");
    expect(payload2.tokens["--primary"]).toBe("#ff0000");
    expect(payload1.tokens["--primary"]).not.toBe(payload2.tokens["--primary"]);
  });

  it("version row insert carries the correct createdBy from the auth user", async () => {
    const tokens = { "--primary": "#6b1d1d" };
    insertQueue.push([mkThemeRow(tokens)]);
    insertQueue.push([mkVersionRow(tokens)]);

    const { harness } = makeHarness();
    await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens }),
    });

    // capturedInsertValues[1] is the theme_versions insert payload
    const versionPayload = capturedInsertValues[1] as { tokens: unknown; createdBy: string };
    expect(versionPayload.createdBy).toBe("admin-1");
    expect(versionPayload.tokens).toEqual(tokens);
  });

  it("WHERE clause on GET / contains the singleton id=1", async () => {
    // We fire GET so the WHERE clause from dbSelectThemeSettings is captured
    selectQueue.push([mkThemeRow()]);
    const { harness } = makeHarness();
    await harness.request("/");

    // capturedWhereArgs[0] is from dbSelectThemeSettings → .where(eq(themeSettings.id, 1))
    // collectPrimitives walks the Drizzle eq() AST and finds the literal value 1
    const primitives = collectPrimitives(capturedWhereArgs[0]);
    expect(primitives).toContain(1);
  });

  it("requires admin — 401 when unauthenticated", async () => {
    const { harness } = makeUnauthenticatedHarness();
    const res = await harness.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokens: { "--primary": "#6b1d1d" } }),
    });
    expect(res.status).toBe(401);
  });
});

// ── GET /versions — list version history ─────────────────────────────────────

describe("GET /versions (theme)", () => {
  it("returns empty array when select returns no rows", async () => {
    selectQueue.push([]); // dbSelectThemeVersions → empty
    const { harness } = makeHarness();
    const res = await harness.request("/versions");
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(body).toHaveLength(0);
  });

  it("returns the version list from the DB select in order", async () => {
    const v1 = mkVersionRow({ "--primary": "#bbbbbb" }, "ver-newer");
    const v2 = mkVersionRow({ "--primary": "#aaaaaa" }, "ver-older");
    selectQueue.push([v1, v2]); // DB returns newest-first (ordered by created_at DESC)

    const { harness } = makeHarness();
    const res = await harness.request("/versions");
    expect(res.status).toBe(200);
    const versions = (await res.json()) as Array<{ id: string; tokens: Record<string, unknown> }>;
    expect(versions).toHaveLength(2);
    expect(versions[0].id).toBe("ver-newer");
    expect(versions[1].id).toBe("ver-older");
  });
});

// ── POST /versions/:id/restore ────────────────────────────────────────────────

describe("POST /versions/:id/restore (theme)", () => {
  it("loads the version by id and re-saves its tokens as the new current", async () => {
    const oldTokens = { "--primary": "#111111" };
    // Valid UUID v4: version digit = 4, variant bits = a
    const versionId = "550e8400-e29b-41d4-a716-446655440000";

    // dbSelectThemeVersionById → one version row
    selectQueue.push([mkVersionRow(oldTokens, versionId)]);
    // dbUpsertThemeSettings → singleton row updated with restored tokens
    insertQueue.push([mkThemeRow(oldTokens)]);
    // dbInsertThemeVersion → new version row for the restore event
    insertQueue.push([mkVersionRow(oldTokens, "a0e6e6e6-e29b-41d4-a716-446655440001")]);

    const { harness } = makeHarness();
    const res = await harness.request(`/versions/${versionId}/restore`, {
      method: "POST",
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { tokens: Record<string, unknown> };
    expect(body.tokens["--primary"]).toBe("#111111");

    // The tokens in the upsert payload must match the historical version's tokens
    const upsertPayload = capturedInsertValues[0] as { tokens: Record<string, unknown> };
    expect(upsertPayload.tokens["--primary"]).toBe("#111111");
  });

  it("returns 404 when the version id does not match any row", async () => {
    selectQueue.push([]); // dbSelectThemeVersionById → no row
    // nil UUID is a valid special case accepted by Zod's uuid validator
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const { harness } = makeHarness();
    const res = await harness.request(`/versions/${fakeId}/restore`, {
      method: "POST",
    });
    expect(res.status).toBe(404);
  });
});

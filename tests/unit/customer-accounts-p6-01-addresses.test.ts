/**
 * P6-01: Address CRUD mutation-proof tests.
 *
 * Mocks @/db at the drizzle builder level (NOT @/db/queries/*) so the REAL
 * route handler code runs and we can inspect WHERE/SET predicates.
 *
 * TEST DISCIPLINE: We walk the WHERE argument with collectPrimitives to assert
 * that:
 *   - GET /addresses scopes to the session userId
 *   - POST /addresses inserts with the session userId
 *   - PATCH /addresses/{id} checks ownership (userId AND id in WHERE)
 *   - DELETE /addresses/{id} checks ownership (userId AND id in WHERE)
 *   - set-default clears OTHER addresses via ne(addresses.id, newId)
 *   - exactly one default is enforced per user
 *
 * Removing the userId predicate from any of those operations MUST cause the
 * corresponding test to fail.
 *
 * NOTE: The PATCH/DELETE routes use idParamSchema (z.string().uuid()) which
 * uses a strict RFC-4122 variant check. All address IDs here are real v4 UUIDs.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── collectPrimitives: walks Drizzle SQL AST ─────────────────────────────────
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

// ── Fixed UUIDs for use in test requests (valid RFC-4122 v4) ─────────────────
const USER_CREATE      = "3a706acb-c058-41b2-adfd-8e9197c6cbe0";
const USER_PATCH       = "d47e14ea-9cdf-4236-974e-c4c8b7fcbf4f";
const USER_DELETE      = "8395c465-8153-466c-971f-10caff3a19f5";
const USER_DEFAULT     = "d50fd96a-ef22-4d5a-869a-2c00801f8ab8";
const USER_ONE_DEFAULT = "54059dfe-60db-4e00-bfbb-f0969d70881f";

const ADDR_NEW           = "c78ccc24-3c54-427e-8c68-3756ccdc710d";
const ADDR_EXISTING      = "1de63c85-b7f8-4d89-90f8-6008a37b60a6";
const ADDR_DELETE        = "bcd30d19-c17f-4277-9041-65404d5de9a3";
const ADDR_PATCH_DEFAULT = "34b49a5b-4e71-41e3-85d2-54daaac551a2";

// ─────────────────────────────────────────────────────────────────────────────
// Mock @/db at the drizzle builder level
//
// The addresses route uses these chains:
//   GET:    select().from().where().orderBy().limit()
//   POST:   insert().values().returning()
//           update().set().where()          (clear others)
//           update().set().where()          (set users.defaultAddressId)
//   PATCH:  select().from().where().limit() (ownership check)
//           update().set().where().returning()
//           update().set().where()          (clear others if isDefault)
//           update().set().where()          (set users.defaultAddressId)
//   DELETE: delete().where().returning()
//           update().set().where()          (clear users.defaultAddressId)
// ─────────────────────────────────────────────────────────────────────────────

let capturedSelectWhereArgs: unknown[] = [];
let capturedInsertValues: unknown[] = [];
let capturedUpdateSetArgs: unknown[] = [];
let capturedUpdateWhereArgs: unknown[] = [];
let capturedDeleteWhereArgs: unknown[] = [];

// ── Builder mock factories ────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[] = []) {
  const limitMock = vi.fn().mockResolvedValue(rows);
  const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
  const whereMock = vi.fn().mockImplementation((arg) => {
    capturedSelectWhereArgs.push(arg);
    return { orderBy: orderByMock, limit: limitMock };
  });
  const fromMock = vi.fn().mockReturnValue({ where: whereMock });
  return { from: fromMock };
}

function makeInsertChain(returnedRow: unknown = null) {
  const returningMock = vi.fn().mockResolvedValue(returnedRow ? [returnedRow] : []);
  const valuesMock = vi.fn().mockImplementation((vals) => {
    capturedInsertValues.push(vals);
    return { returning: returningMock };
  });
  return { values: valuesMock };
}

function makeUpdateChain(returnedRow: unknown = null) {
  const returningMock = vi.fn().mockResolvedValue(returnedRow ? [returnedRow] : []);
  const whereMock = vi.fn().mockImplementation((arg) => {
    capturedUpdateWhereArgs.push(arg);
    return { returning: returningMock };
  });
  const setMock = vi.fn().mockImplementation((vals) => {
    capturedUpdateSetArgs.push(vals);
    return { where: whereMock };
  });
  return { set: setMock };
}

function makeDeleteChain(deletedIds: string[] = []) {
  const returningMock = vi.fn().mockResolvedValue(deletedIds.map((id) => ({ id })));
  const whereMock = vi.fn().mockImplementation((arg) => {
    capturedDeleteWhereArgs.push(arg);
    return { returning: returningMock };
  });
  return { where: whereMock };
}

// ── Stateful mock db ──────────────────────────────────────────────────────────

let currentSelectChain: ReturnType<typeof makeSelectChain> = makeSelectChain();
let currentInsertChain: ReturnType<typeof makeInsertChain> = makeInsertChain();
let updateChains: Array<ReturnType<typeof makeUpdateChain>> = [];
let updateCallIndex = 0;
let currentDeleteChain: ReturnType<typeof makeDeleteChain> = makeDeleteChain();

const mockDb = {
  select: vi.fn(() => currentSelectChain),
  insert: vi.fn(() => currentInsertChain),
  update: vi.fn(() => {
    const chain = updateChains[updateCallIndex] ?? makeUpdateChain();
    updateCallIndex++;
    return chain;
  }),
  delete: vi.fn(() => currentDeleteChain),
};

vi.mock("@/db", () => ({
  db: mockDb,
  withRetry: (fn: () => unknown) => fn(),
}));

/**
 * Reset captured state and rebuild mock chains before each test.
 */
function resetDb({
  selectRows = [] as unknown[],
  insertRow = null as unknown,
  updateRows = [] as Array<unknown>,
  deleteIds = [] as string[],
} = {}) {
  capturedSelectWhereArgs = [];
  capturedInsertValues = [];
  capturedUpdateSetArgs = [];
  capturedUpdateWhereArgs = [];
  capturedDeleteWhereArgs = [];
  updateCallIndex = 0;

  currentSelectChain = makeSelectChain(selectRows);
  currentInsertChain = makeInsertChain(insertRow);
  updateChains = updateRows.map((row) => makeUpdateChain(row));
  // Pad with generic no-op chains in case the route calls update() more times
  for (let i = updateChains.length; i < 10; i++) {
    updateChains.push(makeUpdateChain());
  }
  currentDeleteChain = makeDeleteChain(deleteIds);

  mockDb.select.mockReset();
  mockDb.insert.mockReset();
  mockDb.update.mockReset();
  mockDb.delete.mockReset();

  mockDb.select.mockImplementation(() => currentSelectChain);
  mockDb.insert.mockImplementation(() => currentInsertChain);
  mockDb.update.mockImplementation(() => {
    const chain = updateChains[updateCallIndex] ?? makeUpdateChain();
    updateCallIndex++;
    return chain;
  });
  mockDb.delete.mockImplementation(() => currentDeleteChain);
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1: GET /addresses — auth-scoped WHERE predicate
// ─────────────────────────────────────────────────────────────────────────────

describe("GET /addresses — auth-scoping WHERE predicate (mutation-proof)", () => {
  beforeEach(() => resetDb({ selectRows: [] }));

  it("returns 401 for unauthenticated requests", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({ register: registerAddressRoutes, authUser: null });

    const res = await request("/");
    expect(res.status).toBe(401);
  });

  it("includes the session userId in the SELECT WHERE predicate", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_CREATE, email: "user@example.com", role: "customer" },
    });

    await request("/");

    const whereArg = capturedSelectWhereArgs[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain(USER_CREATE);
  });

  it("MUTATION-PROOF: a different userId does NOT appear in the WHERE predicate for another user's session", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_CREATE, email: "a@example.com", role: "customer" },
    });

    await request("/");

    const whereArg = capturedSelectWhereArgs[0];
    const primitives = collectPrimitives(whereArg);
    // The session user is USER_CREATE; USER_PATCH must NOT appear
    expect(primitives).not.toContain(USER_PATCH);
    // And the actual session userId MUST appear
    expect(primitives).toContain(USER_CREATE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2: POST /addresses — insert scoped to session userId
// ─────────────────────────────────────────────────────────────────────────────

const addressBody = {
  line1: "123 Main St",
  city: "Mumbai",
  country: "India",
  postalCode: "400001",
};

const makeMockAddressRow = (overrides: Record<string, unknown> = {}) => ({
  id: ADDR_NEW,
  userId: USER_CREATE,
  line1: "123 Main St",
  line2: null,
  city: "Mumbai",
  state: null,
  country: "India",
  postalCode: "400001",
  label: "",
  name: "",
  phone: "",
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("POST /addresses — insert auth-scoped to session userId (mutation-proof)", () => {
  beforeEach(() =>
    resetDb({ insertRow: makeMockAddressRow({ userId: USER_CREATE }) })
  );

  it("returns 401 for unauthenticated requests", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({ register: registerAddressRoutes, authUser: null });

    const res = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addressBody),
    });
    expect(res.status).toBe(401);
  });

  it("inserts the address with the session userId (not from the request body)", async () => {
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_CREATE, email: "c@example.com", role: "customer" },
    });

    const res = await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(addressBody),
    });

    expect(res.status).toBe(201);
    // The values() call must have received the session userId, not a client-supplied one
    expect(capturedInsertValues.length).toBeGreaterThanOrEqual(1);
    const insertedValues = capturedInsertValues[0] as Record<string, unknown>;
    expect(insertedValues.userId).toBe(USER_CREATE);
  });

  it("MUTATION-PROOF: inserting with isDefault=true clears other addresses via ne() predicate", async () => {
    // When isDefault is true, the route calls db.update(addresses).set({ isDefault: false })
    // WHERE userId = session.userId AND id != newAddress.id
    // This ensures exactly one default per user.
    resetDb({
      insertRow: makeMockAddressRow({ id: ADDR_NEW, userId: USER_DEFAULT, isDefault: true }),
      updateRows: [null, null],
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_DEFAULT, email: "d@example.com", role: "customer" },
    });

    await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addressBody, isDefault: true }),
    });

    // The first update() call clears other addresses:
    // WHERE eq(addresses.userId, userId) AND ne(addresses.id, newAddressId)
    expect(capturedUpdateWhereArgs.length).toBeGreaterThanOrEqual(1);
    const clearOthersWhere = capturedUpdateWhereArgs[0];
    const clearPrimitives = collectPrimitives(clearOthersWhere);
    // Session userId must appear (scoping)
    expect(clearPrimitives).toContain(USER_DEFAULT);
    // The new address id must appear (ne predicate excludes the new address)
    expect(clearPrimitives).toContain(ADDR_NEW);

    // The second update() sets users.defaultAddressId — must be scoped to session userId
    const setDefaultWhere = capturedUpdateWhereArgs[1];
    const setDefaultPrimitives = collectPrimitives(setDefaultWhere);
    expect(setDefaultPrimitives).toContain(USER_DEFAULT);

    // The update SET for clearing others must have isDefault: false
    const clearOthersSet = capturedUpdateSetArgs[0] as Record<string, unknown>;
    expect(clearOthersSet.isDefault).toBe(false);
  });

  it("MUTATION-PROOF: exactly one default — isDefault=false does NOT trigger the clear-others update", async () => {
    resetDb({ insertRow: makeMockAddressRow({ isDefault: false }) });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_CREATE, email: "nd@example.com", role: "customer" },
    });

    await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addressBody, isDefault: false }),
    });

    // No update should have been called (isDefault is false, no clearing needed)
    expect(capturedUpdateWhereArgs.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3: PATCH /addresses/{id} — ownership check in WHERE predicates
//
// NOTE: idParamSchema uses z.string().uuid() with strict RFC-4122 variant check.
// All test address IDs must be real v4 UUIDs.
// ─────────────────────────────────────────────────────────────────────────────

const makeMockExistingAddress = (overrides: Record<string, unknown> = {}) => ({
  id: ADDR_EXISTING,
  userId: USER_PATCH,
  line1: "456 Park Ave",
  line2: null,
  city: "Delhi",
  state: null,
  country: "India",
  postalCode: "110001",
  label: "",
  name: "",
  phone: "",
  isDefault: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

describe("PATCH /addresses/{id} — ownership predicate (mutation-proof)", () => {
  it("returns 404 when address not found (ownership check via WHERE userId + id)", async () => {
    // Select returns empty → address not found for this user
    resetDb({ selectRows: [] });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_PATCH, email: "p@example.com", role: "customer" },
    });

    const res = await request(`/${ADDR_EXISTING}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: "Bangalore" }),
    });

    expect(res.status).toBe(404);

    // The SELECT WHERE must have contained BOTH the address id AND the userId
    const whereArg = capturedSelectWhereArgs[0];
    const primitives = collectPrimitives(whereArg);
    expect(primitives).toContain(USER_PATCH);
    expect(primitives).toContain(ADDR_EXISTING);
  });

  it("MUTATION-PROOF: the ownership SELECT WHERE contains both userId and addressId", async () => {
    // Return the address to allow the update to proceed
    const updatedRow = makeMockExistingAddress({ city: "Bangalore" });
    resetDb({
      selectRows: [makeMockExistingAddress()],
      updateRows: [updatedRow],
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_PATCH, email: "p@example.com", role: "customer" },
    });

    await request(`/${ADDR_EXISTING}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: "Bangalore" }),
    });

    // The ownership check SELECT WHERE must contain both
    const ownershipWhere = capturedSelectWhereArgs[0];
    const primitives = collectPrimitives(ownershipWhere);
    expect(primitives).toContain(USER_PATCH);
    expect(primitives).toContain(ADDR_EXISTING);
  });

  it("MUTATION-PROOF: the update WHERE also contains both userId and addressId", async () => {
    const updatedRow = makeMockExistingAddress({ city: "Bangalore" });
    resetDb({
      selectRows: [makeMockExistingAddress()],
      updateRows: [updatedRow],
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_PATCH, email: "p@example.com", role: "customer" },
    });

    await request(`/${ADDR_EXISTING}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: "Bangalore" }),
    });

    // Update WHERE must also contain both (prevents IDOR by missing userId in UPDATE)
    expect(capturedUpdateWhereArgs.length).toBeGreaterThanOrEqual(1);
    const updateWhere = capturedUpdateWhereArgs[0];
    const updatePrimitives = collectPrimitives(updateWhere);
    expect(updatePrimitives).toContain(USER_PATCH);
    expect(updatePrimitives).toContain(ADDR_EXISTING);
  });

  it("MUTATION-PROOF: set-default on PATCH clears OTHER addresses via ne() and updates users.defaultAddressId", async () => {
    const updatedRow = makeMockExistingAddress({ isDefault: true });
    resetDb({
      selectRows: [makeMockExistingAddress()],
      updateRows: [
        updatedRow,    // the PATCH update (update() call 0)
        null,          // clear others' isDefault (update() call 1)
        null,          // set users.defaultAddressId (update() call 2)
      ],
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_PATCH, email: "p@example.com", role: "customer" },
    });

    await request(`/${ADDR_EXISTING}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });

    // Three update() calls: main update, clear others, set users.defaultAddressId
    // capturedUpdateWhereArgs[0] = main update WHERE
    // capturedUpdateWhereArgs[1] = clear others WHERE (must have userId AND ne addressId)
    expect(capturedUpdateWhereArgs.length).toBeGreaterThanOrEqual(2);

    // Second update (clear others): WHERE userId = session.userId AND id != updated.id
    const clearOthersWhere = capturedUpdateWhereArgs[1];
    const clearPrimitives = collectPrimitives(clearOthersWhere);
    expect(clearPrimitives).toContain(USER_PATCH);
    expect(clearPrimitives).toContain(ADDR_EXISTING);

    // The SET for clearing others must have isDefault: false
    const clearOthersSet = capturedUpdateSetArgs[1] as Record<string, unknown>;
    expect(clearOthersSet.isDefault).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4: DELETE /addresses/{id} — ownership predicate in WHERE
// ─────────────────────────────────────────────────────────────────────────────

describe("DELETE /addresses/{id} — ownership predicate (mutation-proof)", () => {
  it("returns 401 for unauthenticated requests", async () => {
    resetDb({ deleteIds: [] });
    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({ register: registerAddressRoutes, authUser: null });

    const res = await request(`/${ADDR_DELETE}`, { method: "DELETE" });
    expect(res.status).toBe(401);
  });

  it("returns 404 when the address is not found for this user (ownership via WHERE userId + id)", async () => {
    resetDb({ deleteIds: [] }); // empty = no rows deleted

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_DELETE, email: "del@example.com", role: "customer" },
    });

    const res = await request(`/${ADDR_DELETE}`, { method: "DELETE" });
    expect(res.status).toBe(404);

    // DELETE WHERE must contain BOTH address id AND userId
    const deleteWhere = capturedDeleteWhereArgs[0];
    const primitives = collectPrimitives(deleteWhere);
    expect(primitives).toContain(USER_DELETE);
    expect(primitives).toContain(ADDR_DELETE);
  });

  it("MUTATION-PROOF: DELETE WHERE contains both userId and addressId", async () => {
    resetDb({ deleteIds: [ADDR_DELETE] });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_DELETE, email: "del@example.com", role: "customer" },
    });

    const res = await request(`/${ADDR_DELETE}`, { method: "DELETE" });
    expect(res.status).toBe(200);

    // DELETE WHERE must contain BOTH address id AND userId
    const deleteWhere = capturedDeleteWhereArgs[0];
    const primitives = collectPrimitives(deleteWhere);
    expect(primitives).toContain(USER_DELETE);
    expect(primitives).toContain(ADDR_DELETE);
  });

  it("MUTATION-PROOF: after delete, the users.defaultAddressId update scopes to the session userId", async () => {
    resetDb({ deleteIds: [ADDR_DELETE] });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_DELETE, email: "del@example.com", role: "customer" },
    });

    await request(`/${ADDR_DELETE}`, { method: "DELETE" });

    // The update after delete scopes to the session userId
    expect(capturedUpdateWhereArgs.length).toBeGreaterThanOrEqual(1);
    const updateWhere = capturedUpdateWhereArgs[0];
    const primitives = collectPrimitives(updateWhere);
    expect(primitives).toContain(USER_DELETE);

    // SET must include defaultAddressId: null
    const updateSet = capturedUpdateSetArgs[0] as Record<string, unknown>;
    expect(updateSet.defaultAddressId).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5: One-default invariant — behavioral proof
// ─────────────────────────────────────────────────────────────────────────────

describe("Address CRUD — exactly-one-default invariant (behavioral proof)", () => {
  it("POST with isDefault=true sets SET { isDefault: false } on the clear-others update", async () => {
    resetDb({
      insertRow: makeMockAddressRow({ id: ADDR_NEW, userId: USER_ONE_DEFAULT, isDefault: true }),
      updateRows: [null, null],
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_ONE_DEFAULT, email: "od@example.com", role: "customer" },
    });

    await request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...addressBody, isDefault: true }),
    });

    // First update = clear others (SET isDefault: false)
    const clearSet = capturedUpdateSetArgs[0] as Record<string, unknown>;
    expect(clearSet.isDefault).toBe(false);

    // Second update = set users.defaultAddressId (SET defaultAddressId: newId)
    const setUserDefault = capturedUpdateSetArgs[1] as Record<string, unknown>;
    expect(setUserDefault.defaultAddressId).toBe(ADDR_NEW);
  });

  it("PATCH with isDefault=true clears others and sets users.defaultAddressId to the patched address", async () => {
    const updatedAddr = makeMockExistingAddress({ id: ADDR_PATCH_DEFAULT, isDefault: true });
    resetDb({
      selectRows: [makeMockExistingAddress({ id: ADDR_PATCH_DEFAULT })],
      updateRows: [updatedAddr, null, null],
    });

    const { createRouteHarness } = await import("../helpers/route-harness");
    const { registerAddressRoutes } = await import("@/api/hono/routes/addresses");
    const { request } = createRouteHarness({
      register: registerAddressRoutes,
      authUser: { id: USER_PATCH, email: "p@example.com", role: "customer" },
    });

    await request(`/${ADDR_PATCH_DEFAULT}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });

    // Second update call (index 1) = clear others' isDefault
    const clearSet = capturedUpdateSetArgs[1] as Record<string, unknown>;
    expect(clearSet.isDefault).toBe(false);

    // Third update call (index 2) = set users.defaultAddressId
    const setUserDefault = capturedUpdateSetArgs[2] as Record<string, unknown>;
    expect(setUserDefault.defaultAddressId).toBe(ADDR_PATCH_DEFAULT);
  });
});

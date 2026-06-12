import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- hoisted mocks ----

// db.select chain: .from().where().limit()
const limitMock = vi.hoisted(() => vi.fn());
const whereMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());
const selectMock = vi.hoisted(() => vi.fn());

// db.insert chain: .values().returning()
const returningMock = vi.hoisted(() => vi.fn());
const valuesMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());

vi.mock("@/db", () => ({
  db: {
    select: selectMock,
    insert: insertMock,
  },
  withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

vi.mock("@/db/schema", () => ({
  addresses: { id: "id" },
  users: { email: "email", id: "id", defaultAddressId: "defaultAddressId" },
}));

vi.mock("@/db/results", () => ({
  getFirstRow: (rows: unknown[]) => rows[0] ?? null,
  requireFirstRow: (rows: unknown[], msg: string) => {
    if (!rows[0]) throw new Error(msg);
    return rows[0];
  },
}));

vi.mock("drizzle-orm", () => ({
  desc: (col: unknown) => ({ _desc: col }),
  eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
  inArray: (col: unknown, vals: unknown) => ({ _inArray: [col, vals] }),
}));

import { getOrCreateCheckoutCustomer } from "@/db/queries/users";

// ---- shared helpers ----

const REGISTERED_USER = {
  id: "user-registered-1",
  email: "registered@test.com",
  passwordHash: "bcrypt$hashed",
  name: "Registered User",
  phone: "9999999990",
  role: "customer" as const,
  defaultAddressId: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  metadata: {},
};

const CHECKOUT_SHELL_USER = {
  id: "user-shell-1",
  email: "guest@test.com",
  passwordHash: null,
  name: "Guest User",
  phone: "9999999991",
  role: "customer" as const,
  defaultAddressId: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  metadata: { source: "checkout" },
};

const FRESH_USER = {
  id: "user-new-1",
  email: "fresh@test.com",
  passwordHash: null,
  name: "Fresh User",
  phone: "9999999992",
  role: "customer" as const,
  defaultAddressId: null,
  createdAt: new Date("2024-01-01"),
  updatedAt: new Date("2024-01-01"),
  metadata: { source: "checkout" },
};

/**
 * Wire the db.select chain so `.from().where().limit()` returns `rows`.
 * Used to simulate getUserByEmail returning a user or null.
 */
function mockSelectReturning(rows: unknown[]) {
  selectMock.mockReturnValue({ from: fromMock });
  fromMock.mockReturnValue({ where: whereMock });
  whereMock.mockReturnValue({ limit: limitMock });
  limitMock.mockResolvedValue(rows);
}

describe("getOrCreateCheckoutCustomer", () => {
  beforeEach(() => {
    selectMock.mockReset();
    insertMock.mockReset();
    fromMock.mockReset();
    whereMock.mockReset();
    limitMock.mockReset();
    returningMock.mockReset();
    valuesMock.mockReset();
  });

  describe("Test 1: REGISTERED user — returns null", () => {
    it("returns null when getUserByEmail finds a user with a passwordHash", async () => {
      // getUserByEmail → returns a registered user (has passwordHash)
      // First select: the user lookup
      // Second select would be hydrateUsers' address lookup — but since we return null early,
      // hydrateUsers is never called.
      selectMock.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({ limit: limitMock });
      // First call: user lookup → registered user found
      limitMock.mockResolvedValueOnce([REGISTERED_USER]);

      const result = await getOrCreateCheckoutCustomer({
        email: "registered@test.com",
        name: "Registered User",
        phone: "9999999990",
      });

      expect(result).toBeNull();
      // db.insert should NOT have been called
      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  describe("Test 2: CHECKOUT SHELL user — reuses existing guest", () => {
    it("returns existing checkout-shell user when passwordHash is null", async () => {
      selectMock.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({ limit: limitMock });
      // First call: user lookup → checkout shell found (no passwordHash)
      limitMock.mockResolvedValueOnce([CHECKOUT_SHELL_USER]);
      // Second call: hydrateUsers address lookup → no addresses
      limitMock.mockResolvedValueOnce([]);

      const result = await getOrCreateCheckoutCustomer({
        email: "guest@test.com",
        name: "Guest User",
        phone: "9999999991",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(CHECKOUT_SHELL_USER.id);
      expect(result?.email).toBe(CHECKOUT_SHELL_USER.email);
      expect(result?.passwordHash).toBeNull();
      // db.insert should NOT have been called
      expect(insertMock).not.toHaveBeenCalled();
    });
  });

  describe("Test 3: FRESH email — creates new checkout shell", () => {
    it("creates a new shell user when email is not found", async () => {
      selectMock.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({ limit: limitMock });
      // First call: user lookup → not found
      limitMock.mockResolvedValueOnce([]);
      // hydrateUsers address lookup for created user → no addresses
      limitMock.mockResolvedValueOnce([]);

      // Wire db.insert chain
      insertMock.mockReturnValue({ values: valuesMock });
      valuesMock.mockReturnValue({ returning: returningMock });
      returningMock.mockResolvedValue([FRESH_USER]);

      const result = await getOrCreateCheckoutCustomer({
        email: "fresh@test.com",
        name: "Fresh User",
        phone: "9999999992",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(FRESH_USER.id);
      expect(result?.email).toBe(FRESH_USER.email);
      // db.insert should have been called once
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Test 4: RACE + REGISTERED — insert race, re-fetch finds registered user", () => {
    it("returns null when insert races and re-fetch finds a user with passwordHash", async () => {
      selectMock.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({ limit: limitMock });
      // First call: initial getUserByEmail → not found (no existing user)
      limitMock.mockResolvedValueOnce([]);
      // Second call: catch-block getUserByEmail → finds registered user (has passwordHash)
      limitMock.mockResolvedValueOnce([REGISTERED_USER]);
      // Third call: hydrateUsers for the registered user → no addresses
      limitMock.mockResolvedValueOnce([]);

      // db.insert throws a constraint error (simulating race)
      const constraintError = new Error("duplicate key value violates unique constraint");
      insertMock.mockReturnValue({ values: valuesMock });
      valuesMock.mockReturnValue({ returning: returningMock });
      returningMock.mockRejectedValueOnce(constraintError);

      const result = await getOrCreateCheckoutCustomer({
        email: "registered@test.com",
        name: "Registered User",
        phone: "9999999990",
      });

      expect(result).toBeNull();
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe("Test 5: RACE + SHELL — insert race, re-fetch finds shell user", () => {
    it("returns the shell user when insert races and re-fetch finds a user with passwordHash: null", async () => {
      selectMock.mockReturnValue({ from: fromMock });
      fromMock.mockReturnValue({ where: whereMock });
      whereMock.mockReturnValue({ limit: limitMock });
      // First call: initial getUserByEmail → not found
      limitMock.mockResolvedValueOnce([]);
      // Second call: catch-block getUserByEmail → finds checkout shell (no passwordHash)
      limitMock.mockResolvedValueOnce([CHECKOUT_SHELL_USER]);
      // Third call: hydrateUsers address lookup for the shell user → no addresses
      limitMock.mockResolvedValueOnce([]);

      // db.insert throws a constraint error (simulating race)
      const constraintError = new Error("duplicate key value violates unique constraint");
      insertMock.mockReturnValue({ values: valuesMock });
      valuesMock.mockReturnValue({ returning: returningMock });
      returningMock.mockRejectedValueOnce(constraintError);

      const result = await getOrCreateCheckoutCustomer({
        email: "guest@test.com",
        name: "Guest User",
        phone: "9999999991",
      });

      expect(result).not.toBeNull();
      expect(result?.id).toBe(CHECKOUT_SHELL_USER.id);
      expect(result?.email).toBe(CHECKOUT_SHELL_USER.email);
      expect(result?.passwordHash).toBeNull();
      expect(insertMock).toHaveBeenCalledTimes(1);
    });
  });
});

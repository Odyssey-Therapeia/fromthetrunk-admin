import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- hoisted mocks ----

const claimCheckoutShellMock = vi.hoisted(() => vi.fn());
const getUserByEmailMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const hashMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const listUsersMock = vi.hoisted(() => vi.fn());
const returningMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());
const valuesMock = vi.hoisted(() => vi.fn());
const sendEmailMock = vi.hoisted(() => vi.fn());

vi.mock("bcryptjs", () => ({
  default: {
    compare: vi.fn(),
    hash: hashMock,
  },
}));

vi.mock("@/db", () => ({
  db: {
    insert: insertMock,
  },
}));

vi.mock("@/db/queries/users", () => ({
  claimCheckoutShell: claimCheckoutShellMock,
  getUserByEmail: getUserByEmailMock,
  getUserById: getUserByIdMock,
  listUsers: listUsersMock,
  updateUser: updateUserMock,
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/email/templates", () => ({
  welcomeEmail: vi.fn(() => ({ subject: "Welcome", html: "<p>Welcome</p>" })),
}));

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: vi.fn(() => null),
}));

import { registerUserRoutes } from "@/api/hono/routes/users";
import type { HonoBindings } from "@/api/hono/types";

const createUsersApp = () => {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", null);
    await next();
  });
  registerUserRoutes(app);
  return app;
};

const SIGN_UP_BODY = {
  email: "user@example.com",
  name: "Test User",
  password: "SecurePass123",
};

describe("POST /sign-up — shell claim logic", () => {
  beforeEach(() => {
    claimCheckoutShellMock.mockReset();
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    hashMock.mockReset();
    insertMock.mockReset();
    listUsersMock.mockReset();
    returningMock.mockReset();
    updateUserMock.mockReset();
    valuesMock.mockReset();
    sendEmailMock.mockReset();

    insertMock.mockReturnValue({ values: valuesMock });
    valuesMock.mockReturnValue({ returning: returningMock });
    sendEmailMock.mockResolvedValue(undefined);
  });

  it("Test 1 — shell claim: upgrades checkout shell to full account (201)", async () => {
    const shellUser = {
      id: "shell-user-id",
      email: "user@example.com",
      passwordHash: null,
      name: "Guest",
      phone: null,
      role: "customer" as const,
      defaultAddressId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      metadata: { source: "checkout" },
      defaultAddress: null,
    };

    const upgradedUser = {
      ...shellUser,
      name: "Test User",
      passwordHash: "hashed-password",
    };

    getUserByEmailMock.mockResolvedValue(shellUser);
    hashMock.mockResolvedValue("hashed-password");
    claimCheckoutShellMock.mockResolvedValue(upgradedUser);

    const app = createUsersApp();
    const response = await app.request("/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SIGN_UP_BODY),
    });

    expect(response.status).toBe(201);
    // bcrypt.hash must be called with the raw password and cost factor 12
    expect(hashMock).toHaveBeenCalledWith("SecurePass123", 12);
    expect(claimCheckoutShellMock).toHaveBeenCalledWith(
      "shell-user-id",
      expect.objectContaining({
        passwordHash: "hashed-password",
        name: "Test User",
      })
    );
    // Must NOT insert a new row — preserves existing shell and its linked orders
    expect(insertMock).not.toHaveBeenCalled();
    // updateUser must NOT be called; claimCheckoutShell is the atomic upgrade path
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("Test 2 — registered user: returns 409 EMAIL_ALREADY_REGISTERED", async () => {
    const registeredUser = {
      id: "reg-user-id",
      email: "user@example.com",
      passwordHash: "existing-hash",
      name: "Existing User",
      phone: null,
      role: "customer" as const,
      defaultAddressId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      metadata: {},
      defaultAddress: null,
    };

    getUserByEmailMock.mockResolvedValue(registeredUser);

    const app = createUsersApp();
    const response = await app.request("/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SIGN_UP_BODY),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("Test 3 — fresh sign-up: inserts new user row (201)", async () => {
    const newUser = {
      id: "new-user-id",
      email: "user@example.com",
      passwordHash: "hashed-password",
      name: "Test User",
      phone: null,
      role: "customer" as const,
      defaultAddressId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      metadata: {},
      defaultAddress: null,
    };

    getUserByEmailMock.mockResolvedValue(null);
    hashMock.mockResolvedValue("hashed-password");
    returningMock.mockResolvedValue([newUser]);

    const app = createUsersApp();
    const response = await app.request("/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SIGN_UP_BODY),
    });

    expect(response.status).toBe(201);
    // db.insert path taken
    expect(insertMock).toHaveBeenCalledTimes(1);
    // updateUser NOT called for a brand-new user
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("Test 4 — shell claim preserves existing orders: claimCheckoutShell called instead of insert or updateUser", async () => {
    const shellUser = {
      id: "shell-with-orders-id",
      email: "user@example.com",
      passwordHash: null,
      name: null,
      phone: null,
      role: "customer" as const,
      defaultAddressId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      metadata: { source: "checkout" },
      defaultAddress: null,
    };

    getUserByEmailMock.mockResolvedValue(shellUser);
    hashMock.mockResolvedValue("hashed-password");
    claimCheckoutShellMock.mockResolvedValue({ ...shellUser, passwordHash: "hashed-password", name: "Test User" });

    const app = createUsersApp();
    const response = await app.request("/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SIGN_UP_BODY),
    });

    expect(response.status).toBe(201);
    // claimCheckoutShell is the path taken — shell row is upgraded in-place, orders remain linked
    expect(claimCheckoutShellMock).toHaveBeenCalledWith("shell-with-orders-id", expect.any(Object));
    // No new insert — existing shell ID is preserved so order FK references stay intact
    expect(insertMock).not.toHaveBeenCalled();
    // updateUser must not be invoked; the atomic claim function handles the upgrade
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("Test 5 — non-checkout shell (source: import): returns 409 EMAIL_ALREADY_REGISTERED", async () => {
    const importShell = {
      id: "import-shell-id",
      email: "user@example.com",
      passwordHash: null,
      name: "Imported User",
      phone: null,
      role: "customer" as const,
      defaultAddressId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      metadata: { source: "import" },
      defaultAddress: null,
    };

    getUserByEmailMock.mockResolvedValue(importShell);

    const app = createUsersApp();
    const response = await app.request("/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SIGN_UP_BODY),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
    });
    // Neither updateUser nor claimCheckoutShell should be called — source is not "checkout"
    expect(claimCheckoutShellMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("Test 7 — lost race on shell claim: returns 409 EMAIL_ALREADY_REGISTERED, no insert", async () => {
    const shellUser = {
      id: "shell-lost-race-id",
      email: "user@example.com",
      passwordHash: null,
      name: "Guest",
      phone: null,
      role: "customer" as const,
      defaultAddressId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      metadata: { source: "checkout" },
      defaultAddress: null,
    };

    getUserByEmailMock.mockResolvedValue(shellUser);
    hashMock.mockResolvedValue("hashed-password");
    // Simulates lost race: another process claimed the shell first → 0 rows updated → null returned
    claimCheckoutShellMock.mockResolvedValue(null);

    const app = createUsersApp();
    const response = await app.request("/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SIGN_UP_BODY),
    });

    // bcrypt must have run before the claim attempt
    expect(hashMock).toHaveBeenCalledWith("SecurePass123", 12);
    // claimCheckoutShell was invoked but returned null (lost race)
    expect(claimCheckoutShellMock).toHaveBeenCalledWith(
      "shell-lost-race-id",
      expect.objectContaining({ passwordHash: "hashed-password" })
    );
    // Lost race → conflict response
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
    });
    // No duplicate insert must be attempted
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("Test 6 — shell with null metadata: returns 409 EMAIL_ALREADY_REGISTERED", async () => {
    const nullMetadataShell = {
      id: "null-meta-shell-id",
      email: "user@example.com",
      passwordHash: null,
      name: null,
      phone: null,
      role: "customer" as const,
      defaultAddressId: null,
      createdAt: new Date("2024-01-01"),
      updatedAt: new Date("2024-01-01"),
      metadata: null,
      defaultAddress: null,
    };

    getUserByEmailMock.mockResolvedValue(nullMetadataShell);

    const app = createUsersApp();
    const response = await app.request("/sign-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(SIGN_UP_BODY),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      code: "EMAIL_ALREADY_REGISTERED",
    });
    // Neither updateUser nor claimCheckoutShell should be called — metadata is null
    expect(claimCheckoutShellMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });
});

import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getUserByEmailMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const hashMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn());
const listUsersMock = vi.hoisted(() => vi.fn());
const returningMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());
const valuesMock = vi.hoisted(() => vi.fn());

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
  getUserByEmail: getUserByEmailMock,
  getUserById: getUserByIdMock,
  listUsers: listUsersMock,
  updateUser: updateUserMock,
}));

import { registerUserRoutes } from "@/api/hono/routes/users";
import type { HonoBindings } from "@/api/hono/types";

const createUsersApp = (authUser: null | { email?: null | string; id: string; role?: null | string }) => {
  const app = new OpenAPIHono<HonoBindings>();
  app.use("*", async (c, next) => {
    c.set("authUser", authUser ?? null);
    await next();
  });
  registerUserRoutes(app);
  return app;
};

describe("admin user management routes", () => {
  beforeEach(() => {
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    hashMock.mockReset();
    insertMock.mockReset();
    listUsersMock.mockReset();
    returningMock.mockReset();
    updateUserMock.mockReset();
    valuesMock.mockReset();

    insertMock.mockReturnValue({
      values: valuesMock,
    });
    valuesMock.mockReturnValue({
      returning: returningMock,
    });
  });

  it("forbids non-admins from creating admin accounts", async () => {
    const response = await createUsersApp({
      email: "customer@example.com",
      id: "user-123",
      role: "customer",
    }).request("/admins", {
      body: JSON.stringify({
        email: "new-admin@example.com",
        name: "New Admin",
        password: "AdminPass123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(403);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("creates a new admin account with a hashed password", async () => {
    getUserByEmailMock.mockResolvedValue(null);
    hashMock.mockResolvedValue("new-admin-hash");
    returningMock.mockResolvedValue([
      {
        email: "new-admin@example.com",
        id: "22222222-2222-4222-8222-222222222222",
        name: "New Admin",
        role: "admin",
      },
    ]);

    const response = await createUsersApp({
      email: "owner@example.com",
      id: "admin-1",
      role: "admin",
    }).request("/admins", {
      body: JSON.stringify({
        email: "new-admin@example.com",
        name: "New Admin",
        password: "AdminPass123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(hashMock).toHaveBeenCalledWith("AdminPass123", 12);
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "new-admin@example.com",
        name: "New Admin",
        passwordHash: "new-admin-hash",
        role: "admin",
      })
    );
  });

  it("rejects resetting the password for a non-admin account", async () => {
    const customerId = "33333333-3333-4333-8333-333333333333";
    getUserByIdMock.mockResolvedValue({
      id: customerId,
      role: "customer",
    });

    const response = await createUsersApp({
      email: "owner@example.com",
      id: "admin-1",
      role: "admin",
    }).request(`/${customerId}/password`, {
      body: JSON.stringify({
        newPassword: "ResetPass123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      code: "ADMIN_PASSWORD_RESET_REQUIRES_ADMIN_TARGET",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("lets an admin reset another admin password", async () => {
    const targetAdminId = "44444444-4444-4444-8444-444444444444";
    getUserByIdMock.mockResolvedValue({
      id: targetAdminId,
      role: "admin",
    });
    hashMock.mockResolvedValue("reset-hash");
    updateUserMock.mockResolvedValue({
      id: targetAdminId,
    });

    const response = await createUsersApp({
      email: "owner@example.com",
      id: "admin-1",
      role: "admin",
    }).request(`/${targetAdminId}/password`, {
      body: JSON.stringify({
        newPassword: "ResetPass123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    expect(hashMock).toHaveBeenCalledWith("ResetPass123", 12);
    expect(updateUserMock).toHaveBeenCalledWith(targetAdminId, {
      passwordHash: "reset-hash",
    });
  });
});

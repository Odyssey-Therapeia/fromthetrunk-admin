import { OpenAPIHono } from "@hono/zod-openapi";
import { beforeEach, describe, expect, it, vi } from "vitest";

const compareMock = vi.hoisted(() => vi.fn());
const getUserByEmailMock = vi.hoisted(() => vi.fn());
const getUserByIdMock = vi.hoisted(() => vi.fn());
const hashMock = vi.hoisted(() => vi.fn());
const listUsersMock = vi.hoisted(() => vi.fn());
const updateUserMock = vi.hoisted(() => vi.fn());

vi.mock("bcryptjs", () => ({
  default: {
    compare: compareMock,
    hash: hashMock,
  },
}));

vi.mock("@/db", () => ({
  db: {},
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

describe("PATCH /me/password", () => {
  beforeEach(() => {
    compareMock.mockReset();
    getUserByEmailMock.mockReset();
    getUserByIdMock.mockReset();
    hashMock.mockReset();
    listUsersMock.mockReset();
    updateUserMock.mockReset();
  });

  it("returns unauthorized when no session is present", async () => {
    const response = await createUsersApp(null).request("/me/password", {
      body: JSON.stringify({
        currentPassword: "Current123",
        newPassword: "NewSecure123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(401);
  });

  it("rejects an invalid current password", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "user-123",
      passwordHash: "stored-hash",
    });
    compareMock.mockResolvedValue(false);

    const response = await createUsersApp({
      email: "admin@example.com",
      id: "user-123",
      role: "admin",
    }).request("/me/password", {
      body: JSON.stringify({
        currentPassword: "WrongPassword123",
        newPassword: "NewSecure123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_CURRENT_PASSWORD",
    });
    expect(updateUserMock).not.toHaveBeenCalled();
  });

  it("hashes and saves the new password after verifying the current one", async () => {
    getUserByIdMock.mockResolvedValue({
      id: "user-123",
      passwordHash: "stored-hash",
    });
    compareMock.mockResolvedValue(true);
    hashMock.mockResolvedValue("new-hash");
    updateUserMock.mockResolvedValue({
      id: "user-123",
    });

    const response = await createUsersApp({
      email: "admin@example.com",
      id: "user-123",
      role: "admin",
    }).request("/me/password", {
      body: JSON.stringify({
        currentPassword: "Current123",
        newPassword: "NewSecure123",
      }),
      headers: {
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
    });
    expect(compareMock).toHaveBeenCalledWith("Current123", "stored-hash");
    expect(hashMock).toHaveBeenCalledWith("NewSecure123", 12);
    expect(updateUserMock).toHaveBeenCalledWith("user-123", {
      passwordHash: "new-hash",
    });
  });
});

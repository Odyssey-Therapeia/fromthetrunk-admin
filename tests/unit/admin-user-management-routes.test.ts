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
import { createRouteHarness } from "../helpers/route-harness";

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
    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { email: "customer@example.com", id: "user-123", role: "customer" },
    });

    const response = await request("/admins", {
      body: JSON.stringify({
        email: "new-admin@example.com",
        name: "New Admin",
        password: "AdminPass123",
      }),
      headers: { "Content-Type": "application/json" },
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

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { email: "owner@example.com", id: "admin-1", role: "admin" },
    });

    const response = await request("/admins", {
      body: JSON.stringify({
        email: "new-admin@example.com",
        name: "New Admin",
        password: "AdminPass123",
      }),
      headers: { "Content-Type": "application/json" },
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

  it("does not expose cross-admin password reset", async () => {
    const targetAdminId = "44444444-4444-4444-8444-444444444444";

    const { request } = createRouteHarness({
      register: registerUserRoutes,
      authUser: { email: "owner@example.com", id: "admin-1", role: "admin" },
    });

    const response = await request(`/${targetAdminId}/password`, {
      body: JSON.stringify({ newPassword: "ResetPass123" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    });

    expect(response.status).toBe(404);
    expect(getUserByIdMock).not.toHaveBeenCalled();
    expect(hashMock).not.toHaveBeenCalled();
    expect(updateUserMock).not.toHaveBeenCalled();
  });

});

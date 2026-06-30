import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

import { authMiddleware } from "@/api/hono/middleware/auth";

type MiddlewareContext = Parameters<typeof authMiddleware>[0];
type MiddlewareNext = Parameters<typeof authMiddleware>[1];

describe("authMiddleware", () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    process.env.NEXTAUTH_SECRET = "test-secret";
  });

  it("passes the original request to getToken", async () => {
    const rawRequest = new Request("http://localhost/api/v2/products/rose-dust-tussar-saree", {
      headers: {
        cookie: "next-auth.session-token=test-token",
      },
    });
    const set = vi.fn();
    const next: MiddlewareNext = vi.fn().mockResolvedValue(undefined);

    getTokenMock.mockResolvedValue({
      email: "admin@example.com",
      role: "admin",
      sub: "user-123",
    });

    await authMiddleware(
      {
        req: { raw: rawRequest },
        set,
      } as unknown as MiddlewareContext,
      next
    );

    expect(getTokenMock).toHaveBeenCalledWith({
      cookieName: "ftt-admin.session-token",
      req: rawRequest,
      secret: "test-secret",
    });
    expect(set).toHaveBeenCalledWith("authUser", {
      email: "admin@example.com",
      id: "user-123",
      role: "admin",
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("stores null when the request is anonymous", async () => {
    const rawRequest = new Request("http://localhost/api/v2/products/rose-dust-tussar-saree");
    const set = vi.fn();
    const next: MiddlewareNext = vi.fn().mockResolvedValue(undefined);

    getTokenMock.mockResolvedValue(null);

    await authMiddleware(
      {
        req: { raw: rawRequest },
        set,
      } as unknown as MiddlewareContext,
      next
    );

    expect(set).toHaveBeenCalledWith("authUser", null);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

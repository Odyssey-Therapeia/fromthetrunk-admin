import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { getServerAuthSession } from "@/lib/auth/get-session";
import { GET, POST, DELETE } from "@/app/api/account/wishlist/route";
import { getPayloadClient } from "@/lib/payload/server";

describe("/api/account/wishlist", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET returns 401 for unauthenticated requests", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("GET returns user wishlist", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as Awaited<ReturnType<typeof getServerAuthSession>>);

    vi.mocked(getPayloadClient).mockResolvedValue({
      findByID: vi.fn().mockResolvedValue({
        id: "user_1",
        wishlist: [{ id: "prod_1", name: "Saree A" }],
      }),
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.wishlist).toHaveLength(1);
  });

  it("POST adds product to wishlist", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as Awaited<ReturnType<typeof getServerAuthSession>>);

    const updateMock = vi.fn().mockResolvedValue({});
    vi.mocked(getPayloadClient).mockResolvedValue({
      findByID: vi.fn().mockResolvedValue({
        id: "user_1",
        wishlist: [],
      }),
      update: updateMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/account/wishlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod_1" }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.added).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wishlist: ["prod_1"],
        }),
      })
    );
  });

  it("DELETE removes product from wishlist", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as Awaited<ReturnType<typeof getServerAuthSession>>);

    const updateMock = vi.fn().mockResolvedValue({});
    vi.mocked(getPayloadClient).mockResolvedValue({
      findByID: vi.fn().mockResolvedValue({
        id: "user_1",
        wishlist: ["prod_1", "prod_2"],
      }),
      update: updateMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/account/wishlist", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod_1" }),
    });

    const response = await DELETE(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.removed).toBe(true);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wishlist: ["prod_2"],
        }),
      })
    );
  });
});

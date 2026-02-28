import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { getServerAuthSession } from "@/lib/auth/get-session";
import { POST } from "@/app/api/cart/reserve/route";
import { getPayloadClient } from "@/lib/payload/server";

describe("POST /api/cart/reserve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    const request = new Request("http://localhost/api/cart/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod_1" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 409 for sold items", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as Awaited<ReturnType<typeof getServerAuthSession>>);

    vi.mocked(getPayloadClient).mockResolvedValue({
      findByID: vi.fn().mockResolvedValue({
        id: "prod_1",
        stockStatus: "sold",
      }),
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/cart/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod_1" }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.code).toBe("ITEM_SOLD");
  });

  it("reserves an available item", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as Awaited<ReturnType<typeof getServerAuthSession>>);

    const updateMock = vi.fn().mockResolvedValue({});
    vi.mocked(getPayloadClient).mockResolvedValue({
      findByID: vi.fn().mockResolvedValue({
        id: "prod_1",
        stockStatus: "available",
      }),
      update: updateMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/cart/reserve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: "prod_1" }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.reserved).toBe(true);
    expect(body.reservedUntil).toBeDefined();
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "products",
        id: "prod_1",
        data: expect.objectContaining({ stockStatus: "reserved" }),
      })
    );
  });
});

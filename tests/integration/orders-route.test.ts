import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { getServerAuthSession } from "@/lib/auth/get-session";
import { POST } from "@/app/api/orders/route";
import { getPayloadClient } from "@/lib/payload/server";

const shippingAddress = {
  city: "Mumbai",
  country: "India",
  email: "buyer@example.com",
  line1: "12 Heritage Lane",
  name: "A Buyer",
  phone: "+91 99999 00000",
  postalCode: "400001",
  state: "MH",
};

describe("/api/orders POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    const request = new Request("http://localhost/api/orders", {
      body: JSON.stringify({ items: [], shippingAddress }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      code: "UNAUTHORIZED",
      message: "Unauthorized",
    });
  });

  it("stores canonical prices and subtotal despite tampered client fields", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as any);

    const findMock = vi.fn().mockResolvedValue({
      docs: [
        {
          id: "prod_1",
          images: [{ url: "/media/prod-1.jpg" }],
          name: "Canonical Saree",
          price: 275,
          status: "published",
        },
      ],
    });
    const createMock = vi.fn().mockImplementation(async ({ data }) => ({
      id: "order_1",
      ...data,
    }));

    vi.mocked(getPayloadClient).mockResolvedValue({
      create: createMock,
      find: findMock,
    } as any);

    const request = new Request("http://localhost/api/orders", {
      body: JSON.stringify({
        items: [
          {
            productId: "prod_1",
            quantity: 2,
            price: 1,
            name: "Tampered Name",
          },
        ],
        shippingAddress,
        subtotal: 2,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.order).toMatchObject({
      id: "order_1",
      subtotal: 550,
    });

    const createCall = createMock.mock.calls[0]?.[0];
    expect(createCall.data.subtotal).toBe(550);
    expect(createCall.data.items[0]).toMatchObject({
      name: "Canonical Saree",
      price: 275,
      product: "prod_1",
      quantity: 2,
    });
  });

  it("rejects unknown product ids", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as any);

    vi.mocked(getPayloadClient).mockResolvedValue({
      find: vi.fn().mockResolvedValue({ docs: [] }),
    } as any);

    const request = new Request("http://localhost/api/orders", {
      body: JSON.stringify({
        items: [{ productId: "missing_prod", quantity: 1 }],
        shippingAddress,
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    const response = await POST(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      code: "INVALID_PRODUCT_IDS",
      message: "One or more products are unavailable.",
    });
  });
});

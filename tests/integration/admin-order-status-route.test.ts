import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

import { PATCH } from "@/app/api/admin/orders/[id]/status/route";
import { getPayloadClient } from "@/lib/payload/server";
import { sendEmail } from "@/lib/email/send";

describe("PATCH /api/admin/orders/[id]/status", () => {
  const originalEnv = process.env.ADMIN_API_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ADMIN_API_SECRET = "test-admin-secret";
  });

  afterEach(() => {
    process.env.ADMIN_API_SECRET = originalEnv;
  });

  const makeRequest = (body: Record<string, unknown>, auth = "Bearer test-admin-secret") =>
    new Request("http://localhost/api/admin/orders/order_1/status", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: auth } : {}),
      },
      body: JSON.stringify(body),
    });

  const params = { id: "order_1" };

  it("rejects unauthenticated requests", async () => {
    const request = makeRequest({ status: "shipped" }, "Bearer wrong-secret");
    const response = await PATCH(request, { params });
    expect(response.status).toBe(401);
  });

  it("rejects invalid status values", async () => {
    const request = makeRequest({ status: "invalid_status" });
    const response = await PATCH(request, { params });
    expect(response.status).toBe(400);
  });

  it("updates order status to shipped and sends email", async () => {
    const updateMock = vi.fn().mockResolvedValue({ id: "order_1" });
    const findByIDMock = vi.fn().mockResolvedValue({
      id: "order_1",
      items: [{ name: "Test Saree", price: 28500, quantity: 1 }],
      subtotal: 28500,
      shippingAddress: { email: "customer@test.com", name: "Test" },
    });

    vi.mocked(getPayloadClient).mockResolvedValue({
      update: updateMock,
      findByID: findByIDMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = makeRequest({ status: "shipped", trackingNumber: "TRK123" });
    const response = await PATCH(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("shipped");
    expect(body.emailSent).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "customer@test.com" })
    );
  });

  it("updates order to confirmed without sending shipped email", async () => {
    const updateMock = vi.fn().mockResolvedValue({ id: "order_1" });
    const findByIDMock = vi.fn().mockResolvedValue({
      id: "order_1",
      items: [],
      subtotal: 0,
      shippingAddress: { email: "customer@test.com" },
    });

    vi.mocked(getPayloadClient).mockResolvedValue({
      update: updateMock,
      findByID: findByIDMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = makeRequest({ status: "confirmed" });
    const response = await PATCH(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.emailSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

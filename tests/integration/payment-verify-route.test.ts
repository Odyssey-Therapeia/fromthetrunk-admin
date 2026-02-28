import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/get-session", () => ({
  getServerAuthSession: vi.fn(),
}));

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

vi.mock("@/lib/payments/razorpay", () => ({
  verifyPaymentSignature: vi.fn(),
}));

import { getServerAuthSession } from "@/lib/auth/get-session";
import { POST } from "@/app/api/payments/verify/route";
import { getPayloadClient } from "@/lib/payload/server";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";

describe("/api/payments/verify POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated requests", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue(null);

    const request = new Request("http://localhost/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "order_1",
        razorpayOrderId: "rz_order_1",
        razorpayPaymentId: "rz_pay_1",
        razorpaySignature: "sig_1",
      }),
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("rejects invalid signatures", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as unknown as Awaited<ReturnType<typeof getServerAuthSession>>);

    vi.mocked(verifyPaymentSignature).mockReturnValue(false);

    const request = new Request("http://localhost/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "order_1",
        razorpayOrderId: "rz_order_1",
        razorpayPaymentId: "rz_pay_1",
        razorpaySignature: "invalid_sig",
      }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(400);
    expect(body.code).toBe("INVALID_SIGNATURE");
  });

  it("confirms order on valid signature", async () => {
    vi.mocked(getServerAuthSession).mockResolvedValue({
      user: { id: "user_1" },
    } as unknown as Awaited<ReturnType<typeof getServerAuthSession>>);

    vi.mocked(verifyPaymentSignature).mockReturnValue(true);

    const updateMock = vi.fn().mockResolvedValue({});
    const findByIDMock = vi.fn().mockResolvedValue({
      id: "order_1",
      items: [{ product: "prod_1", name: "Test", price: 100, quantity: 1 }],
    });

    vi.mocked(getPayloadClient).mockResolvedValue({
      update: updateMock,
      findByID: findByIDMock,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const request = new Request("http://localhost/api/payments/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId: "order_1",
        razorpayOrderId: "rz_order_1",
        razorpayPaymentId: "rz_pay_1",
        razorpaySignature: "valid_sig",
      }),
    });

    const response = await POST(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.verified).toBe(true);
    expect(body.status).toBe("confirmed");

    // Should update order status
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "orders",
        id: "order_1",
        data: expect.objectContaining({
          paymentStatus: "paid",
          status: "confirmed",
        }),
      })
    );
  });
});

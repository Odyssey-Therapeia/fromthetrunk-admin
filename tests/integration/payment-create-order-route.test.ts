import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/http/proxy-v2", async () => {
  const actual = await vi.importActual<typeof import("@/lib/http/proxy-v2")>("@/lib/http/proxy-v2");
  return {
    ...actual,
    forwardToV2: vi.fn(),
  };
});

vi.mock("@/lib/http/rate-limit", () => ({
  rateLimitResponse: vi.fn(() => null),
}));

import { POST } from "@/app/api/payments/create-order/route";
import { forwardToV2 } from "@/lib/http/proxy-v2";
import { rateLimitResponse } from "@/lib/http/rate-limit";

describe("/api/payments/create-order POST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitResponse).mockReturnValue(null);
  });

  it("maps amountPaise to amount for legacy consumers", async () => {
    const request = new Request("http://localhost/api/payments/create-order", {
      body: JSON.stringify({ items: [] }),
      method: "POST",
    });
    vi.mocked(forwardToV2).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          amountPaise: 12500,
          currency: "INR",
          orderId: "order_internal_1",
          razorpayKeyId: "rzp_key",
          razorpayOrderId: "order_razorpay_1",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        }
      )
    );

    const response = await POST(request);
    const body = await response.json();

    expect(forwardToV2).toHaveBeenCalledWith(request, "/payments/create-order");
    expect(body).toEqual({
      amount: 125,
      currency: "INR",
      orderId: "order_internal_1",
      razorpayKeyId: "rzp_key",
      razorpayOrderId: "order_razorpay_1",
    });
  });

  it("returns rate-limit response before forwarding", async () => {
    const request = new Request("http://localhost/api/payments/create-order", {
      body: JSON.stringify({ items: [] }),
      method: "POST",
    });
    vi.mocked(rateLimitResponse).mockReturnValueOnce(new Response("Too many requests", { status: 429 }));

    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(forwardToV2).not.toHaveBeenCalled();
  });
});

import { rateLimitResponse } from "@/lib/http/rate-limit";
import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

/**
 * POST /api/payments/create-order
 *
 * 1. Validate cart items against the database (canonical prices).
 * 2. Calculate totals server-side (subtotal + shipping + GST).
 * 3. Create a Razorpay order.
 * 4. Create a Payload order with status "pending" + Razorpay order ID.
 * 5. Return the Razorpay order ID + key to the client for checkout modal.
 */
export async function POST(request: Request) {
  // Rate limit: 5 payment attempts per minute per IP
  const rateLimited = rateLimitResponse(request, "payment:create", {
    limit: 5,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  const response = await forwardToV2(request, "/payments/create-order");
  return passThroughJson(response, (value) => {
    if (!response.ok || !value || typeof value !== "object") return value;
    const payload = value as Record<string, unknown>;
    const amountPaise = Number(payload.amountPaise ?? 0);

    return {
      amount: amountPaise / 100,
      currency: payload.currency,
      orderId: payload.orderId,
      razorpayKeyId: payload.razorpayKeyId,
      razorpayOrderId: payload.razorpayOrderId,
    };
  });
}

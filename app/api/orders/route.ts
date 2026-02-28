import { errorResponse } from "@/lib/http/error-response";

/**
 * /api/orders
 *
 * This endpoint has been consolidated:
 * - GET orders → use /api/account/orders (supports ?orderId=X for single lookup)
 * - POST new order → use /api/payments/create-order (Razorpay flow)
 */

export async function GET() {
  return errorResponse(
    301,
    "Use /api/account/orders instead.",
    "ENDPOINT_MOVED"
  );
}

export async function POST() {
  return errorResponse(
    410,
    "Direct order creation has been replaced. Use /api/payments/create-order for secure checkout.",
    "ENDPOINT_MOVED"
  );
}

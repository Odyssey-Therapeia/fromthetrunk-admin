import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

/**
 * GET /api/orders — List orders for the current user.
 * POST /api/orders — Deprecated: use /api/payments/create-order instead.
 *
 * The POST handler is kept for backwards compatibility but returns a
 * redirect notice pointing to the new payment flow.
 */
export async function GET() {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const payload = await getPayloadClient();
    const result = await payload.find({
      collection: "orders",
      where: { user: { equals: session.user.id } },
      sort: "-placedAt",
      limit: 50,
      overrideAccess: true,
    });

    return NextResponse.json({ orders: result.docs });
  } catch {
    return errorResponse(500, "Unable to load orders.", "ORDERS_FETCH_FAILED");
  }
}

export async function POST() {
  return errorResponse(
    410,
    "Direct order creation has been replaced. Use /api/payments/create-order for secure checkout.",
    "ENDPOINT_MOVED"
  );
}

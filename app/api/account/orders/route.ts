import { NextRequest, NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

/**
 * GET /api/account/orders          — list all orders for the current user
 * GET /api/account/orders?orderId=X — fetch a single order by ID (ownership-checked)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const orderId = request.nextUrl.searchParams.get("orderId");
    const payload = await getPayloadClient();

    // ── Single order lookup ──────────────────────────────────────
    if (orderId) {
      let order: Record<string, unknown>;
      try {
        order = await payload.findByID({
          collection: "orders",
          id: orderId,
          depth: 2,
          overrideAccess: true,
        }) as Record<string, unknown>;
      } catch {
        return errorResponse(404, "Order not found.", "ORDER_NOT_FOUND");
      }

      // Ownership check
      const orderUser = typeof order.user === "object" && order.user !== null
        ? (order.user as Record<string, unknown>).id
        : order.user;

      if (orderUser !== session.user.id) {
        return errorResponse(403, "Forbidden.", "FORBIDDEN");
      }

      return NextResponse.json({ order });
    }

    // ── List all orders ──────────────────────────────────────────
    const result = await payload.find({
      collection: "orders",
      where: { user: { equals: session.user.id } },
      sort: "-placedAt",
      limit: 50,
      depth: 2,
      overrideAccess: true,
    });

    return NextResponse.json({ orders: result.docs });
  } catch {
    return errorResponse(500, "Unable to load orders.", "ORDERS_FETCH_FAILED");
  }
}

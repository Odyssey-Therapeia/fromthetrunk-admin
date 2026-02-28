import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { getPayloadClient } from "@/lib/payload/server";

const RESERVATION_MINUTES = 30;

const reserveSchema = z.object({
  productId: z.string().min(1),
});

export async function POST(request: Request) {
  const rateLimited = rateLimitResponse(request, "cart:reserve", {
    limit: 10,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = reserveSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid payload.", "VALIDATION_ERROR", parsed.error.flatten());
    }

    const payload = await getPayloadClient();

    // Note: The read-then-write pattern below has a theoretical TOCTOU race
    // condition if two users try to reserve the same item simultaneously.
    // For this low-concurrency luxury marketplace, this is acceptable.
    // For higher volume, use a database transaction or optimistic locking.
    const product = await payload.findByID({
      collection: "products",
      id: parsed.data.productId,
      overrideAccess: true,
    }).catch(() => null);

    if (!product) {
      return errorResponse(404, "Product not found.", "PRODUCT_NOT_FOUND");
    }

    const stockStatus = (product as Record<string, unknown>).stockStatus as string | undefined;

    if (stockStatus === "sold") {
      return errorResponse(409, "This item has been sold.", "ITEM_SOLD");
    }

    if (stockStatus === "reserved") {
      // Check if reservation has expired
      const reservedUntil = (product as Record<string, unknown>).reservedUntil as string | undefined;
      if (reservedUntil && new Date(reservedUntil) > new Date()) {
        return errorResponse(409, "This item is reserved by another buyer.", "ITEM_RESERVED");
      }
      // Reservation expired — allow re-reservation
    }

    const reservedUntil = new Date(Date.now() + RESERVATION_MINUTES * 60 * 1000).toISOString();

    await payload.update({
      collection: "products",
      id: parsed.data.productId,
      data: {
        stockStatus: "reserved",
        reservedUntil,
      } as Record<string, unknown>,
      overrideAccess: true,
    });

    return NextResponse.json({
      reserved: true,
      reservedUntil,
      productId: parsed.data.productId,
    });
  } catch {
    return errorResponse(500, "Unable to reserve item.", "RESERVE_FAILED");
  }
}

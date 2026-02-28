import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

const releaseSchema = z.object({
  productId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = releaseSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid payload.", "VALIDATION_ERROR", parsed.error.flatten());
    }

    const payload = await getPayloadClient();
    const product = await payload.findByID({
      collection: "products",
      id: parsed.data.productId,
      overrideAccess: true,
    }).catch(() => null);

    if (!product) {
      return errorResponse(404, "Product not found.", "PRODUCT_NOT_FOUND");
    }

    const stockStatus = (product as Record<string, unknown>).stockStatus as string | undefined;

    // Only release if currently reserved (don't un-sell a sold item)
    if (stockStatus !== "reserved") {
      return NextResponse.json({ released: false, reason: "Item is not reserved." });
    }

    await payload.update({
      collection: "products",
      id: parsed.data.productId,
      data: {
        stockStatus: "available",
        reservedUntil: null,
      } as Record<string, unknown>,
      overrideAccess: true,
    });

    return NextResponse.json({
      released: true,
      productId: parsed.data.productId,
    });
  } catch {
    return errorResponse(500, "Unable to release item.", "RELEASE_FAILED");
  }
}

import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { getPayloadClient } from "@/lib/payload/server";
import { createOrderSchema } from "@/lib/validation/order";

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

    const parsed = createOrderSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        400,
        "Invalid order payload.",
        "VALIDATION_ERROR",
        parsed.error.flatten()
      );
    }

    const payload = await getPayloadClient();
    const uniqueProductIds = Array.from(
      new Set(parsed.data.items.map((item) => item.productId))
    );
    const productsResult = await payload.find({
      collection: "products",
      depth: 2,
      limit: uniqueProductIds.length,
      where: {
        and: [
          { id: { in: uniqueProductIds } },
          { status: { equals: "published" } },
        ],
      },
      overrideAccess: true,
    });

    const productById = new Map<string, any>();
    for (const product of productsResult.docs) {
      productById.set(String(product.id), product);
    }

    const missingProductIds = uniqueProductIds.filter((id) => !productById.has(id));
    if (missingProductIds.length > 0) {
      return errorResponse(
        400,
        "One or more products are unavailable.",
        "INVALID_PRODUCT_IDS",
        { productIds: missingProductIds }
      );
    }

    const orderItems = parsed.data.items.map((item) => {
      const product = productById.get(item.productId) as any;
      const productImage = Array.isArray(product.images)
        ? resolveMediaURL(product.images[0])
        : null;

      return {
        imageUrl: productImage ?? "",
        name: product.name,
        price: product.price ?? 0,
        product: product.id,
        quantity: item.quantity,
      };
    });

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const order = await payload.create({
      collection: "orders",
      data: {
        user: session.user.id,
        items: orderItems,
        subtotal,
        status: "pending",
        shippingAddress: {
          name: parsed.data.shippingAddress.name,
          line1: parsed.data.shippingAddress.line1,
          line2: parsed.data.shippingAddress.line2,
          city: parsed.data.shippingAddress.city,
          state: parsed.data.shippingAddress.state,
          postalCode: parsed.data.shippingAddress.postalCode,
          country: parsed.data.shippingAddress.country,
          phone: parsed.data.shippingAddress.phone,
          email: parsed.data.shippingAddress.email,
        },
        placedAt: new Date().toISOString(),
      },
      overrideAccess: true,
    });

    return NextResponse.json({
      order: {
        id: order.id,
        items: order.items,
        placedAt: order.placedAt,
        status: order.status,
        subtotal: order.subtotal,
      },
    });
  } catch {
    return errorResponse(500, "Unable to place order.", "ORDER_CREATE_FAILED");
  }
}

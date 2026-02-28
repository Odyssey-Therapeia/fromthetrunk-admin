import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { resolveMediaURL } from "@/lib/media/resolve-media-url";
import { calculateOrderTotals, getRazorpayInstance } from "@/lib/payments/razorpay";
import { getPayloadClient } from "@/lib/payload/server";
import { createOrderSchema } from "@/lib/validation/order";

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

  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    // Accept optional shippingMethod from client
    const shippingMethod =
      body.shippingMethod === "express" ? "express" : "standard";

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

    // Fetch canonical products
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

    const productById = new Map<string, Record<string, unknown>>();
    for (const product of productsResult.docs) {
      productById.set(String(product.id), product as Record<string, unknown>);
    }

    // Validate all products exist and are available
    const missingIds = uniqueProductIds.filter((id) => !productById.has(id));
    if (missingIds.length > 0) {
      return errorResponse(400, "One or more products are unavailable.", "INVALID_PRODUCT_IDS", {
        productIds: missingIds,
      });
    }

    // Check stock status
    for (const [id, product] of productById) {
      const stockStatus = product.stockStatus as string | undefined;
      if (stockStatus === "sold") {
        return errorResponse(409, `${product.name} has been sold.`, "ITEM_SOLD", { productId: id });
      }
    }

    // Build order items with canonical pricing
    const orderItems = parsed.data.items.map((item) => {
      const product = productById.get(item.productId)!;
      const images = product.images as unknown[] | undefined;
      const productImage = Array.isArray(images) ? resolveMediaURL(images[0]) : null;

      return {
        imageUrl: productImage ?? "",
        name: product.name as string,
        price: (product.price as number) ?? 0,
        product: product.id as string,
        quantity: item.quantity,
      };
    });

    const subtotal = orderItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const totals = calculateOrderTotals(subtotal, shippingMethod);

    // Create Razorpay order
    const razorpay = getRazorpayInstance();
    const razorpayOrder = await razorpay.orders.create({
      amount: totals.total * 100, // Razorpay expects paise
      currency: "INR",
      receipt: `ftt_${Date.now()}`,
      notes: {
        userId: session.user.id,
      },
    });

    // Create Payload order
    const order = await payload.create({
      collection: "orders",
      data: {
        user: session.user.id,
        items: orderItems,
        subtotal: totals.subtotal,
        shippingCost: totals.shippingCost,
        shippingMethod: totals.shippingMethod,
        taxRate: totals.taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        status: "pending",
        paymentStatus: "pending",
        paymentGateway: "razorpay",
        razorpayOrderId: razorpayOrder.id,
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
      } as Record<string, unknown>,
      overrideAccess: true,
    });

    return NextResponse.json({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      amount: totals.total,
      currency: "INR",
      totals,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unable to create payment order.";
    return errorResponse(500, message, "PAYMENT_ORDER_FAILED");
  }
}

import crypto from "crypto";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

/**
 * POST /api/webhooks/razorpay
 *
 * Handles asynchronous payment events from Razorpay.
 * Verifies webhook signature before processing.
 */
export async function POST(request: Request) {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return errorResponse(500, "Webhook secret not configured.", "WEBHOOK_SECRET_MISSING");
    }

    const rawBody = await request.text();
    const signature = request.headers.get("x-razorpay-signature");

    if (!signature) {
      return errorResponse(400, "Missing signature.", "MISSING_SIGNATURE");
    }

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      return errorResponse(400, "Invalid webhook signature.", "INVALID_SIGNATURE");
    }

    const event = JSON.parse(rawBody);
    const payload = await getPayloadClient();

    switch (event.event) {
      case "payment.captured": {
        const payment = event.payload?.payment?.entity;
        if (!payment) break;

        const razorpayOrderId = payment.order_id;

        // Find the order by Razorpay order ID
        const orders = await payload.find({
          collection: "orders",
          where: { razorpayOrderId: { equals: razorpayOrderId } },
          limit: 1,
          overrideAccess: true,
        });

        const order = orders.docs[0];
        if (order) {
          await payload.update({
            collection: "orders",
            id: order.id,
            data: {
              paymentId: payment.id,
              paymentStatus: "paid",
              paymentMethod: payment.method ?? "razorpay",
              status: "confirmed",
            } as Record<string, unknown>,
            overrideAccess: true,
          });
        }
        break;
      }

      case "payment.failed": {
        const payment = event.payload?.payment?.entity;
        if (!payment) break;

        const razorpayOrderId = payment.order_id;
        const orders = await payload.find({
          collection: "orders",
          where: { razorpayOrderId: { equals: razorpayOrderId } },
          limit: 1,
          overrideAccess: true,
        });

        const order = orders.docs[0];
        if (order) {
          await payload.update({
            collection: "orders",
            id: order.id,
            data: {
              paymentStatus: "failed",
            } as Record<string, unknown>,
            overrideAccess: true,
          });

          // Release product reservations on payment failure
          const items = (order as Record<string, unknown>).items as Array<Record<string, unknown>> | undefined;
          if (items) {
            for (const item of items) {
              const productRef = item.product;
              const productId = typeof productRef === "object" && productRef !== null
                ? (productRef as Record<string, unknown>).id as string
                : productRef as string;

              if (productId) {
                await payload.update({
                  collection: "products",
                  id: productId,
                  data: {
                    stockStatus: "available",
                    reservedUntil: null,
                  } as Record<string, unknown>,
                  overrideAccess: true,
                });
              }
            }
          }
        }
        break;
      }

      case "refund.processed": {
        const refund = event.payload?.refund?.entity;
        if (!refund) break;

        const paymentId = refund.payment_id;
        const orders = await payload.find({
          collection: "orders",
          where: { paymentId: { equals: paymentId } },
          limit: 1,
          overrideAccess: true,
        });

        const order = orders.docs[0];
        if (order) {
          await payload.update({
            collection: "orders",
            id: order.id,
            data: {
              paymentStatus: "refunded",
            } as Record<string, unknown>,
            overrideAccess: true,
          });
        }
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch {
    return errorResponse(500, "Webhook processing failed.", "WEBHOOK_FAILED");
  }
}

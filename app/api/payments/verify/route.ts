import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { sendEmail } from "@/lib/email/send";
import { orderConfirmationEmail } from "@/lib/email/templates";
import { errorResponse } from "@/lib/http/error-response";
import { verifyPaymentSignature } from "@/lib/payments/razorpay";
import { getPayloadClient } from "@/lib/payload/server";
import type { Order } from "@/types/payload-types";

const verifySchema = z.object({
  orderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

/**
 * POST /api/payments/verify
 *
 * After the Razorpay checkout modal completes, the client sends back the
 * payment details for server-side signature verification.
 */
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

    const parsed = verifySchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid payload.", "VALIDATION_ERROR", parsed.error.flatten());
    }

    // Verify signature
    const isValid = verifyPaymentSignature({
      orderId: parsed.data.razorpayOrderId,
      paymentId: parsed.data.razorpayPaymentId,
      signature: parsed.data.razorpaySignature,
    });

    if (!isValid) {
      return errorResponse(400, "Payment verification failed.", "INVALID_SIGNATURE");
    }

    const payload = await getPayloadClient();

    // Update order with payment details
    await payload.update({
      collection: "orders",
      id: parsed.data.orderId,
      data: {
        paymentId: parsed.data.razorpayPaymentId,
        paymentStatus: "paid",
        paymentMethod: "razorpay",
        status: "confirmed",
      } as Record<string, unknown>,
      overrideAccess: true,
    });

    // Mark all products in this order as "sold"
    const order = await payload.findByID({
      collection: "orders",
      id: parsed.data.orderId,
      overrideAccess: true,
    });

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
              stockStatus: "sold",
              soldAt: new Date().toISOString(),
              reservedUntil: null,
            } as Record<string, unknown>,
            overrideAccess: true,
          });
        }
      }
    }

    // Send order confirmation email (non-blocking)
    const confirmedOrder = await payload.findByID({
      collection: "orders",
      id: parsed.data.orderId,
      depth: 2,
      overrideAccess: true,
    }) as unknown as Order;

    const customerEmail =
      confirmedOrder.shippingAddress?.email ?? session.user.email;

    if (customerEmail) {
      const emailContent = orderConfirmationEmail(confirmedOrder);
      sendEmail({
        to: customerEmail,
        subject: emailContent.subject,
        html: emailContent.html,
      }).catch(() => {
        // Email failure should not fail the payment verification
        console.error("[PAYMENT_VERIFY] Failed to send confirmation email");
      });
    }

    return NextResponse.json({
      verified: true,
      orderId: parsed.data.orderId,
      status: "confirmed",
    });
  } catch {
    return errorResponse(500, "Unable to verify payment.", "PAYMENT_VERIFY_FAILED");
  }
}

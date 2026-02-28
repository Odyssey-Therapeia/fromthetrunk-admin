import { NextResponse } from "next/server";
import { z } from "zod";

import { sendEmail } from "@/lib/email/send";
import { orderShippedEmail } from "@/lib/email/templates";
import { errorResponse } from "@/lib/http/error-response";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import { getPayloadClient } from "@/lib/payload/server";
import type { Order } from "@/types/payload-types";

const statusSchema = z.object({
  status: z.enum(["pending", "confirmed", "shipped", "delivered"]),
  trackingNumber: z.string().optional(),
});

/**
 * PATCH /api/admin/orders/[id]/status
 *
 * Admin-only: update order status. When status changes to "shipped",
 * sends a shipping notification email to the customer.
 *
 * Protected by Payload admin session (checks req.user.role === "admin").
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const { id } = await Promise.resolve(params);
    const payload = await getPayloadClient();

    // Admin auth check — timing-safe secret verification
    const adminSecret = process.env.ADMIN_API_SECRET;
    if (!adminSecret) {
      return errorResponse(500, "Admin secret not configured.", "CONFIG_ERROR");
    }

    const authHeader = request.headers.get("authorization");
    if (!verifyBearerSecret(authHeader, adminSecret)) {
      return errorResponse(401, "Unauthorized. Admin access required.", "UNAUTHORIZED");
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = statusSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid status.", "VALIDATION_ERROR", parsed.error.flatten());
    }

    // Update order status
    const updated = await payload.update({
      collection: "orders",
      id,
      data: { status: parsed.data.status } as Record<string, unknown>,
      overrideAccess: true,
    });

    const order = await payload.findByID({
      collection: "orders",
      id,
      depth: 2,
      overrideAccess: true,
    }) as unknown as Order;

    // Send shipped email when status changes to "shipped"
    if (parsed.data.status === "shipped") {
      const customerEmail = order.shippingAddress?.email;
      if (customerEmail) {
        const email = orderShippedEmail(order, parsed.data.trackingNumber);
        sendEmail({
          to: customerEmail,
          subject: email.subject,
          html: email.html,
        }).catch(() => {
          console.error("[ADMIN] Failed to send shipped email for order", id);
        });
      }
    }

    return NextResponse.json({
      id: updated.id,
      status: parsed.data.status,
      emailSent: parsed.data.status === "shipped",
    });
  } catch {
    return errorResponse(500, "Unable to update order status.", "STATUS_UPDATE_FAILED");
  }
}

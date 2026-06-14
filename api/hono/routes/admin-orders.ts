import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { idParamSchema } from "@/api/hono/schemas/common";
import { orderNotePatchSchema, orderStatusPatchSchema, orderTrackingPatchSchema } from "@/api/hono/schemas/orders";
import type { HonoBindings } from "@/api/hono/types";
import { claimOrderRefund, finalizeOrderRefund, getOrder, revertOrderRefundClaim, updateOrderNote, updateOrderStatus, updateOrderTracking } from "@/db/queries/orders";
import { restockProduct } from "@/db/queries/products";
import { sendEmail } from "@/lib/email/send";
import { orderShippedEmail } from "@/lib/email/templates";
import { getPaymentsPort } from "@/lib/ports/payments";

export const registerAdminOrderRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // ── PATCH /:id/status ─────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}/status",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": {
              schema: orderStatusPatchSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Order status updated",
        },
      },
      tags: ["Admin Orders"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const order = await getOrder(id);
      if (!order) {
        return c.json(
          {
            code: "ORDER_NOT_FOUND",
            message: "Order not found.",
          },
          404
        );
      }

      const isStatusChange = order.status !== body.status;

      if (isStatusChange) {
        await updateOrderStatus(id, body.status, body.note ?? "Status updated by admin");

        if (body.status === "shipped" && order.shippingEmail) {
          const email = orderShippedEmail(
            {
              id: order.id,
            },
            undefined
          );
          sendEmail({
            to: order.shippingEmail,
            subject: email.subject,
            html: email.html,
          }).catch(() => undefined);
        }
      }

      return c.json(
        {
          emailSent: isStatusChange && body.status === "shipped" && Boolean(order.shippingEmail),
          id,
          status: body.status,
        },
        200
      );
    }
  );

  // ── PATCH /:id/note ───────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}/note",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": {
              schema: orderNotePatchSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Order note updated",
        },
      },
      tags: ["Admin Orders"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const order = await getOrder(id);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      await updateOrderNote(id, body.note);

      return c.json({ id, note: body.note }, 200);
    }
  );

  // ── PATCH /:id/tracking ───────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}/tracking",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": {
              schema: orderTrackingPatchSchema,
            },
          },
          required: true,
        },
      },
      responses: {
        200: {
          description: "Order tracking updated",
        },
      },
      tags: ["Admin Orders"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const order = await getOrder(id);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      const newTracking = body.trackingNumber ?? null;
      const newCarrier = body.trackingCarrier ?? null;

      // Guard: only send email if the tracking number actually changed
      const isTrackingChange = order.trackingNumber !== newTracking;

      await updateOrderTracking(id, newTracking, newCarrier);

      let emailSent = false;
      if (isTrackingChange && newTracking && order.shippingEmail) {
        const email = orderShippedEmail({ id: order.id }, newTracking);
        sendEmail({
          to: order.shippingEmail,
          subject: email.subject,
          html: email.html,
        }).catch(() => undefined);
        emailSent = true;
      }

      return c.json({ id, trackingNumber: newTracking, trackingCarrier: newCarrier, emailSent }, 200);
    }
  );

  // ── POST /:id/refund ──────────────────────────────────────────────────────
  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/refund",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: {
          description: "Order refunded",
        },
      },
      tags: ["Admin Orders"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      // Fast-path read (not the atomic gate — the CLAIM below is the real gate).
      const order = await getOrder(id);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      if (!order.paymentId) {
        return c.json(
          {
            code: "NO_PAYMENT_ID",
            message: "Order does not have a Razorpay payment ID. Cannot issue refund.",
          },
          422
        );
      }

      // ATOMIC CLAIM — the real TOCTOU gate.
      // Only the first concurrent request that finds paymentStatus="paid" wins.
      // Any loser (including the already-refunded race winner seen here) gets null.
      const claimed = await claimOrderRefund(id);
      if (!claimed) {
        return c.json(
          {
            code: "ALREADY_REFUNDED",
            message: "This order has already been refunded.",
          },
          422
        );
      }

      // Only the claim winner reaches Razorpay.
      const paymentsPort = getPaymentsPort();
      let refundResult: { refundId: string; amountPaise: number };
      try {
        refundResult = await paymentsPort.refund({
          paymentId: order.paymentId,
          amountPaise: order.totalPaise,
        });
      } catch (err) {
        // Razorpay failed — revert the in-flight claim so a retry can work.
        await revertOrderRefundClaim(id);
        return c.json(
          {
            code: "REFUND_FAILED",
            message: "Razorpay refund call failed. The order has been restored to refundable state.",
          },
          502
        );
      }

      // Razorpay succeeded — finalize the DB record.
      await finalizeOrderRefund(id, refundResult.refundId, refundResult.amountPaise);

      // ONE-OF-ONE RESTOCK: for each item in the order, attempt to restock the product.
      // Pass orderId so restockProduct can distinguish "sold for THIS order" (restock) from
      // "genuinely re-sold to a different customer" (skip).
      const restockResults: Record<string, string> = {};
      for (const item of order.items) {
        if (item.productId) {
          const result = await restockProduct(item.productId, id);
          restockResults[item.productId] = result;
        }
      }

      return c.json(
        {
          id,
          refunded: true,
          refundId: refundResult.refundId,
          refundedAmountPaise: refundResult.amountPaise,
          restock: restockResults,
        },
        200
      );
    }
  );
};

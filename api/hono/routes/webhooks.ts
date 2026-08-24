import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addOrderEvent, getOrder } from "@/db/queries/orders";
import { orders } from "@/db/schema";
import { releaseProductReservations } from "@/lib/inventory/release-reservation";
import { completePaidOrder } from "@/lib/orders/complete-paid-order";

type RazorpayWebhookEvent = {
  event: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        method?: string;
        order_id?: string;
      };
    };
    payment_link?: {
      entity?: {
        id?: string;
        reference_id?: string;
        short_url?: string;
        status?: string;
      };
    };
    refund?: {
      entity?: {
        payment_id?: string;
      };
    };
  };
};

const findOrderByRazorpayOrderId = async (razorpayOrderId: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayOrderId))
    .limit(1);

  return order ?? null;
};

const findOrderByRazorpayReference = async (razorpayReference: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayReference))
    .limit(1);

  return order ? getOrder(order.id) : null;
};

const findOrderByPaymentId = async (paymentId: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentId, paymentId))
    .limit(1);

  return order ?? null;
};

const releaseOrderReservation = async (orderId: string, eventNote: string) => {
  const order = await getOrder(orderId);
  // A paid order is never released — its products are sold, not available.
  if (!order || order.paymentStatus === "paid") return;

  const productIds = order.items
    .map((item) => item.productId)
    .filter((id): id is string => Boolean(id));

  // The canonical release: stock_status, quantity_available, reserved_until AND
  // the inventory-v2 reservation rows, together. This used to reset only the
  // first and third, which left an active reservation row behind and kept the
  // product "reserved" to every v2 read path.
  await releaseProductReservations({ orderId: order.id, productIds });

  await db
    .update(orders)
    .set({
      paymentStatus: "failed",
      updatedAt: new Date(),
    })
    .where(eq(orders.id, order.id));

  await addOrderEvent(order.id, eventNote, order.status, null);
};

export const registerWebhookRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/razorpay",
      responses: {
        200: {
          description: "Webhook received",
        },
      },
      tags: ["Webhooks"],
    }),
    async (c) => {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
      if (!webhookSecret) {
        return c.json(
          {
            code: "WEBHOOK_SECRET_MISSING",
            message: "Webhook secret not configured.",
          },
          500
        );
      }

      const rawBody = await c.req.raw.text();
      const signature = c.req.header("x-razorpay-signature");
      if (!signature) {
        return c.json({ code: "MISSING_SIGNATURE", message: "Missing signature." }, 400);
      }

      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");
      const expectedBuf = Buffer.from(expectedSignature);
      const actualBuf = Buffer.from(signature);
      if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
        return c.json(
          {
            code: "INVALID_SIGNATURE",
            message: "Invalid webhook signature.",
          },
          400
        );
      }

      const event = JSON.parse(rawBody) as RazorpayWebhookEvent;
      switch (event.event) {
        case "payment_link.paid": {
          const payment = event.payload?.payment?.entity;
          const paymentLink = event.payload?.payment_link?.entity;
          if (!payment?.id || !paymentLink?.id) break;

          const order = await findOrderByRazorpayReference(paymentLink.id);
          if (!order) break;

          await completePaidOrder({
            orderId: order.id,
            paymentId: payment.id,
            paymentMethod: payment.method ?? "razorpay_payment_link",
            paymentReference: paymentLink.id,
            paymentUrl: paymentLink.short_url,
            source: "Razorpay payment link webhook",
          });
          break;
        }
        case "payment_link.cancelled":
        case "payment_link.expired": {
          const paymentLink = event.payload?.payment_link?.entity;
          if (!paymentLink?.id) break;

          const order = await findOrderByRazorpayReference(paymentLink.id);
          if (!order) break;

          await releaseOrderReservation(order.id, `Webhook ${event.event}`);
          break;
        }
        case "payment.captured": {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id || !payment.id) break;

          const order = await findOrderByRazorpayOrderId(payment.order_id);
          if (!order) break;

          await completePaidOrder({
            orderId: order.id,
            paymentId: payment.id,
            paymentMethod: payment.method ?? "razorpay",
            paymentReference: payment.order_id,
            source: "Razorpay payment.captured webhook",
          });
          break;
        }
        case "payment.failed": {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id) break;

          const order = await findOrderByRazorpayOrderId(payment.order_id);
          if (!order) break;

          await db
            .update(orders)
            .set({
              paymentStatus: "failed",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));

          await releaseOrderReservation(order.id, "Webhook payment.failed");
          break;
        }
        case "refund.processed": {
          const paymentId = event.payload?.refund?.entity?.payment_id;
          if (!paymentId) break;

          const order = await findOrderByPaymentId(paymentId);
          if (!order) break;

          await db
            .update(orders)
            .set({
              paymentStatus: "refunded",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));

          await addOrderEvent(order.id, "Webhook refund.processed", order.status, {
            paymentId,
          });
          break;
        }
      }

      return c.json({ received: true }, 200);
    }
  );
};

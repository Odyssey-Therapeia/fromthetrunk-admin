import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addOrderEvent } from "@/db/queries/orders";
import { orders, products } from "@/db/schema";

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

const findOrderByPaymentId = async (paymentId: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentId, paymentId))
    .limit(1);

  return order ?? null;
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
      if (expectedSignature !== signature) {
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
        case "payment.captured": {
          const payment = event.payload?.payment?.entity;
          if (!payment?.order_id || !payment.id) break;

          const order = await findOrderByRazorpayOrderId(payment.order_id);
          if (!order) break;

          await db
            .update(orders)
            .set({
              paymentId: payment.id,
              paymentMethod: payment.method ?? "razorpay",
              paymentStatus: "paid",
              status: "confirmed",
              updatedAt: new Date(),
            })
            .where(eq(orders.id, order.id));

          await addOrderEvent(order.id, "Webhook payment.captured", "confirmed", {
            paymentId: payment.id,
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

          await db
            .update(products)
            .set({
              reservedUntil: null,
              stockStatus: "available",
              updatedAt: new Date(),
            })
            .where(eq(products.stockStatus, "reserved"));

          await addOrderEvent(order.id, "Webhook payment.failed", order.status, null);
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

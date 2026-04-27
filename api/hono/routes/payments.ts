import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import { createPaymentOrderSchema, verifyPaymentSchema } from "@/api/hono/schemas/payments";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addOrderEvent, createOrder, getOrder, updateOrderStatus } from "@/db/queries/orders";
import { orders, products } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { orderConfirmationEmail } from "@/lib/email/templates";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { GST_RATE, SHIPPING_TIERS } from "@/lib/config/order-pricing";
import { getRazorpayInstance, verifyPaymentSignature } from "@/lib/payments/razorpay";

const toShippingCostPaise = (subtotalPaise: number, shippingMethod: "express" | "standard") => {
  const freeThresholdPaise = SHIPPING_TIERS.freeThreshold * 100;
  if (subtotalPaise >= freeThresholdPaise) return 0;
  return SHIPPING_TIERS[shippingMethod] * 100;
};

export const registerPaymentRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/create-order",
      request: {
        body: {
          content: {
            "application/json": { schema: createPaymentOrderSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Payment order created" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
      },
      tags: ["Payments"],
    }),
    async (c) => {
      const rateLimited = rateLimitResponse(c.req.raw, "payment:create", {
        limit: 5,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");
      const productIds = Array.from(new Set(body.items.map((item) => item.productId)));
      const productRows = await db
        .select()
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.status, "published")));

      const productById = new Map(productRows.map((product) => [product.id, product]));
      for (const productId of productIds) {
        const product = productById.get(productId);
        if (!product) {
          return c.json(
            {
              code: "INVALID_PRODUCT_IDS",
              details: { productId },
              message: "One or more products are unavailable.",
            },
            400
          );
        }

        if (product.stockStatus === "sold") {
          return c.json(
            {
              code: "ITEM_SOLD",
              details: { productId },
              message: `${product.name} has been sold.`,
            },
            409
          );
        }
      }

      const normalizedItems = body.items.map((item) => {
        const product = productById.get(item.productId)!;
        return {
          imageUrl: null,
          name: product.name,
          pricePaise: product.pricePaise,
          productId: product.id,
          quantity: item.quantity,
        };
      });

      const subtotalPaise = normalizedItems.reduce(
        (sum, item) => sum + item.pricePaise * item.quantity,
        0
      );
      const shippingCostPaise = toShippingCostPaise(subtotalPaise, body.shippingMethod);
      const taxAmountPaise = Math.round(subtotalPaise * GST_RATE);
      const totalPaise = subtotalPaise + shippingCostPaise + taxAmountPaise;

      const razorpay = getRazorpayInstance();
      const razorpayOrder = await razorpay.orders.create({
        amount: totalPaise,
        currency: "INR",
        notes: {
          userId: authUserOrResponse.id,
        },
        receipt: `ftt_${Date.now()}`,
      });

      const order = await createOrder({
        items: normalizedItems,
        paymentGateway: "razorpay",
        paymentStatus: "pending",
        razorpayOrderId: razorpayOrder.id,
        shippingCity: body.shippingAddress.city,
        shippingCostPaise,
        shippingCountry: body.shippingAddress.country,
        shippingEmail: body.shippingAddress.email,
        shippingLine1: body.shippingAddress.line1,
        shippingLine2: body.shippingAddress.line2 ?? null,
        shippingMethod: body.shippingMethod,
        shippingName: body.shippingAddress.name,
        shippingPhone: body.shippingAddress.phone ?? null,
        shippingPostalCode: body.shippingAddress.postalCode,
        shippingState: body.shippingAddress.state ?? null,
        status: "pending",
        subtotalPaise,
        taxAmountPaise,
        taxRate: String(GST_RATE),
        totalPaise,
        userId: authUserOrResponse.id,
      });

      return c.json(
        {
          amountPaise: totalPaise,
          currency: "INR",
          orderId: order.id,
          razorpayKeyId: process.env.RAZORPAY_KEY_ID,
          razorpayOrderId: razorpayOrder.id,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/verify",
      request: {
        body: {
          content: {
            "application/json": { schema: verifyPaymentSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Payment verified" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Order not found",
        },
      },
      tags: ["Payments"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");
      const isValid = verifyPaymentSignature({
        orderId: body.razorpayOrderId,
        paymentId: body.razorpayPaymentId,
        signature: body.razorpaySignature,
      });
      if (!isValid) {
        return c.json({ code: "INVALID_SIGNATURE", message: "Payment verification failed." }, 400);
      }

      const order = await getOrder(body.orderId);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      const productIds = order.items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id));

      await db
        .update(products)
        .set({
          reservedUntil: null,
          soldAt: new Date(),
          stockStatus: "sold",
          updatedAt: new Date(),
        })
        .where(inArray(products.id, productIds));

      await db
        .update(orders)
        .set({
          paymentId: body.razorpayPaymentId,
          paymentMethod: "razorpay",
          paymentStatus: "paid",
          status: "confirmed",
          updatedAt: new Date(),
        })
        .where(eq(orders.id, body.orderId));

      await addOrderEvent(body.orderId, "Payment verified", "confirmed", {
        razorpayOrderId: body.razorpayOrderId,
        razorpayPaymentId: body.razorpayPaymentId,
      });
      await updateOrderStatus(body.orderId, "confirmed", "Order confirmed after payment");

      const confirmed = await getOrder(body.orderId);
      if (confirmed?.shippingEmail) {
        const emailContent = orderConfirmationEmail({
          id: confirmed.id,
          items: confirmed.items.map((item) => ({
            name: item.name,
            price: item.pricePaise / 100,
            quantity: item.quantity,
          })),
          shippingAddress: {
            city: confirmed.shippingCity,
            country: confirmed.shippingCountry,
            email: confirmed.shippingEmail,
            line1: confirmed.shippingLine1,
            line2: confirmed.shippingLine2,
            name: confirmed.shippingName,
            phone: confirmed.shippingPhone,
            postalCode: confirmed.shippingPostalCode,
            state: confirmed.shippingState,
          },
          shippingCost: confirmed.shippingCostPaise / 100,
          subtotal: confirmed.subtotalPaise / 100,
          taxAmount: confirmed.taxAmountPaise / 100,
          total: confirmed.totalPaise / 100,
        });

        sendEmail({
          to: confirmed.shippingEmail,
          subject: emailContent.subject,
          html: emailContent.html,
        }).catch(() => undefined);
      }

      return c.json(
        {
          orderId: body.orderId,
          status: "confirmed",
          verified: true,
        },
        200
      );
    }
  );
};

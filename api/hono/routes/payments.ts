import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { createPaymentOrderSchema, verifyPaymentSchema } from "@/api/hono/schemas/payments";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addOrderEvent, createOrder, getOrder, updateOrderStatus } from "@/db/queries/orders";
import { orders, products } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { orderConfirmationEmail } from "@/lib/email/templates";
import { getRazorpayInstance, GST_RATE, SHIPPING_TIERS, verifyPaymentSignature } from "@/lib/payments/razorpay";

const toShippingCostPaise = (subtotalPaise: number, shippingMethod: "express" | "standard") => {
  const freeThresholdPaise = SHIPPING_TIERS.freeThreshold * 100;
  if (subtotalPaise >= freeThresholdPaise) return 0;
  return SHIPPING_TIERS[shippingMethod] * 100;
};

export const registerPaymentRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.post("/create-order", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = createPaymentOrderSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid payment order payload.",
        },
        400
      );
    }

    const productIds = Array.from(new Set(body.data.items.map((item) => item.productId)));
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

    const normalizedItems = body.data.items.map((item) => {
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
    const shippingCostPaise = toShippingCostPaise(subtotalPaise, body.data.shippingMethod);
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
      shippingCity: body.data.shippingAddress.city,
      shippingCostPaise,
      shippingCountry: body.data.shippingAddress.country,
      shippingEmail: body.data.shippingAddress.email,
      shippingLine1: body.data.shippingAddress.line1,
      shippingLine2: body.data.shippingAddress.line2 ?? null,
      shippingMethod: body.data.shippingMethod,
      shippingName: body.data.shippingAddress.name,
      shippingPhone: body.data.shippingAddress.phone ?? null,
      shippingPostalCode: body.data.shippingAddress.postalCode,
      shippingState: body.data.shippingAddress.state ?? null,
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
  });

  app.post("/verify", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = verifyPaymentSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid payment verification payload.",
        },
        400
      );
    }

    const isValid = verifyPaymentSignature({
      orderId: body.data.razorpayOrderId,
      paymentId: body.data.razorpayPaymentId,
      signature: body.data.razorpaySignature,
    });
    if (!isValid) {
      return c.json({ code: "INVALID_SIGNATURE", message: "Payment verification failed." }, 400);
    }

    const order = await getOrder(body.data.orderId);
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
        paymentId: body.data.razorpayPaymentId,
        paymentMethod: "razorpay",
        paymentStatus: "paid",
        status: "confirmed",
        updatedAt: new Date(),
      })
      .where(eq(orders.id, body.data.orderId));

    await addOrderEvent(body.data.orderId, "Payment verified", "confirmed", {
      razorpayOrderId: body.data.razorpayOrderId,
      razorpayPaymentId: body.data.razorpayPaymentId,
    });
    await updateOrderStatus(body.data.orderId, "confirmed", "Order confirmed after payment");

    const confirmed = await getOrder(body.data.orderId);
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
      } as never);

      sendEmail({
        to: confirmed.shippingEmail,
        subject: emailContent.subject,
        html: emailContent.html,
      }).catch(() => undefined);
    }

    return c.json(
      {
        orderId: body.data.orderId,
        status: "confirmed",
        verified: true,
      },
      200
    );
  });
};

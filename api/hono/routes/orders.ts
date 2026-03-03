import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { idParamSchema } from "@/api/hono/schemas/common";
import { createOrderSchema } from "@/api/hono/schemas/orders";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { createOrder, getOrder, listOrders } from "@/db/queries/orders";
import { products } from "@/db/schema";
import { GST_RATE, SHIPPING_TIERS } from "@/lib/payments/razorpay";

const toShippingCostPaise = (subtotalPaise: number, shippingMethod: "express" | "standard") => {
  const freeThresholdPaise = SHIPPING_TIERS.freeThreshold * 100;
  if (subtotalPaise >= freeThresholdPaise) return 0;
  return SHIPPING_TIERS[shippingMethod] * 100;
};

export const registerOrderRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const status = c.req.query("status");
    const orders = await listOrders({
      status:
        status === "confirmed" ||
        status === "delivered" ||
        status === "pending" ||
        status === "shipped"
          ? status
          : undefined,
      userId: authUserOrResponse.role === "admin" ? undefined : authUserOrResponse.id,
    });

    return c.json(orders, 200);
  });

  app.get("/:id", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const params = idParamSchema.safeParse(c.req.param());
    if (!params.success) {
      return c.json(
        {
          code: "INVALID_PARAMS",
          details: params.error.flatten(),
          message: "Invalid route params.",
        },
        400
      );
    }

    const order = await getOrder(params.data.id);
    if (!order) {
      return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
    }

    if (authUserOrResponse.role !== "admin" && order.userId !== authUserOrResponse.id) {
      return c.json({ code: "FORBIDDEN", message: "Forbidden." }, 403);
    }

    return c.json(order, 200);
  });

  app.post("/", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = createOrderSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid order payload.",
        },
        400
      );
    }

    const productIds = Array.from(new Set(body.data.items.map((item) => item.productId)));
    const productsRows = await db
      .select()
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          eq(products.status, "published")
        )
      );
    const productById = new Map(productsRows.map((product) => [product.id, product]));

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
            message: "This item has been sold.",
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

    const order = await createOrder({
      items: normalizedItems,
      paymentStatus: "pending",
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

    return c.json(order, 201);
  });
};

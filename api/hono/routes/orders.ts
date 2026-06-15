import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq, inArray } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import { createOrderSchema } from "@/api/hono/schemas/orders";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { createOrder, getOrder, listOrders } from "@/db/queries/orders";
import { findDiscountByCode, toValidatedDiscount } from "@/db/queries/discounts";
import { getCollectionProductIds } from "@/db/queries/collections";
import { collections, products } from "@/db/schema";
import { GST_RATE } from "@/lib/config/order-pricing";
import { validateDiscountCode } from "@/lib/discounts/validate";
import { calculateOrderTotals } from "@/lib/payments/razorpay";

export const registerOrderRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Orders list" },
      },
      tags: ["Orders"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const status = c.req.query("status");
      const isAdmin = authUserOrResponse.role === "admin";
      const orders = await listOrders({
        status:
          status === "confirmed" ||
          status === "delivered" ||
          status === "pending" ||
          status === "shipped"
            ? status
            : undefined,
        userId: isAdmin ? undefined : authUserOrResponse.id,
        // P6-01: also surface guest orders by the user's verified email so
        // pre-claim checkout history appears in the account orders tab.
        userEmail:
          isAdmin || !authUserOrResponse.email
            ? undefined
            : authUserOrResponse.email,
      });

      return c.json(orders, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: { description: "Order detail" },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Order not found",
        },
      },
      tags: ["Orders"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const { id } = c.req.valid("param");
      const order = await getOrder(id);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      // Allow access when:
      //   (a) admin bypass, OR
      //   (b) the order belongs to the authenticated user (userId match), OR
      //   (c) guest order (userId null) whose shippingEmail matches the
      //       session user's verified email — mirrors the list-route visibility
      //       rule added in P6-01 so guest orders surfaced in the orders list
      //       are also openable on the detail route.
      const isAdmin = authUserOrResponse.role === "admin";
      const isOwner = order.userId === authUserOrResponse.id;
      const sessionEmail = authUserOrResponse.email ?? null;
      const isEmailClaim =
        order.userId === null &&
        order.shippingEmail !== null &&
        sessionEmail !== null &&
        order.shippingEmail.toLowerCase() === sessionEmail.toLowerCase();

      if (!isAdmin && !isOwner && !isEmailClaim) {
        return c.json({ code: "FORBIDDEN", message: "Forbidden." }, 403);
      }

      return c.json(order, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: createOrderSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Order created" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
      },
      tags: ["Orders"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");

      const productIds = Array.from(new Set(body.items.map((item) => item.productId)));
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

      // P6-02: Resolve optional discount code SERVER-SIDE (mirrors payments route).
      let validatedDiscount: ReturnType<typeof toValidatedDiscount> | undefined;
      // P6-02 (CRITICAL): when the discount is collection-scoped, the discount
      // applies ONLY to the sum of in-collection line items (scoped base).
      let discountableSubtotalPaise: number = subtotalPaise;
      if (body.discountCode) {
        const discountRow = await findDiscountByCode(body.discountCode);
        if (!discountRow) {
          return c.json(
            { code: "DISCOUNT_INVALID", message: "Discount code is invalid or inactive." },
            400
          );
        }

        let collectionProductIds: string[] = [];
        if (discountRow.collectionId) {
          const [collectionRow] = await db
            .select()
            .from(collections)
            .where(eq(collections.id, discountRow.collectionId))
            .limit(1);
          if (collectionRow) {
            collectionProductIds = await getCollectionProductIds({
              id: collectionRow.id,
              rules: collectionRow.rules ?? null,
            });
          }
        }

        const validation = validateDiscountCode(toValidatedDiscount(discountRow), {
          subtotalPaise,
          itemProductIds: normalizedItems.map((i) => i.productId),
          collectionProductIds,
          now: new Date(),
          usageCount: discountRow.usageCount,
        });

        if (!validation.valid) {
          return c.json(
            { code: "DISCOUNT_INELIGIBLE", message: validation.error },
            400
          );
        }

        validatedDiscount = toValidatedDiscount(discountRow);

        // Compute the scoped discountable base (mirrors payments route).
        if (discountRow.collectionId && collectionProductIds.length > 0) {
          const collectionSet = new Set(collectionProductIds);
          discountableSubtotalPaise = normalizedItems
            .filter((i) => collectionSet.has(i.productId))
            .reduce((s, i) => s + i.pricePaise * i.quantity, 0);
        }
      }

      // Single source of truth for the charged amount (shipping + GST + total).
      // Flag OFF (default) reproduces the previous inline math byte-for-byte.
      // P6-02: passes the server-validated discount + scoped base to calculateOrderTotals.
      const { shippingCostPaise, taxAmountPaise, totalPaise } = calculateOrderTotals(
        subtotalPaise,
        body.shippingMethod,
        validatedDiscount,
        discountableSubtotalPaise
      );

      const order = await createOrder({
        items: normalizedItems,
        paymentStatus: "pending",
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
        // P6-02: Persist discount association so completePaidOrder can
        // increment usageCount atomically on payment confirmation.
        discountId: validatedDiscount?.id ?? null,
        discountCode: validatedDiscount?.code ?? null,
      });

      return c.json(order, 201);
    }
  );
};

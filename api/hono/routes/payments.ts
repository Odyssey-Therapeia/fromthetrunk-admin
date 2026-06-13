import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { and, count, eq, gt, inArray, isNotNull, lt, or } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import { createPaymentOrderSchema, verifyPaymentSchema } from "@/api/hono/schemas/payments";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addOrderEvent, createOrder, getOrder } from "@/db/queries/orders";
import { insertReservation, releaseReservationsByProducts } from "@/db/queries/reservations";
import { getOrCreateCheckoutCustomer } from "@/db/queries/users";
import { orders, products } from "@/db/schema";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { GST_RATE } from "@/lib/config/order-pricing";
import { isInventoryV2 } from "@/lib/config/flags";
import { createOrderAccessToken } from "@/lib/orders/order-access-token";
import { completePaidOrder } from "@/lib/orders/complete-paid-order";
import {
  calculateOrderTotals,
  createRazorpayPaymentLink,
  getRazorpayPaymentLinkReferenceId,
  isRazorpayAuthError,
  RAZORPAY_PAYMENT_LINK_HOLD_MINUTES,
  RAZORPAY_MIN_AMOUNT_PAISE,
  type RazorpayPaymentLinkResponse,
  verifyPaymentLinkSignature,
  verifyPaymentSignature,
} from "@/lib/payments/razorpay";

const paymentLinkCallbackSchema = z.object({
  orderId: z.string().uuid().optional(),
  razorpay_payment_id: z.string().optional(),
  razorpay_payment_link_id: z.string().optional(),
  razorpay_payment_link_reference_id: z.string().optional(),
  razorpay_payment_link_status: z.string().optional(),
  razorpay_signature: z.string().optional(),
});

const getRequestOrigin = (url: string) => new URL(url).origin;

const getServerOrigin = (requestUrl: string) =>
  process.env.NEXT_PUBLIC_SERVER_URL || process.env.NEXTAUTH_URL || getRequestOrigin(requestUrl);

const getOrderConfirmationUrl = (requestUrl: string, orderId?: string, status?: string) => {
  const url = new URL("/checkout/confirmation", getServerOrigin(requestUrl));
  if (orderId) {
    url.searchParams.set("orderId", orderId);
    url.searchParams.set("key", createOrderAccessToken(orderId));
  }
  if (status) {
    url.searchParams.set("payment", status);
  }
  return url;
};

const findOrderByRazorpayReference = async (razorpayReference: string) => {
  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.razorpayOrderId, razorpayReference))
    .limit(1);

  return order ? getOrder(order.id) : null;
};

const toPaymentDescription = (
  orderId: string,
  items: Array<{ name: string; quantity: number }>
) => {
  const itemSummary = items.map((item) => `${item.name} x${item.quantity}`).join(", ");
  return `From the Trunk order #${orderId.slice(0, 8).toUpperCase()}: ${itemSummary}`.slice(
    0,
    2048
  );
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

      const body = c.req.valid("json");
      const productIds = Array.from(new Set(body.items.map((item) => item.productId)));
      const productRows = await db
        .select()
        .from(products)
        .where(and(inArray(products.id, productIds), eq(products.status, "published")));

      const productById = new Map(productRows.map((product) => [product.id, product]));
      const now = new Date();
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

        if (
          product.stockStatus === "reserved" &&
          (!product.reservedUntil || product.reservedUntil > now)
        ) {
          return c.json(
            {
              code: "ITEM_RESERVED",
              details: { productId },
              message: `${product.name} is reserved by another buyer.`,
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
      // Single source of truth for the charged amount (shipping + GST + total).
      // Flag OFF (default) reproduces the previous inline math byte-for-byte.
      const { shippingCostPaise, taxAmountPaise, totalPaise } = calculateOrderTotals(
        subtotalPaise,
        body.shippingMethod
      );

      if (totalPaise < RAZORPAY_MIN_AMOUNT_PAISE) {
        return c.json(
          {
            code: "AMOUNT_TOO_LOW",
            message: "Razorpay orders must be at least 100 paise.",
          },
          400
        );
      }

      const shippingName = body.shippingAddress.name;
      const emailLower = body.shippingAddress.email.toLowerCase();

      // Cap check: max 3 live pending payment links per email.
      // Race window exists; durable limiting is P2-06.
      const linkExpiryMs = RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000;
      const pendingCount = await db
        .select({ c: count() })
        .from(orders)
        .where(
          and(
            eq(orders.shippingEmail, emailLower),
            eq(orders.paymentStatus, "pending"),
            gt(orders.createdAt, new Date(Date.now() - linkExpiryMs))
          )
        );
      if ((pendingCount[0]?.c ?? 0) >= 3) {
        return c.json(
          {
            code: "TOO_MANY_PENDING_ORDERS",
            message: "Too many pending orders for this email.",
          },
          429
        );
      }

      const customer = await getOrCreateCheckoutCustomer({
        email: emailLower,
        name: shippingName,
        phone: body.shippingAddress.phone,
      });

      const order = await createOrder({
        items: normalizedItems,
        paymentGateway: "razorpay",
        paymentStatus: "pending",
        razorpayOrderId: null,
        shippingCity: body.shippingAddress.city,
        shippingCostPaise,
        shippingCountry: body.shippingAddress.country,
        shippingEmail: emailLower,
        shippingLine1: body.shippingAddress.line1,
        shippingLine2: body.shippingAddress.line2 ?? null,
        shippingMethod: body.shippingMethod,
        shippingName,
        shippingPhone: body.shippingAddress.phone ?? null,
        shippingPostalCode: body.shippingAddress.postalCode,
        shippingState: body.shippingAddress.state ?? null,
        status: "pending",
        subtotalPaise,
        taxAmountPaise,
        taxRate: String(GST_RATE),
        totalPaise,
        userId: customer?.id ?? null,
      });

      const reservedUntil = new Date(
        Date.now() + RAZORPAY_PAYMENT_LINK_HOLD_MINUTES * 60 * 1000
      );

      // ── Inventory claim ──────────────────────────────────────────────────
      // FLAG OFF (default): existing stock_status atomic claim — EXACTLY as before.
      // FLAG ON: reservations-based quantity check (defence-in-depth pre-check),
      //   then falls through to the same stock_status update for the actual atomic
      //   claim (full atomic SQL claim deferred to P4-05).
      // Dual-write (quantity_available + reservations table) occurs in BOTH paths.

      if (isInventoryV2()) {
        // Pre-check: ensure quantity_available >= 1 for every product.
        // Throws "QUANTITY_INSUFFICIENT" if any product has qty=0.
        for (const productId of productIds) {
          try {
            await insertReservation({
              orderId: order.id,
              productId,
              qty: 1,
              expiresAt: reservedUntil,
            });
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg === "QUANTITY_INSUFFICIENT") {
              // Clean up any reservations already inserted for earlier products
              await releaseReservationsByProducts(productIds.slice(0, productIds.indexOf(productId)));
              await db
                .update(orders)
                .set({ paymentStatus: "failed", updatedAt: new Date() })
                .where(eq(orders.id, order.id));
              return c.json(
                {
                  code: "ITEM_UNAVAILABLE",
                  message: "One or more pieces in your bag are no longer available.",
                },
                409
              );
            }
            throw err;
          }
        }
      }

      // Atomic stock_status claim (both flag OFF and flag ON use this as the
      // primary concurrency guard; it is unchanged from the pre-P2-05 code).
      const reservedRows = await db
        .update(products)
        .set({
          reservedUntil,
          stockStatus: "reserved",
          // Dual-write: quantity_available stays at 1 during reserve phase
          // (the reservation row tracks the hold; qty drops to 0 only on sold).
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(products.id, productIds),
            or(
              eq(products.stockStatus, "available"),
              and(
                eq(products.stockStatus, "reserved"),
                isNotNull(products.reservedUntil),
                lt(products.reservedUntil, now)
              )
            )
          )
        )
        .returning({ id: products.id });

      if (reservedRows.length !== productIds.length) {
        const reservedProductIds = reservedRows.map((row) => row.id);
        if (reservedProductIds.length > 0) {
          await db
            .update(products)
            .set({
              reservedUntil: null,
              stockStatus: "available",
              updatedAt: new Date(),
            })
            .where(inArray(products.id, reservedProductIds));
        }

        // Dual-write: release any reservations rows we inserted in the v2 path
        if (isInventoryV2()) {
          await releaseReservationsByProducts(productIds);
        }

        await db
          .update(orders)
          .set({
            paymentStatus: "failed",
            updatedAt: new Date(),
          })
          .where(eq(orders.id, order.id));

        await addOrderEvent(order.id, "Checkout reservation failed", "pending", {
          requestedProductIds: productIds,
          reservedProductIds,
        });

        return c.json(
          {
            code: "ITEM_UNAVAILABLE",
            message: "One or more pieces in your bag are no longer available.",
          },
          409
        );
      }

      let paymentLink: RazorpayPaymentLinkResponse;
      try {
        paymentLink = await createRazorpayPaymentLink({
          amountPaise: totalPaise,
          callbackUrl: `${getServerOrigin(c.req.url)}/api/v2/payments/payment-link/callback?orderId=${order.id}`,
          customer: {
            contact: body.shippingAddress.phone,
            email: emailLower,
            name: shippingName,
          },
          description: toPaymentDescription(order.id, normalizedItems),
          expireBy: reservedUntil,
          notes: {
            orderId: order.id,
            ...(customer?.id != null ? { userId: customer.id } : {}),
          },
          referenceId: getRazorpayPaymentLinkReferenceId(order.id),
        });
      } catch (error) {
        await db
          .update(products)
          .set({
            reservedUntil: null,
            stockStatus: "available",
            updatedAt: new Date(),
          })
          .where(inArray(products.id, productIds));

        // Dual-write: release reservation rows on Razorpay failure
        if (isInventoryV2()) {
          await releaseReservationsByProducts(productIds);
        }

        await db
          .update(orders)
          .set({ paymentStatus: "failed", updatedAt: new Date() })
          .where(eq(orders.id, order.id));

        if (isRazorpayAuthError(error)) {
          return c.json(
            {
              code: "RAZORPAY_AUTH_FAILED",
              message: "Razorpay authentication failed.",
            },
            401
          );
        }

        console.error("[payments:create-order] Razorpay payment link creation failed:", error);
        return c.json(
          {
            code: "RAZORPAY_PAYMENT_LINK_CREATE_FAILED",
            message: "Unable to create Razorpay payment link.",
          },
          500
        );
      }

      await db
        .update(orders)
        .set({
          razorpayOrderId: paymentLink.id,
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));

      await addOrderEvent(order.id, "Razorpay payment link created", "pending", {
        paymentLinkId: paymentLink.id,
        paymentLinkUrl: paymentLink.short_url,
      });

      return c.json(
        {
          amountPaise: totalPaise,
          amount: totalPaise,
          currency: "INR",
          orderAccessToken: createOrderAccessToken(order.id),
          order_id: paymentLink.id,
          orderId: order.id,
          paymentLinkId: paymentLink.id,
          paymentLinkUrl: paymentLink.short_url,
          razorpayKeyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID ?? process.env.RAZORPAY_KEY_ID,
          razorpayOrderId: paymentLink.id,
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
      const order = await getOrder(body.orderId);
      if (!order) {
        return c.json({ code: "ORDER_NOT_FOUND", message: "Order not found." }, 404);
      }

      if (order.userId !== authUserOrResponse.id) {
        return c.json({ code: "FORBIDDEN", message: "Order does not belong to this user." }, 403);
      }

      if (order.razorpayOrderId !== body.razorpayOrderId) {
        return c.json(
          { code: "ORDER_ID_MISMATCH", message: "Payment does not match this order." },
          400
        );
      }

      const isValid = verifyPaymentSignature({
        orderId: body.razorpayOrderId,
        paymentId: body.razorpayPaymentId,
        signature: body.razorpaySignature,
      });
      if (!isValid) {
        return c.json({ code: "INVALID_SIGNATURE", message: "Payment verification failed." }, 400);
      }

      if (order.paymentStatus === "paid" && order.paymentId === body.razorpayPaymentId) {
        return c.json(
          {
            orderId: body.orderId,
            status: order.status,
            verified: true,
          },
          200
        );
      }

      await completePaidOrder({
        orderId: body.orderId,
        paymentId: body.razorpayPaymentId,
        paymentMethod: "razorpay_checkout",
        paymentReference: body.razorpayOrderId,
        source: "Razorpay checkout verification",
      });

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

  app.openapi(
    createRoute({
      method: "get",
      path: "/payment-link/callback",
      request: {
        query: paymentLinkCallbackSchema,
      },
      responses: {
        302: { description: "Redirects to checkout confirmation" },
      },
      tags: ["Payments"],
    }),
    async (c) => {
      const query = c.req.valid("query");
      const failureUrl = getOrderConfirmationUrl(c.req.url, query.orderId, "review");

      if (
        !query.razorpay_payment_id ||
        !query.razorpay_payment_link_id ||
        !query.razorpay_payment_link_reference_id ||
        !query.razorpay_payment_link_status ||
        !query.razorpay_signature
      ) {
        return c.redirect(failureUrl.toString());
      }

      let order = query.orderId ? await getOrder(query.orderId) : null;
      order ??= await findOrderByRazorpayReference(query.razorpay_payment_link_id);

      if (!order) {
        return c.redirect(failureUrl.toString());
      }

      const redirectUrl = getOrderConfirmationUrl(c.req.url, order.id);
      const signedByRazorpay = verifyPaymentLinkSignature({
        paymentId: query.razorpay_payment_id,
        paymentLinkId: query.razorpay_payment_link_id,
        paymentLinkReferenceId: query.razorpay_payment_link_reference_id,
        paymentLinkStatus: query.razorpay_payment_link_status,
        signature: query.razorpay_signature,
      });

      if (!signedByRazorpay || order.razorpayOrderId !== query.razorpay_payment_link_id) {
        await addOrderEvent(order.id, "Razorpay payment link signature rejected", order.status, {
          paymentLinkId: query.razorpay_payment_link_id,
          paymentLinkStatus: query.razorpay_payment_link_status,
        });
        redirectUrl.searchParams.set("payment", "review");
        return c.redirect(redirectUrl.toString());
      }

      if (query.razorpay_payment_link_status !== "paid") {
        await addOrderEvent(order.id, "Razorpay payment link not paid", order.status, {
          paymentLinkId: query.razorpay_payment_link_id,
          paymentLinkStatus: query.razorpay_payment_link_status,
        });
        redirectUrl.searchParams.set("payment", query.razorpay_payment_link_status);
        return c.redirect(redirectUrl.toString());
      }

      try {
        await completePaidOrder({
          orderId: order.id,
          paymentId: query.razorpay_payment_id,
          paymentMethod: "razorpay_payment_link",
          paymentReference: query.razorpay_payment_link_id,
          source: "Razorpay payment link callback",
        });
        redirectUrl.searchParams.set("payment", "paid");
      } catch (error) {
        console.error("[payments:payment-link-callback] Unable to complete order:", error);
        redirectUrl.searchParams.set("payment", "review");
      }

      return c.redirect(redirectUrl.toString());
    }
  );
};

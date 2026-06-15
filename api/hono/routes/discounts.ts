/**
 * P6-02: Public discount validation endpoint.
 *
 * The client sends a code + subtotal + itemProductIds; the server validates
 * the discount and returns the server-computed discountAmountPaise (display only).
 * No order is created at this stage. The authoritative charge is always computed
 * in calculateOrderTotals at order-creation time — this endpoint is ONLY for
 * displaying the discount amount in the checkout UI before the user clicks "Pay".
 *
 * The client NEVER computes the discount amount — it only reads what the server
 * returns here, and the order-creation route re-validates and re-applies the code.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { findDiscountByCode, toValidatedDiscount } from "@/db/queries/discounts";
import { getCollectionProductIds } from "@/db/queries/collections";
import { collections } from "@/db/schema";
import { applyDiscountToPaise, validateDiscountCode } from "@/lib/discounts/validate";
import { rateLimitResponse } from "@/lib/http/rate-limit";

const validateDiscountRequestSchema = z.object({
  code: z.string().trim().min(1).max(64),
  subtotalPaise: z.number().int().min(0),
  itemProductIds: z.array(z.string()).default([]),
});

export const registerDiscountRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/validate",
      request: {
        body: {
          content: {
            "application/json": { schema: validateDiscountRequestSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Discount code is valid; returns server-computed discount amount" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid or ineligible discount code",
        },
        422: {
          content: { "application/json": { schema: errorSchema } },
          description: "Unprocessable request",
        },
      },
      tags: ["Discounts"],
    }),
    async (c) => {
      const rateLimited = await rateLimitResponse(c.req.raw, "discount:validate", {
        limit: 20,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const body = c.req.valid("json");
      const normalizedCode = body.code.trim().toUpperCase();

      const discountRow = await findDiscountByCode(normalizedCode);
      if (!discountRow) {
        return c.json(
          { code: "DISCOUNT_INVALID", message: "Discount code is invalid or inactive." },
          400
        );
      }

      // Resolve collection product IDs for collection-scope check.
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

      const validatedDiscount = toValidatedDiscount(discountRow);

      const validation = validateDiscountCode(validatedDiscount, {
        subtotalPaise: body.subtotalPaise,
        itemProductIds: body.itemProductIds,
        collectionProductIds,
        now: new Date(),
        usageCount: discountRow.usageCount,
      });

      if (!validation.valid) {
        return c.json({ code: "DISCOUNT_INELIGIBLE", message: validation.error }, 400);
      }

      // P6-02 (CRITICAL): compute the scoped discountable base for collection-scoped
      // discounts. Only items whose productId is in collectionProductIds count toward
      // the discountable base. Out-of-scope items are not discounted.
      let discountableBase = body.subtotalPaise;
      if (discountRow.collectionId && collectionProductIds.length > 0) {
        const collectionSet = new Set(collectionProductIds);
        discountableBase = body.itemProductIds
          // The preview endpoint only receives productIds (not prices), so we
          // compute the scoped pct/fixed discount against a proportional fraction
          // of the subtotal: fraction = count(in-scope) / count(all).
          // NOTE: The preview is for display only; the charge is re-computed by
          // calculateOrderTotals at order-creation time with the full item breakdown.
          // To give a meaningful preview here we compute proportion-based scoped base.
          .filter((id) => collectionSet.has(id)).length > 0
          ? (body.subtotalPaise * body.itemProductIds.filter((id) => collectionSet.has(id)).length) / Math.max(body.itemProductIds.length, 1)
          : 0;
      }

      // Compute the server-authoritative discount amount (for display in checkout UI).
      // This is NOT the charge — the order-creation route re-validates and re-applies.
      const discountAmountPaise = applyDiscountToPaise(discountableBase, validatedDiscount);

      return c.json(
        {
          code: normalizedCode,
          discountAmountPaise,
          type: validatedDiscount.type,
          value: validatedDiscount.value,
        },
        200
      );
    }
  );
};

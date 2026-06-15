/**
 * P6-02: Admin CRUD routes for discount codes.
 *
 * All routes are requireAdmin-gated. The discount amount is NEVER computed here —
 * computation lives exclusively in lib/discounts/validate.ts + lib/payments/razorpay.ts.
 */
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import {
  createDiscount,
  deleteDiscount,
  getDiscount,
  listDiscounts,
  setDiscountActive,
  updateDiscount,
} from "@/db/queries/discounts";

// ─── Schemas ─────────────────────────────────────────────────────────────────

const discountWriteSchema = z.object({
  code: z.string().trim().min(1).max(64),
  type: z.enum(["percent", "fixed"]),
  /** For percent: 0–100. For fixed: paise amount. */
  value: z.number().int().min(0),
  minSubtotalPaise: z.number().int().min(0).optional().default(0),
  collectionId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).nullable().optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  active: z.boolean().optional().default(true),
});

const discountPatchSchema = discountWriteSchema.partial();

// ─── Route registration ───────────────────────────────────────────────────────

export const registerAdminDiscountRoutes = (app: OpenAPIHono<HonoBindings>) => {
  // LIST
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "List of discount codes" },
        401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
        403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
      },
      tags: ["Admin Discounts"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rows = await listDiscounts();
      return c.json(rows, 200);
    }
  );

  // GET by ID
  app.openapi(
    createRoute({
      method: "get",
      path: "/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Discount code detail" },
        401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
        403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
        404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
      },
      tags: ["Admin Discounts"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const row = await getDiscount(id);
      if (!row) {
        return c.json({ code: "DISCOUNT_NOT_FOUND", message: "Discount not found." }, 404);
      }
      return c.json(row, 200);
    }
  );

  // CREATE
  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: { "application/json": { schema: discountWriteSchema } },
          required: true,
        },
      },
      responses: {
        201: { description: "Discount created" },
        400: { content: { "application/json": { schema: errorSchema } }, description: "Invalid payload" },
        401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
        403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
      },
      tags: ["Admin Discounts"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");

      try {
        const row = await createDiscount({
          code: body.code,
          type: body.type,
          value: body.value,
          minSubtotalPaise: body.minSubtotalPaise,
          collectionId: body.collectionId ?? null,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
          usageLimit: body.usageLimit ?? null,
          active: body.active,
        });
        return c.json(row, 201);
      } catch (err) {
        // Unique violation (duplicate code) surfaces as a Postgres error.
        const message = err instanceof Error ? err.message : "Failed to create discount.";
        if (message.includes("unique") || message.includes("duplicate")) {
          return c.json(
            { code: "DISCOUNT_CODE_DUPLICATE", message: "A discount with this code already exists." },
            400
          );
        }
        throw err;
      }
    }
  );

  // UPDATE (PATCH)
  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        params: idParamSchema,
        body: {
          content: { "application/json": { schema: discountPatchSchema } },
          required: true,
        },
      },
      responses: {
        200: { description: "Discount updated" },
        400: { content: { "application/json": { schema: errorSchema } }, description: "Invalid payload" },
        401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
        403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
        404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
      },
      tags: ["Admin Discounts"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      try {
        const row = await updateDiscount(id, {
          ...(body.code !== undefined && { code: body.code }),
          ...(body.type !== undefined && { type: body.type }),
          ...(body.value !== undefined && { value: body.value }),
          ...(body.minSubtotalPaise !== undefined && { minSubtotalPaise: body.minSubtotalPaise }),
          ...(body.collectionId !== undefined && { collectionId: body.collectionId }),
          ...(body.startsAt !== undefined && { startsAt: body.startsAt ? new Date(body.startsAt) : null }),
          ...(body.endsAt !== undefined && { endsAt: body.endsAt ? new Date(body.endsAt) : null }),
          ...(body.usageLimit !== undefined && { usageLimit: body.usageLimit }),
          ...(body.active !== undefined && { active: body.active }),
        });
        return c.json(row, 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message === "Discount not found.") {
          return c.json({ code: "DISCOUNT_NOT_FOUND", message: "Discount not found." }, 404);
        }
        throw err;
      }
    }
  );

  // ACTIVATE / DEACTIVATE toggle
  app.openapi(
    createRoute({
      method: "post",
      path: "/{id}/toggle-active",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": {
              schema: z.object({ active: z.boolean() }),
            },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Active state updated" },
        401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
        403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
        404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
      },
      tags: ["Admin Discounts"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const { active } = c.req.valid("json");

      try {
        const row = await setDiscountActive(id, active);
        return c.json(row, 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message === "Discount not found.") {
          return c.json({ code: "DISCOUNT_NOT_FOUND", message: "Discount not found." }, 404);
        }
        throw err;
      }
    }
  );

  // DELETE
  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Discount deleted" },
        401: { content: { "application/json": { schema: errorSchema } }, description: "Unauthorized" },
        403: { content: { "application/json": { schema: errorSchema } }, description: "Forbidden" },
        404: { content: { "application/json": { schema: errorSchema } }, description: "Not found" },
      },
      tags: ["Admin Discounts"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const existing = await getDiscount(id);
      if (!existing) {
        return c.json({ code: "DISCOUNT_NOT_FOUND", message: "Discount not found." }, 404);
      }

      await deleteDiscount(id);
      return c.json({ deleted: true, id }, 200);
    }
  );
};

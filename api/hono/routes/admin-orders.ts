import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { eq } from "drizzle-orm";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { idParamSchema } from "@/api/hono/schemas/common";
import { orderStatusPatchSchema } from "@/api/hono/schemas/orders";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addOrderEvent, getOrder, updateOrderStatus } from "@/db/queries/orders";
import { orders } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { orderShippedEmail } from "@/lib/email/templates";

export const registerAdminOrderRoutes = (app: OpenAPIHono<HonoBindings>) => {
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

      await updateOrderStatus(id, body.status, body.note ?? "Status updated by admin");
      await db
        .update(orders)
        .set({ updatedAt: new Date() })
        .where(eq(orders.id, id));
      await addOrderEvent(id, body.note ?? "Status updated by admin", body.status, null);

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

      return c.json(
        {
          emailSent: body.status === "shipped",
          id,
          status: body.status,
        },
        200
      );
    }
  );
};

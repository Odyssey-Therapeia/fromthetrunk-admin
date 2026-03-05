import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq, ne } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { addressCreateSchema, addressPatchSchema } from "@/api/hono/schemas/addresses";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addresses, users } from "@/db/schema";

export const registerAddressRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Addresses list" },
      },
      tags: ["Addresses"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const rows = await db
        .select()
        .from(addresses)
        .where(eq(addresses.userId, authUserOrResponse.id))
        .orderBy(desc(addresses.createdAt))
        .limit(100);

      return c.json(rows, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: addressCreateSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Address created" },
      },
      tags: ["Addresses"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");

      const [address] = await db
        .insert(addresses)
        .values({
          ...body,
          userId: authUserOrResponse.id,
        })
        .returning();

      if (body.isDefault) {
        await db
          .update(addresses)
          .set({
            isDefault: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(addresses.userId, authUserOrResponse.id),
              ne(addresses.id, address.id)
            )
          );

        await db
          .update(users)
          .set({
            defaultAddressId: address.id,
            updatedAt: new Date(),
          })
          .where(eq(users.id, authUserOrResponse.id));
      }

      return c.json(address, 201);
    }
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: addressPatchSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Address updated" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Address not found",
        },
      },
      tags: ["Addresses"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      const [existing] = await db
        .select()
        .from(addresses)
        .where(
          and(
            eq(addresses.id, id),
            eq(addresses.userId, authUserOrResponse.id)
          )
        )
        .limit(1);
      if (!existing) {
        return c.json({ code: "ADDRESS_NOT_FOUND", message: "Address not found." }, 404);
      }

      const [updated] = await db
        .update(addresses)
        .set({
          ...body,
          updatedAt: new Date(),
        })
        .where(eq(addresses.id, id))
        .returning();

      if (body.isDefault) {
        await db
          .update(addresses)
          .set({
            isDefault: false,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(addresses.userId, authUserOrResponse.id),
              ne(addresses.id, updated.id)
            )
          );

        await db
          .update(users)
          .set({
            defaultAddressId: updated.id,
            updatedAt: new Date(),
          })
          .where(eq(users.id, authUserOrResponse.id));
      }

      return c.json(updated, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "delete",
      path: "/{id}",
      request: {
        params: idParamSchema,
      },
      responses: {
        200: { description: "Address deleted" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Address not found",
        },
      },
      tags: ["Addresses"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const { id } = c.req.valid("param");

      const deleted = await db
        .delete(addresses)
        .where(
          and(
            eq(addresses.id, id),
            eq(addresses.userId, authUserOrResponse.id)
          )
        )
        .returning({ id: addresses.id });

      if (deleted.length === 0) {
        return c.json({ code: "ADDRESS_NOT_FOUND", message: "Address not found." }, 404);
      }

      await db
        .update(users)
        .set({
          defaultAddressId: null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(users.id, authUserOrResponse.id),
            eq(users.defaultAddressId, id)
          )
        );

      return c.json({ success: true }, 200);
    }
  );
};

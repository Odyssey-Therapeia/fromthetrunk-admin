import { OpenAPIHono } from "@hono/zod-openapi";
import { and, desc, eq, ne } from "drizzle-orm";

import { requireAuth } from "@/api/hono/middleware/auth";
import { addressCreateSchema, addressPatchSchema } from "@/api/hono/schemas/addresses";
import { idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { addresses, users } from "@/db/schema";

export const registerAddressRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rows = await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, authUserOrResponse.id))
      .orderBy(desc(addresses.createdAt))
      .limit(100);

    return c.json(rows, 200);
  });

  app.post("/", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = addressCreateSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid address payload.",
        },
        400
      );
    }

    const [address] = await db
      .insert(addresses)
      .values({
        ...body.data,
        userId: authUserOrResponse.id,
      })
      .returning();

    if (body.data.isDefault) {
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
  });

  app.patch("/:id", async (c) => {
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

    const rawBody = await c.req.json().catch(() => null);
    const body = addressPatchSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid address patch payload.",
        },
        400
      );
    }

    const [existing] = await db
      .select()
      .from(addresses)
      .where(
        and(
          eq(addresses.id, params.data.id),
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
        ...body.data,
        updatedAt: new Date(),
      })
      .where(eq(addresses.id, params.data.id))
      .returning();

    if (body.data.isDefault) {
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
  });

  app.delete("/:id", async (c) => {
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

    const deleted = await db
      .delete(addresses)
      .where(
        and(
          eq(addresses.id, params.data.id),
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
          eq(users.defaultAddressId, params.data.id)
        )
      );

    return c.json({ success: true }, 200);
  });
};

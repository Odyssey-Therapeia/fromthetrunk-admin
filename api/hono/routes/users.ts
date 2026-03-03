import bcrypt from "bcryptjs";
import { OpenAPIHono } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";

import { requireAdmin, requireAuth } from "@/api/hono/middleware/auth";
import { signUpInputSchema, updateMeInputSchema } from "@/api/hono/schemas/users";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { getUserByEmail, getUserById, listUsers, updateUser } from "@/db/queries/users";
import { addresses, users } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";

export const registerUserRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.get("/", async (c) => {
    const adminOrResponse = requireAdmin(c);
    if (adminOrResponse instanceof Response) return adminOrResponse;

    const users = await listUsers({
      limit: 200,
      offset: 0,
    });
    return c.json(users, 200);
  });

  app.post("/sign-up", async (c) => {
    const rawBody = await c.req.json().catch(() => null);
    const body = signUpInputSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid sign up payload.",
        },
        400
      );
    }

    const existing = await getUserByEmail(body.data.email);
    if (existing) {
      return c.json(
        {
          code: "EMAIL_ALREADY_REGISTERED",
          message: "An account with this email already exists.",
        },
        409
      );
    }

    const passwordHash = await bcrypt.hash(body.data.password, 12);
    const [created] = await db
      .insert(users)
      .values({
        email: body.data.email.toLowerCase(),
        name: body.data.name,
        passwordHash,
        role: "customer",
        updatedAt: new Date(),
      })
      .returning();

    const emailTemplate = welcomeEmail(body.data.name.trim());
    sendEmail({
      to: created.email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    }).catch(() => undefined);

    return c.json(created, 201);
  });

  app.get("/me", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const user = await getUserById(authUserOrResponse.id);
    if (!user) {
      return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
    }

    return c.json(user, 200);
  });

  app.patch("/me", async (c) => {
    const authUserOrResponse = requireAuth(c);
    if (authUserOrResponse instanceof Response) return authUserOrResponse;

    const rawBody = await c.req.json().catch(() => null);
    const body = updateMeInputSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid profile payload.",
        },
        400
      );
    }

    if (body.data.defaultAddressId) {
      const [existingAddress] = await db
        .select({ id: addresses.id })
        .from(addresses)
        .where(
          and(
            eq(addresses.id, body.data.defaultAddressId),
            eq(addresses.userId, authUserOrResponse.id)
          )
        )
        .limit(1);

      if (!existingAddress) {
        return c.json(
          {
            code: "INVALID_DEFAULT_ADDRESS",
            message: "Default address must belong to the current user.",
          },
          400
        );
      }
    }

    const updated = await updateUser(authUserOrResponse.id, {
      defaultAddressId:
        body.data.defaultAddressId === null ? null : body.data.defaultAddressId,
      image: body.data.image ?? undefined,
      name: body.data.name ?? undefined,
      phone: body.data.phone ?? undefined,
    });

    if (!updated) {
      return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
    }

    return c.json(updated, 200);
  });
};

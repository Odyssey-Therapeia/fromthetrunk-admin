import bcrypt from "bcryptjs";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";

import { requireAdmin, requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import {
  adminCreateUserInputSchema,
  adminResetPasswordInputSchema,
  signUpInputSchema,
  updateMeInputSchema,
  updatePasswordInputSchema,
} from "@/api/hono/schemas/users";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import { getUserByEmail, getUserById, listUsers, updateUser } from "@/db/queries/users";
import { requireFirstRow } from "@/db/results";
import { addresses, users } from "@/db/schema";
import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";
import { rateLimitResponse } from "@/lib/http/rate-limit";

export const registerUserRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "Users list (admin only)" },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const users = await listUsers({
        limit: 200,
        offset: 0,
      });
      return c.json(users, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/admins",
      request: {
        body: {
          content: {
            "application/json": { schema: adminCreateUserInputSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Admin user created" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Email already registered",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");
      const existing = await getUserByEmail(body.email);
      if (existing) {
        return c.json(
          {
            code: "EMAIL_ALREADY_REGISTERED",
            message: "An account with this email already exists.",
          },
          409
        );
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const created = requireFirstRow(
        await db
          .insert(users)
          .values({
            email: body.email.toLowerCase(),
            name: body.name,
            passwordHash,
            role: "admin",
            updatedAt: new Date(),
          })
          .returning(),
        "Failed to create admin user."
      );

      return c.json(created, 201);
    }
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/sign-up",
      request: {
        body: {
          content: {
            "application/json": { schema: signUpInputSchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "User created" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Email already registered",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const rateLimited = rateLimitResponse(c.req.raw, "auth:signup", {
        limit: 5,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const body = c.req.valid("json");
      const existing = await getUserByEmail(body.email);
      if (existing) {
        return c.json(
          {
            code: "EMAIL_ALREADY_REGISTERED",
            message: "An account with this email already exists.",
          },
          409
        );
      }

      const passwordHash = await bcrypt.hash(body.password, 12);
      const created = requireFirstRow(
        await db
          .insert(users)
          .values({
            email: body.email.toLowerCase(),
            name: body.name,
            passwordHash,
            role: "customer",
            updatedAt: new Date(),
          })
          .returning(),
        "Failed to create user."
      );

      const emailTemplate = welcomeEmail(body.name.trim());
      sendEmail({
        to: created.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
      }).catch(() => undefined);

      return c.json(created, 201);
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/me",
      responses: {
        200: { description: "Current user profile" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "User not found",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const user = await getUserById(authUserOrResponse.id);
      if (!user) {
        return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
      }

      return c.json(user, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/me/password",
      request: {
        body: {
          content: {
            "application/json": { schema: updatePasswordInputSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Current user password updated" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        401: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid current password",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "User not found",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");
      const user = await getUserById(authUserOrResponse.id);
      if (!user) {
        return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
      }

      if (!user.passwordHash) {
        return c.json(
          {
            code: "PASSWORD_NOT_SET",
            message: "This account does not have a password set yet.",
          },
          400
        );
      }

      const currentPasswordMatches = await bcrypt.compare(body.currentPassword, user.passwordHash);
      if (!currentPasswordMatches) {
        return c.json(
          {
            code: "INVALID_CURRENT_PASSWORD",
            message: "Current password is incorrect.",
          },
          401
        );
      }

      const passwordHash = await bcrypt.hash(body.newPassword, 12);
      const updated = await updateUser(authUserOrResponse.id, {
        passwordHash,
      });

      if (!updated) {
        return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
      }

      return c.json({ success: true }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/{id}/password",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: adminResetPasswordInputSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "User password updated by admin" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Password reset only supports admin targets",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "User not found",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const user = await getUserById(id);
      if (!user) {
        return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
      }

      if (user.role !== "admin") {
        return c.json(
          {
            code: "ADMIN_PASSWORD_RESET_REQUIRES_ADMIN_TARGET",
            message: "Only admin accounts can be updated from this admin password flow.",
          },
          400
        );
      }

      const passwordHash = await bcrypt.hash(body.newPassword, 12);
      const updated = await updateUser(id, {
        passwordHash,
      });

      if (!updated) {
        return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
      }

      return c.json({ success: true }, 200);
    }
  );

  app.openapi(
    createRoute({
      method: "patch",
      path: "/me",
      request: {
        body: {
          content: {
            "application/json": { schema: updateMeInputSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Current user profile updated" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "User not found",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");
      if (body.defaultAddressId) {
        const [existingAddress] = await db
          .select({ id: addresses.id })
          .from(addresses)
          .where(
            and(
              eq(addresses.id, body.defaultAddressId),
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
          body.defaultAddressId === null ? null : body.defaultAddressId,
        image: body.image ?? undefined,
        name: body.name ?? undefined,
        phone: body.phone ?? undefined,
      });

      if (!updated) {
        return c.json({ code: "USER_NOT_FOUND", message: "User not found." }, 404);
      }

      return c.json(updated, 200);
    }
  );
};

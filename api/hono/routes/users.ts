import bcrypt from "bcryptjs";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { and, eq } from "drizzle-orm";

import { requireAdmin, requireAuth } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import {
  adminCreateUserInputSchema,
  requestEmailChangeInputSchema,
  signUpInputSchema,
  updateMeInputSchema,
  updatePasswordInputSchema,
} from "@/api/hono/schemas/users";
import type { HonoBindings } from "@/api/hono/types";
import { db } from "@/db";
import {
  claimCheckoutShell,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUser,
} from "@/db/queries/users";
import { requireFirstRow } from "@/db/results";
import { addresses, users } from "@/db/schema";
import { getSiteOrigin } from "@/lib/config/site";
import { sendEmail } from "@/lib/email/send";
import {
  emailChangeVerificationEmail,
  welcomeEmail,
} from "@/lib/email/templates";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import {
  createEmailVerificationToken,
  verifyEmailVerificationToken,
} from "@/lib/users/email-verification-token";

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
    },
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
          409,
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
        "Failed to create admin user.",
      );

      return c.json(created, 201);
    },
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
      const rateLimited = await rateLimitResponse(c.req.raw, "auth:signup", {
        limit: 5,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const body = c.req.valid("json");
      const existing = await getUserByEmail(body.email);

      if (existing) {
        const isCheckoutShell =
          !existing.passwordHash &&
          (existing.metadata as Record<string, unknown> | null)?.source ===
            "checkout";

        if (!isCheckoutShell) {
          return c.json(
            {
              code: "EMAIL_ALREADY_REGISTERED",
              message: "An account with this email already exists.",
            },
            409,
          );
        }

        const passwordHash = await bcrypt.hash(body.password, 12);
        const upgraded = await claimCheckoutShell(existing.id, {
          passwordHash,
          ...(body.name ? { name: body.name } : {}),
        });

        if (!upgraded) {
          return c.json(
            {
              code: "EMAIL_ALREADY_REGISTERED",
              message: "An account with this email already exists.",
            },
            409,
          );
        }

        const emailTemplate = welcomeEmail(body.name.trim());
        sendEmail({
          to: existing.email,
          subject: emailTemplate.subject,
          html: emailTemplate.html,
        }).catch(() => undefined);

        return c.json(upgraded, 201);
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
        "Failed to create user.",
      );

      const emailTemplate = welcomeEmail(body.name.trim());
      sendEmail({
        to: created.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
      }).catch(() => undefined);

      return c.json(created, 201);
    },
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
        return c.json(
          { code: "USER_NOT_FOUND", message: "User not found." },
          404,
        );
      }

      return c.json(user, 200);
    },
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
        return c.json(
          { code: "USER_NOT_FOUND", message: "User not found." },
          404,
        );
      }

      if (!user.passwordHash) {
        return c.json(
          {
            code: "PASSWORD_NOT_SET",
            message: "This account does not have a password set yet.",
          },
          400,
        );
      }

      const currentPasswordMatches = await bcrypt.compare(
        body.currentPassword,
        user.passwordHash,
      );

      if (!currentPasswordMatches) {
        return c.json(
          {
            code: "INVALID_CURRENT_PASSWORD",
            message: "Current password is incorrect.",
          },
          401,
        );
      }

      const passwordHash = await bcrypt.hash(body.newPassword, 12);
      const updated = await updateUser(authUserOrResponse.id, {
        passwordHash,
      });

      if (!updated) {
        return c.json(
          { code: "USER_NOT_FOUND", message: "User not found." },
          404,
        );
      }

      return c.json({ success: true }, 200);
    },
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
              eq(addresses.userId, authUserOrResponse.id),
            ),
          )
          .limit(1);

        if (!existingAddress) {
          return c.json(
            {
              code: "INVALID_DEFAULT_ADDRESS",
              message: "Default address must belong to the current user.",
            },
            400,
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
        return c.json(
          { code: "USER_NOT_FOUND", message: "User not found." },
          404,
        );
      }

      return c.json(updated, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/me/email",
      request: {
        body: {
          content: {
            "application/json": { schema: requestEmailChangeInputSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Verification email sent" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid payload",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Email already in use",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const rateLimited = await rateLimitResponse(
        c.req.raw,
        "email-change:request",
        {
          limit: 5,
          windowSeconds: 60,
        },
      );
      if (rateLimited) return rateLimited;

      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const body = c.req.valid("json");
      const newEmail = body.newEmail.trim().toLowerCase();

      const currentUser = await getUserById(authUserOrResponse.id);

      if (!currentUser) {
        return c.json(
          { code: "USER_NOT_FOUND", message: "User not found." },
          404,
        );
      }

      if (currentUser.email === newEmail) {
        return c.json(
          {
            code: "EMAIL_UNCHANGED",
            message: "The new email address is the same as the current one.",
          },
          400,
        );
      }

      const collision = await getUserByEmail(newEmail);

      if (collision) {
        return c.json(
          {
            code: "EMAIL_ALREADY_IN_USE",
            message:
              "This email address is already registered to another account.",
          },
          409,
        );
      }

      const token = createEmailVerificationToken(
        authUserOrResponse.id,
        newEmail,
      );
      const verifyUrl = `${getSiteOrigin()}/account/profile/verify-email?token=${encodeURIComponent(
        token,
      )}`;
      const emailTemplate = emailChangeVerificationEmail(verifyUrl);

      sendEmail({
        to: newEmail,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
      }).catch(() => undefined);

      return c.json({ success: true }, 200);
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/me/verify-email",
      responses: {
        200: { description: "Email verified and updated" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid or expired token",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Email already in use",
        },
      },
      tags: ["Users"],
    }),
    async (c) => {
      const authUserOrResponse = requireAuth(c);
      if (authUserOrResponse instanceof Response) return authUserOrResponse;

      const tokenParam = c.req.query("token");
      const result = verifyEmailVerificationToken(tokenParam);

      if (!result.valid) {
        return c.json(
          {
            code: "INVALID_OR_EXPIRED_TOKEN",
            message: "The verification link is invalid or has expired.",
          },
          400,
        );
      }

      if (result.userId !== authUserOrResponse.id) {
        return c.json(
          {
            code: "INVALID_OR_EXPIRED_TOKEN",
            message: "The verification link is invalid or has expired.",
          },
          400,
        );
      }

      const newEmail = result.newEmail.toLowerCase();

      const collision = await getUserByEmail(newEmail);

      if (collision && collision.id !== authUserOrResponse.id) {
        return c.json(
          {
            code: "EMAIL_ALREADY_IN_USE",
            message:
              "This email address is already registered to another account.",
          },
          409,
        );
      }

      const updated = await updateUser(authUserOrResponse.id, {
        email: newEmail,
        emailVerified: new Date(),
      });

      if (!updated) {
        return c.json(
          { code: "USER_NOT_FOUND", message: "User not found." },
          404,
        );
      }

      return c.json({ success: true, email: updated.email }, 200);
    },
  );
};

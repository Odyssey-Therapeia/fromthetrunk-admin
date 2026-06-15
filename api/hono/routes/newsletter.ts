import crypto from "crypto";
import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { errorSchema } from "@/api/hono/schemas/common";
import { newsletterConfirmQuerySchema, newsletterSubscribeSchema } from "@/api/hono/schemas/newsletter";
import type { HonoBindings } from "@/api/hono/types";
import { confirmSubscription, subscribe } from "@/db/queries/newsletter";
import { sendEmail } from "@/lib/email/send";
import { newsletterConfirmationEmail } from "@/lib/email/templates";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { getSiteOrigin } from "@/lib/config/site";

export const registerNewsletterRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.openapi(
    createRoute({
      method: "post",
      path: "/subscribe",
      request: {
        body: {
          content: {
            "application/json": { schema: newsletterSubscribeSchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Newsletter subscription accepted" },
      },
      tags: ["Newsletter"],
    }),
    async (c) => {
      const rateLimited = await rateLimitResponse(c.req.raw, "newsletter:sub", {
        limit: 3,
        windowSeconds: 60,
      });
      if (rateLimited) return rateLimited;

      const body = c.req.valid("json");
      const hasEmailProvider = Boolean(process.env.RESEND_API_KEY);
      if (!hasEmailProvider) {
        await subscribe(body.email, null);
        return c.json(
          {
            message: "You're subscribed. We'll share new drops with you soon.",
            requiresEmailConfirmation: false,
            subscribed: true,
          },
          200
        );
      }

      const confirmToken = crypto.randomBytes(32).toString("hex");
      await subscribe(body.email, confirmToken);

      const baseUrl = getSiteOrigin();
      const confirmUrl = `${baseUrl}/api/v2/newsletter/confirm?token=${confirmToken}&email=${encodeURIComponent(
        body.email
      )}`;
      const emailTemplate = newsletterConfirmationEmail(confirmUrl);
      await sendEmail({
        to: body.email,
        subject: emailTemplate.subject,
        html: emailTemplate.html,
      });

      return c.json(
        {
          message: "Check your email to confirm your subscription.",
          requiresEmailConfirmation: true,
          subscribed: true,
        },
        200
      );
    }
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/confirm",
      request: {
        query: newsletterConfirmQuerySchema,
      },
      responses: {
        302: { description: "Redirect to confirmation page" },
        404: {
          content: {
            "application/json": { schema: errorSchema },
          },
          description: "Subscription not found",
        },
      },
      tags: ["Newsletter"],
    }),
    async (c) => {
      const query = c.req.valid("query");
      const confirmed = await confirmSubscription(query.token);
      if (!confirmed) {
        return c.json(
          {
            code: "NOT_FOUND",
            message: "Subscription not found.",
          },
          404
        );
      }

      const baseUrl = getSiteOrigin();
      return c.redirect(`${baseUrl}/?newsletter=confirmed`, 302);
    }
  );
};

import crypto from "crypto";
import { OpenAPIHono } from "@hono/zod-openapi";

import { newsletterConfirmQuerySchema, newsletterSubscribeSchema } from "@/api/hono/schemas/newsletter";
import type { HonoBindings } from "@/api/hono/types";
import { confirmSubscription, subscribe } from "@/db/queries/newsletter";
import { sendEmail } from "@/lib/email/send";
import { newsletterConfirmationEmail } from "@/lib/email/templates";

export const registerNewsletterRoutes = (app: OpenAPIHono<HonoBindings>) => {
  app.post("/subscribe", async (c) => {
    const rawBody = await c.req.json().catch(() => null);
    const body = newsletterSubscribeSchema.safeParse(rawBody);
    if (!body.success) {
      return c.json(
        {
          code: "INVALID_BODY",
          details: body.error.flatten(),
          message: "Invalid newsletter payload.",
        },
        400
      );
    }

    const hasEmailProvider = Boolean(process.env.RESEND_API_KEY);
    if (!hasEmailProvider) {
      await subscribe(body.data.email, null);
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
    await subscribe(body.data.email, confirmToken);

    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";
    const confirmUrl = `${baseUrl}/api/v2/newsletter/confirm?token=${confirmToken}&email=${encodeURIComponent(
      body.data.email
    )}`;
    const emailTemplate = newsletterConfirmationEmail(confirmUrl);
    await sendEmail({
      to: body.data.email,
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
  });

  app.get("/confirm", async (c) => {
    const query = newsletterConfirmQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        {
          code: "INVALID_QUERY",
          details: query.error.flatten(),
          message: "Invalid newsletter confirmation query.",
        },
        400
      );
    }

    const confirmed = await confirmSubscription(query.data.token);
    if (!confirmed) {
      return c.json(
        {
          code: "NOT_FOUND",
          message: "Subscription not found.",
        },
        404
      );
    }

    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL ?? "http://localhost:3000";
    return c.redirect(`${baseUrl}/?newsletter=confirmed`, 302);
  });
};

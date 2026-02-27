import crypto from "crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { sendEmail } from "@/lib/email/send";
import { newsletterConfirmationEmail } from "@/lib/email/templates";
import { errorResponse } from "@/lib/http/error-response";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { getPayloadClient } from "@/lib/payload/server";

const subscribeSchema = z.object({
  email: z.string().email().max(320),
});

export async function POST(request: Request) {
  // Rate limit: 3 subscribe attempts per minute per IP
  const rateLimited = rateLimitResponse(request, "newsletter:sub", {
    limit: 3,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = subscribeSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid email address.", "VALIDATION_ERROR");
    }

    const payload = await getPayloadClient();
    const email = parsed.data.email.toLowerCase().trim();
    const hasEmailProvider = Boolean(process.env.RESEND_API_KEY);

    // Check for existing subscriber
    const existing = await payload.find({
      collection: "newsletter_subscribers",
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) {
      const subscriber = existing.docs[0] as Record<string, unknown>;
      if (subscriber.status === "confirmed") {
        return NextResponse.json({
          subscribed: true,
          requiresEmailConfirmation: false,
          message: "You're already subscribed.",
        });
      }
      // Re-send confirmation for pending subscribers
    }

    if (!hasEmailProvider) {
      if (existing.docs.length > 0) {
        await payload.update({
          collection: "newsletter_subscribers",
          id: existing.docs[0].id,
          data: {
            status: "confirmed",
            confirmedAt: new Date().toISOString(),
            confirmToken: null,
          } as Record<string, unknown>,
          overrideAccess: true,
        });
      } else {
        await payload.create({
          collection: "newsletter_subscribers",
          data: {
            email,
            status: "confirmed",
            confirmedAt: new Date().toISOString(),
            confirmToken: null,
          } as Record<string, unknown>,
          overrideAccess: true,
        });
      }

      return NextResponse.json({
        subscribed: true,
        requiresEmailConfirmation: false,
        message: "You're subscribed. We'll share new drops with you soon.",
      });
    }

    const confirmToken = crypto.randomBytes(32).toString("hex");

    if (existing.docs.length > 0) {
      await payload.update({
        collection: "newsletter_subscribers",
        id: existing.docs[0].id,
        data: { confirmToken, status: "pending" } as Record<string, unknown>,
        overrideAccess: true,
      });
    } else {
      await payload.create({
        collection: "newsletter_subscribers",
        data: {
          email,
          status: "pending",
          confirmToken,
        } as Record<string, unknown>,
        overrideAccess: true,
      });
    }

    // Send confirmation email
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "[REDACTED]";
    const confirmUrl = `${baseUrl}/api/newsletter/confirm?token=${confirmToken}&email=${encodeURIComponent(email)}`;
    const emailTemplate = newsletterConfirmationEmail(confirmUrl);

    await sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    });

    return NextResponse.json({
      subscribed: true,
      requiresEmailConfirmation: true,
      message: "Check your email to confirm your subscription.",
    });
  } catch {
    return errorResponse(500, "Unable to subscribe.", "SUBSCRIBE_FAILED");
  }
}

import { NextResponse } from "next/server";

import { sendEmail } from "@/lib/email/send";
import { welcomeEmail } from "@/lib/email/templates";
import { errorResponse } from "@/lib/http/error-response";
import { rateLimitResponse } from "@/lib/http/rate-limit";
import { getPayloadClient } from "@/lib/payload/server";
import { customerSignUpSchema } from "@/lib/validation/account";

export async function POST(request: Request) {
  const rateLimited = rateLimitResponse(request, "auth:signup", {
    limit: 5,
    windowSeconds: 60,
  });
  if (rateLimited) return rateLimited;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = customerSignUpSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        400,
        "Invalid sign-up payload.",
        "VALIDATION_ERROR",
        parsed.error.flatten()
      );
    }

    const payload = await getPayloadClient();
    const email = parsed.data.email.trim().toLowerCase();

    const existing = await payload.find({
      collection: "users",
      where: {
        email: {
          equals: email,
        },
      },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) {
      return errorResponse(
        409,
        "An account with this email already exists.",
        "EMAIL_ALREADY_REGISTERED"
      );
    }

    await payload.create({
      collection: "users",
      data: {
        email,
        name: parsed.data.name.trim(),
        password: parsed.data.password,
        role: "customer",
      },
      overrideAccess: true,
    });

    const emailTemplate = welcomeEmail(parsed.data.name.trim());
    sendEmail({
      to: email,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
    }).catch(() => undefined);

    return NextResponse.json({
      created: true,
      message: "Account created successfully. Please sign in to continue.",
    });
  } catch {
    return errorResponse(500, "Unable to create account.", "SIGN_UP_FAILED");
  }
}

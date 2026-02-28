import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

export async function GET(request: NextRequest) {
  try {
    const token = request.nextUrl.searchParams.get("token");
    const email = request.nextUrl.searchParams.get("email");

    if (!token || !email) {
      return errorResponse(400, "Missing token or email.", "INVALID_PARAMS");
    }

    const payload = await getPayloadClient();

    const result = await payload.find({
      collection: "newsletter_subscribers",
      where: {
        and: [
          { email: { equals: email.toLowerCase().trim() } },
          { confirmToken: { equals: token } },
        ],
      },
      limit: 1,
      overrideAccess: true,
    });

    if (result.docs.length === 0) {
      return errorResponse(404, "Subscription not found.", "NOT_FOUND");
    }

    await payload.update({
      collection: "newsletter_subscribers",
      id: result.docs[0].id,
      data: {
        status: "confirmed",
        confirmedAt: new Date().toISOString(),
        confirmToken: null,
      } as Record<string, unknown>,
      overrideAccess: true,
    });

    // Redirect to homepage with success message
    const baseUrl = process.env.NEXT_PUBLIC_SERVER_URL || "http://localhost:3000";
    return NextResponse.redirect(new URL("/?newsletter=confirmed", baseUrl));
  } catch {
    return errorResponse(500, "Unable to confirm subscription.", "CONFIRM_FAILED");
  }
}

import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/http/error-response";
import { verifyBearerSecret } from "@/lib/http/verify-secret";
import { getPayloadClient } from "@/lib/payload/server";

/**
 * GET/POST /api/cron/release-reservations
 *
 * Releases expired product reservations.  Products that have
 * stockStatus = "reserved" and reservedUntil < now are set back
 * to "available".
 *
 * Called by:
 * - Vercel Cron (sends GET with CRON_SECRET in authorization header)
 * - External schedulers like Upstash QStash or GitHub Actions (POST)
 *
 * Protected by a shared secret in the Authorization header.
 */
async function handleCron(request: NextRequest) {
  try {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return errorResponse(
        500,
        "CRON_SECRET is not configured.",
        "CRON_SECRET_MISSING"
      );
    }

    const authHeader = request.headers.get("authorization");
    if (!verifyBearerSecret(authHeader, cronSecret)) {
      return errorResponse(401, "Invalid cron secret.", "UNAUTHORIZED");
    }

    const payload = await getPayloadClient();

    // Find all products that have an expired reservation
    const now = new Date().toISOString();
    const expired = await payload.find({
      collection: "products",
      where: {
        and: [
          { stockStatus: { equals: "reserved" } },
          { reservedUntil: { less_than: now } },
        ],
      },
      limit: 100,
      overrideAccess: true,
    });

    let released = 0;
    for (const product of expired.docs) {
      await payload.update({
        collection: "products",
        id: product.id,
        data: {
          stockStatus: "available",
          reservedUntil: null,
        } as Record<string, unknown>,
        overrideAccess: true,
      });
      released++;
    }

    return NextResponse.json({
      ok: true,
      released,
      checked: expired.totalDocs,
      timestamp: now,
    });
  } catch {
    return errorResponse(
      500,
      "Failed to release reservations.",
      "CRON_FAILED"
    );
  }
}

// Vercel Cron sends GET requests
export async function GET(request: NextRequest) {
  return handleCron(request);
}

// External schedulers may use POST
export async function POST(request: NextRequest) {
  return handleCron(request);
}

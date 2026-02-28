import { NextResponse } from "next/server";
import { z } from "zod";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

const normalizeIds = (items: Array<string | { id: string }> | undefined) =>
  (items ?? []).map((item) => (typeof item === "string" ? item : item.id));

/**
 * GET  /api/account/wishlist         — list wishlist product IDs
 * POST /api/account/wishlist         — add product to wishlist
 * DELETE /api/account/wishlist       — remove product from wishlist
 */

export async function GET() {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const payload = await getPayloadClient();
    const user = await payload.findByID({
      collection: "users",
      id: session.user.id,
      depth: 2,
      overrideAccess: true,
    });

    const wishlist = (user as Record<string, unknown>).wishlist as unknown[] | undefined;
    return NextResponse.json({ wishlist: wishlist ?? [] });
  } catch {
    return errorResponse(500, "Unable to load wishlist.", "WISHLIST_FETCH_FAILED");
  }
}

const mutationSchema = z.object({
  productId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const body = await request.json().catch(() => null);
    const parsed = mutationSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid payload.", "VALIDATION_ERROR");
    }

    const payload = await getPayloadClient();
    const user = await payload.findByID({
      collection: "users",
      id: session.user.id,
      overrideAccess: true,
    });

    const currentWishlist = normalizeIds(
      (user as Record<string, unknown>).wishlist as Array<string | { id: string }> | undefined
    );

    if (currentWishlist.includes(parsed.data.productId)) {
      return NextResponse.json({ added: false, message: "Already in wishlist." });
    }

    await payload.update({
      collection: "users",
      id: session.user.id,
      data: {
        wishlist: [...currentWishlist, parsed.data.productId],
      } as Record<string, unknown>,
      overrideAccess: true,
    });

    return NextResponse.json({ added: true });
  } catch {
    return errorResponse(500, "Unable to update wishlist.", "WISHLIST_ADD_FAILED");
  }
}

export async function DELETE(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return errorResponse(401, "Unauthorized", "UNAUTHORIZED");
    }

    const body = await request.json().catch(() => null);
    const parsed = mutationSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(400, "Invalid payload.", "VALIDATION_ERROR");
    }

    const payload = await getPayloadClient();
    const user = await payload.findByID({
      collection: "users",
      id: session.user.id,
      overrideAccess: true,
    });

    const currentWishlist = normalizeIds(
      (user as Record<string, unknown>).wishlist as Array<string | { id: string }> | undefined
    );

    await payload.update({
      collection: "users",
      id: session.user.id,
      data: {
        wishlist: currentWishlist.filter((id) => id !== parsed.data.productId),
      } as Record<string, unknown>,
      overrideAccess: true,
    });

    return NextResponse.json({ removed: true });
  } catch {
    return errorResponse(500, "Unable to update wishlist.", "WISHLIST_REMOVE_FAILED");
  }
}

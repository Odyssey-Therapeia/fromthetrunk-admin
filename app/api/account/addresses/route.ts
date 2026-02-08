import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";
import { addressCreateSchema } from "@/lib/validation/account";

const normalizeAddressIds = (addresses: any[] | undefined) =>
  (addresses ?? []).map((address) => (typeof address === "string" ? address : address.id));
const unauthorized = () => errorResponse(401, "Unauthorized", "UNAUTHORIZED");

export async function GET() {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return unauthorized();
    }

    const payload = await getPayloadClient();
    const result = await payload.find({
      collection: "addresses",
      where: { user: { equals: session.user.id } },
      sort: "-createdAt",
      limit: 100,
      overrideAccess: true,
    });

    return NextResponse.json({ addresses: result.docs });
  } catch {
    return errorResponse(500, "Unable to load addresses.", "ADDRESSES_FETCH_FAILED");
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return unauthorized();
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = addressCreateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        400,
        "Invalid address payload.",
        "VALIDATION_ERROR",
        parsed.error.flatten()
      );
    }

    const payload = await getPayloadClient();
    const address = await payload.create({
      collection: "addresses",
      data: {
        user: session.user.id,
        ...parsed.data,
        isDefault: Boolean(parsed.data.isDefault),
      },
      overrideAccess: true,
    });

    const user = await payload.findByID({
      collection: "users",
      id: session.user.id,
      overrideAccess: true,
    });

    const updatedAddresses = Array.from(
      new Set([...normalizeAddressIds(user.addresses), address.id])
    );

    await payload.update({
      collection: "users",
      id: session.user.id,
      data: {
        addresses: updatedAddresses,
        defaultAddress: parsed.data.isDefault ? address.id : user.defaultAddress ?? null,
      },
      overrideAccess: true,
    });

    if (parsed.data.isDefault) {
      const others = await payload.find({
        collection: "addresses",
        where: {
          and: [
            { user: { equals: session.user.id } },
            { id: { not_equals: address.id } },
          ],
        },
        limit: 100,
        overrideAccess: true,
      });

      await Promise.all(
        others.docs.map((doc) =>
          payload.update({
            collection: "addresses",
            id: doc.id,
            data: { isDefault: false },
            overrideAccess: true,
          })
        )
      );
    }

    return NextResponse.json({ address });
  } catch {
    return errorResponse(500, "Unable to save address.", "ADDRESS_CREATE_FAILED");
  }
}

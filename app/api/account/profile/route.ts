import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";
import { profilePatchSchema } from "@/lib/validation/account";

const unauthorized = () => errorResponse(401, "Unauthorized", "UNAUTHORIZED");

export async function GET() {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return unauthorized();
    }

    const payload = await getPayloadClient();
    const user = await payload.findByID({
      collection: "users",
      id: session.user.id,
      overrideAccess: true,
    });

    return NextResponse.json({
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      image: user.image,
      defaultAddress: user.defaultAddress,
    });
  } catch {
    return errorResponse(500, "Unable to fetch profile.", "PROFILE_FETCH_FAILED");
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return unauthorized();
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = profilePatchSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        400,
        "Invalid profile payload.",
        "VALIDATION_ERROR",
        parsed.error.flatten()
      );
    }

    const payload = await getPayloadClient();
    let defaultAddress: null | string | undefined = parsed.data.defaultAddress;

    if (defaultAddress) {
      try {
        const address = await payload.findByID({
          collection: "addresses",
          id: defaultAddress,
          overrideAccess: true,
        });
        const addressOwner = typeof address.user === "object" ? address.user.id : address.user;

        if (addressOwner !== session.user.id) {
          return errorResponse(
            400,
            "Default address must belong to the current user.",
            "INVALID_DEFAULT_ADDRESS"
          );
        }
      } catch {
        return errorResponse(
          400,
          "Default address was not found.",
          "INVALID_DEFAULT_ADDRESS"
        );
      }
    } else if (defaultAddress === null) {
      defaultAddress = null;
    }

    const updated = await payload.update({
      collection: "users",
      id: session.user.id,
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone,
        defaultAddress,
      },
      overrideAccess: true,
    });

    return NextResponse.json({
      id: updated.id,
      email: updated.email,
      name: updated.name,
      phone: updated.phone,
      image: updated.image,
      defaultAddress: updated.defaultAddress,
    });
  } catch {
    return errorResponse(500, "Unable to update profile.", "PROFILE_UPDATE_FAILED");
  }
}

import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";
import { addressUpdateSchema } from "@/lib/validation/account";

const normalizeAddressIds = (addresses: Array<string | { id: string }> | undefined) =>
  (addresses ?? []).map((address) => (typeof address === "string" ? address : address.id));
const unauthorized = () => errorResponse(401, "Unauthorized", "UNAUTHORIZED");
const forbidden = () => errorResponse(403, "Forbidden", "FORBIDDEN");

const resolveParams = async (
  params: Promise<{ id: string }> | { id: string }
) => await Promise.resolve(params);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return unauthorized();
    }

    const { id } = await resolveParams(params);
    const payload = await getPayloadClient();
    let address: Record<string, unknown>;

    try {
      address = await payload.findByID({
        collection: "addresses",
        id,
        overrideAccess: true,
      }) as Record<string, unknown>;
    } catch {
      return errorResponse(404, "Address not found.", "ADDRESS_NOT_FOUND");
    }

    const addressUserRef = address.user;
    const addressUser = typeof addressUserRef === "object" && addressUserRef !== null
      ? (addressUserRef as Record<string, unknown>).id
      : addressUserRef;
    if (addressUser !== session.user.id) {
      return forbidden();
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return errorResponse(400, "Invalid request body.", "INVALID_REQUEST_BODY");
    }

    const parsed = addressUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return errorResponse(
        400,
        "Invalid address payload.",
        "VALIDATION_ERROR",
        parsed.error.flatten()
      );
    }

    const updated = await payload.update({
      collection: "addresses",
      id,
      data: {
        label: parsed.data.label ?? address.label,
        name: parsed.data.name ?? address.name,
        line1: parsed.data.line1 ?? address.line1,
        line2: parsed.data.line2 ?? address.line2,
        city: parsed.data.city ?? address.city,
        state: parsed.data.state ?? address.state,
        postalCode: parsed.data.postalCode ?? address.postalCode,
        country: parsed.data.country ?? address.country,
        phone: parsed.data.phone ?? address.phone,
        isDefault:
          typeof parsed.data.isDefault === "boolean"
            ? parsed.data.isDefault
            : address.isDefault,
      },
      overrideAccess: true,
    });

    if (typeof parsed.data.isDefault === "boolean") {
      const user = await payload.findByID({
        collection: "users",
        id: session.user.id,
        overrideAccess: true,
      });

      if (parsed.data.isDefault) {
        await payload.update({
          collection: "users",
          id: session.user.id,
          data: {
            defaultAddress: updated.id,
            addresses: normalizeAddressIds(user.addresses),
          },
          overrideAccess: true,
        });

        const others = await payload.find({
          collection: "addresses",
          where: {
            and: [
              { user: { equals: session.user.id } },
              { id: { not_equals: updated.id } },
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
      } else if (user.defaultAddress === updated.id) {
        await payload.update({
          collection: "users",
          id: session.user.id,
          data: {
            defaultAddress: null,
            addresses: normalizeAddressIds(user.addresses),
          },
          overrideAccess: true,
        });
      }
    }

    return NextResponse.json({ address: updated });
  } catch {
    return errorResponse(500, "Unable to update address.", "ADDRESS_UPDATE_FAILED");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerAuthSession();
    if (!session?.user?.id) {
      return unauthorized();
    }

    const { id } = await resolveParams(params);
    const payload = await getPayloadClient();
    let address: Record<string, unknown>;

    try {
      address = await payload.findByID({
        collection: "addresses",
        id,
        overrideAccess: true,
      }) as Record<string, unknown>;
    } catch {
      return errorResponse(404, "Address not found.", "ADDRESS_NOT_FOUND");
    }

    const delUserRef = address.user;
    const addressUser = typeof delUserRef === "object" && delUserRef !== null
      ? (delUserRef as Record<string, unknown>).id
      : delUserRef;
    if (addressUser !== session.user.id) {
      return forbidden();
    }

    await payload.delete({
      collection: "addresses",
      id,
      overrideAccess: true,
    });

    const user = await payload.findByID({
      collection: "users",
      id: session.user.id,
      overrideAccess: true,
    });

    const updatedAddresses = normalizeAddressIds(user.addresses).filter(
      (addressId) => addressId !== id
    );

    await payload.update({
      collection: "users",
      id: session.user.id,
      data: {
        addresses: updatedAddresses,
        defaultAddress: user.defaultAddress === id ? null : user.defaultAddress,
      },
      overrideAccess: true,
    });

    return NextResponse.json({ success: true });
  } catch {
    return errorResponse(500, "Unable to delete address.", "ADDRESS_DELETE_FAILED");
  }
}

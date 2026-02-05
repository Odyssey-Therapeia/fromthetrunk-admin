import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { getPayloadClient } from "@/lib/payload";

const normalizeAddressIds = (addresses: any[] | undefined) =>
  (addresses ?? []).map((address) => (typeof address === "string" ? address : address.id));

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();
  const address = await payload.findByID({
    collection: "addresses",
    id: params.id,
    overrideAccess: true,
  });

  const addressUser = typeof address.user === "object" ? address.user.id : address.user;
  if (addressUser !== session.user.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const updated = await payload.update({
    collection: "addresses",
    id: params.id,
    data: {
      label: body.label ?? address.label,
      name: body.name ?? address.name,
      line1: body.line1 ?? address.line1,
      line2: body.line2 ?? address.line2,
      city: body.city ?? address.city,
      state: body.state ?? address.state,
      postalCode: body.postalCode ?? address.postalCode,
      country: body.country ?? address.country,
      phone: body.phone ?? address.phone,
      isDefault: typeof body.isDefault === "boolean" ? body.isDefault : address.isDefault,
    },
    overrideAccess: true,
  });

  if (typeof body.isDefault === "boolean") {
    const user = await payload.findByID({
      collection: "users",
      id: session.user.id,
      overrideAccess: true,
    });

    if (body.isDefault) {
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
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();
  const address = await payload.findByID({
    collection: "addresses",
    id: params.id,
    overrideAccess: true,
  });

  const addressUser = typeof address.user === "object" ? address.user.id : address.user;
  if (addressUser !== session.user.id) {
    return NextResponse.json({ message: "Forbidden" }, { status: 403 });
  }

  await payload.delete({
    collection: "addresses",
    id: params.id,
    overrideAccess: true,
  });

  const user = await payload.findByID({
    collection: "users",
    id: session.user.id,
    overrideAccess: true,
  });

  const updatedAddresses = normalizeAddressIds(user.addresses).filter(
    (addressId) => addressId !== params.id
  );

  await payload.update({
    collection: "users",
    id: session.user.id,
    data: {
      addresses: updatedAddresses,
      defaultAddress: user.defaultAddress === params.id ? null : user.defaultAddress,
    },
    overrideAccess: true,
  });

  return NextResponse.json({ success: true });
}

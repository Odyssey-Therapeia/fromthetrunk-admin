import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { getPayloadClient } from "@/lib/payload";

const normalizeAddressIds = (addresses: any[] | undefined) =>
  (addresses ?? []).map((address) => (typeof address === "string" ? address : address.id));

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
}

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const payload = await getPayloadClient();

  const address = await payload.create({
    collection: "addresses",
    data: {
      user: session.user.id,
      label: body.label,
      name: body.name,
      line1: body.line1,
      line2: body.line2,
      city: body.city,
      state: body.state,
      postalCode: body.postalCode,
      country: body.country,
      phone: body.phone,
      isDefault: Boolean(body.isDefault),
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
      defaultAddress: body.isDefault ? address.id : user.defaultAddress ?? null,
    },
    overrideAccess: true,
  });

  if (body.isDefault) {
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
}

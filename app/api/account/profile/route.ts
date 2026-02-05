import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { getPayloadClient } from "@/lib/payload";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
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
}

export async function PATCH(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const payload = await getPayloadClient();
  const updated = await payload.update({
    collection: "users",
    id: session.user.id,
    data: {
      name: body.name,
      phone: body.phone,
      defaultAddress: body.defaultAddress ?? null,
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
}

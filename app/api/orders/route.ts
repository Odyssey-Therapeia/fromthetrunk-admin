import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { getPayloadClient } from "@/lib/payload";

export async function POST(request: Request) {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const payload = await getPayloadClient();

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return NextResponse.json({ message: "Cart is empty" }, { status: 400 });
  }

  const order = await payload.create({
    collection: "orders",
    data: {
      user: session.user.id,
      items: items.map((item: any) => ({
        product: item.productId ?? null,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        imageUrl: item.imageUrl,
      })),
      subtotal: body.subtotal ?? 0,
      status: "pending",
      shippingAddress: {
        name: body.shippingAddress?.name,
        line1: body.shippingAddress?.line1,
        line2: body.shippingAddress?.line2,
        city: body.shippingAddress?.city,
        state: body.shippingAddress?.state,
        postalCode: body.shippingAddress?.postalCode,
        country: body.shippingAddress?.country,
        phone: body.shippingAddress?.phone,
        email: body.shippingAddress?.email,
      },
      placedAt: new Date().toISOString(),
    },
    overrideAccess: true,
  });

  return NextResponse.json({ order });
}

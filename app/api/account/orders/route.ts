import { NextResponse } from "next/server";

import { getServerAuthSession } from "@/lib/auth/get-session";
import { getPayloadClient } from "@/lib/payload";

export async function GET() {
  const session = await getServerAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();
  const result = await payload.find({
    collection: "orders",
    where: { user: { equals: session.user.id } },
    sort: "-placedAt",
    limit: 50,
    overrideAccess: true,
  });

  return NextResponse.json({ orders: result.docs });
}

import { NextResponse } from "next/server";

import { getProduct } from "@/db/queries/products";
import { toPayloadProduct } from "@/lib/data/products";
import { forwardToV2, passThroughJson } from "@/lib/http/proxy-v2";

/**
 * GET  /api/account/wishlist         — list wishlist products
 * POST /api/account/wishlist         — add product to wishlist
 * DELETE /api/account/wishlist       — remove product from wishlist
 */
export async function GET(request: Request) {
  const response = await forwardToV2(request, "/wishlist", {
    preserveSearch: false,
  });
  if (!response.ok) {
    return passThroughJson(response);
  }

  const ids = (await response.json()) as string[];
  const products = (
    await Promise.all(ids.map(async (id) => await getProduct(id)))
  ).filter((product): product is NonNullable<typeof product> => Boolean(product));

  return NextResponse.json({
    wishlist: products.map(toPayloadProduct),
  });
}

export async function POST(request: Request) {
  const response = await forwardToV2(request, "/wishlist");
  return passThroughJson(response, (value) => {
    if (!response.ok) return value;
    return { added: true };
  });
}

export async function DELETE(request: Request) {
  const response = await forwardToV2(request, "/wishlist");
  return passThroughJson(response, (value) => {
    if (!response.ok) return value;
    return { removed: true };
  });
}

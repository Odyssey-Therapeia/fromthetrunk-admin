import { NextRequest, NextResponse } from "next/server";

import { searchProducts } from "@/lib/data/products";
import { errorResponse } from "@/lib/http/error-response";

/**
 * GET /api/search?q=silk&limit=12
 *
 * Searches products by name, fabric, designer, and era.
 */
export async function GET(request: NextRequest) {
  try {
    const query = request.nextUrl.searchParams.get("q")?.trim();
    const limit = Math.min(
      parseInt(request.nextUrl.searchParams.get("limit") ?? "12", 10),
      50
    );

    if (!query || query.length < 2) {
      return NextResponse.json({ docs: [], query: query ?? "" });
    }

    const result = await searchProducts(query, limit);
    return NextResponse.json({
      docs: result.docs,
      totalDocs: result.totalDocs,
      query,
    });
  } catch {
    return errorResponse(500, "Search failed.", "SEARCH_FAILED");
  }
}

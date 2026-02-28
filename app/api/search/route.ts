import { NextRequest, NextResponse } from "next/server";

import { errorResponse } from "@/lib/http/error-response";
import { getPayloadClient } from "@/lib/payload/server";

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

    const payload = await getPayloadClient();

    const result = await payload.find({
      collection: "products",
      depth: 2,
      limit,
      where: {
        and: [
          { status: { equals: "published" } },
          {
            or: [
              { name: { contains: query } },
              { "details.fabric": { contains: query } },
              { "details.designer": { contains: query } },
              { "story.era": { contains: query } },
              { "story.provenance": { contains: query } },
            ],
          },
        ],
      },
      sort: "-createdAt",
      overrideAccess: true,
    });

    return NextResponse.json({
      docs: result.docs,
      totalDocs: result.totalDocs,
      query,
    });
  } catch {
    return errorResponse(500, "Search failed.", "SEARCH_FAILED");
  }
}

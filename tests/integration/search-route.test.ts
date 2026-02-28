import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/payload/server", () => ({
  getPayloadClient: vi.fn(),
}));

import { GET } from "@/app/api/search/route";
import { getPayloadClient } from "@/lib/payload/server";

const makeRequest = (query?: string) => {
  const url = new URL("http://localhost/api/search");
  if (query !== undefined) url.searchParams.set("q", query);
  return new NextRequest(url);
};

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty for query shorter than 2 chars", async () => {
    const response = await GET(makeRequest("s"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.docs).toEqual([]);
  });

  it("returns empty for no query param", async () => {
    const response = await GET(makeRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.docs).toEqual([]);
  });

  it("searches products for valid query", async () => {
    vi.mocked(getPayloadClient).mockResolvedValue({
      find: vi.fn().mockResolvedValue({
        docs: [{ id: "p1", name: "Silk Saree", slug: "silk-saree" }],
        totalDocs: 1,
      }),
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const response = await GET(makeRequest("silk"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.docs).toHaveLength(1);
    expect(body.query).toBe("silk");
  });
});

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());
const productSlugExistsMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@/db/queries/products", () => ({
  productSlugExists: productSlugExistsMock,
}));

import { proxy } from "@/proxy";

describe("proxy product detail 404 guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
  });

  it("returns a real 404 before product detail pages stream missing slugs", async () => {
    productSlugExistsMock.mockResolvedValue(false);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/missing-saree")
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    expect(productSlugExistsMock).toHaveBeenCalledWith("missing-saree", {
      includeDrafts: false,
    });
  });

  it("allows existing product detail slugs through", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/published-saree")
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).toHaveBeenCalledWith("published-saree", {
      includeDrafts: false,
    });
  });

  it("does not block draft preview product links before the page can read draft mode", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/draft-saree", {
        headers: {
          cookie: "__prerender_bypass=preview-mode-token",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).not.toHaveBeenCalled();
  });

  it("handles malformed slug encoding without throwing", async () => {
    productSlugExistsMock.mockResolvedValue(false);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/%E0%A4%A")
    );

    expect(response.status).toBe(404);
    expect(productSlugExistsMock).toHaveBeenCalledWith("", {
      includeDrafts: false,
    });
  });
});

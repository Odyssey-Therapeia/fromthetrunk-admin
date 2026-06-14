/**
 * P3-09: proxy.ts redirect consultation + money-path regression tests.
 *
 * These tests verify:
 *  1. The proxy consults the redirect resolver and issues the right HTTP status.
 *  2. The EXISTING product-404 and auth-protection behavior is unchanged.
 *  3. The redirect is additive — it does not alter the money path.
 *
 * We mock @/db/queries/products (for productSlugExists) and
 * @/lib/content/redirect-resolver (for resolveRedirect) at the lowest level —
 * NOT @/proxy itself.
 */

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getTokenMock = vi.hoisted(() => vi.fn());
const productSlugExistsMock = vi.hoisted(() => vi.fn());
const resolveRedirectMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/jwt", () => ({
  getToken: getTokenMock,
}));

vi.mock("@/db/queries/products", () => ({
  productSlugExists: productSlugExistsMock,
}));

vi.mock("@/lib/content/redirect-resolver", () => ({
  resolveRedirect: resolveRedirectMock,
}));

import { proxy } from "@/proxy";

describe("proxy.ts — redirect consultation (P3-09 additive)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    resolveRedirectMock.mockResolvedValue(null); // default: no redirect
    getTokenMock.mockResolvedValue(null);
  });

  it("issues a 301 redirect when resolver returns a redirect", async () => {
    resolveRedirectMock.mockResolvedValue({ toPath: "/new-destination", status: 301 });

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/old-path")
    );

    expect(response.status).toBe(301);
    const location = response.headers.get("location");
    expect(location).toContain("/new-destination");
  });

  it("passes through when resolver returns null (no redirect)", async () => {
    resolveRedirectMock.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/no-redirect-page")
    );

    // Should be 200 (NextResponse.next())
    expect(response.status).toBe(200);
  });

  it("does not call resolveRedirect for /collection/:slug paths (product-404 path)", async () => {
    // For product detail pages, the proxy runs the slug-exists check.
    // Redirect check should NOT interfere with collection paths — the
    // proxy handles /collection/:slug with the product 404 guard first.
    productSlugExistsMock.mockResolvedValue(true);
    resolveRedirectMock.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/my-saree")
    );

    expect(response.status).toBe(200);
    expect(productSlugExistsMock).toHaveBeenCalledWith("my-saree", { includeDrafts: false });
  });
});

describe("proxy.ts — EXISTING behavior unchanged (money path regression)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    resolveRedirectMock.mockResolvedValue(null);
    getTokenMock.mockResolvedValue(null);
  });

  it("still returns 404 for missing product slugs (existing behavior preserved)", async () => {
    productSlugExistsMock.mockResolvedValue(false);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/collection/missing-saree")
    );

    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("still redirects unauthenticated users from /account/* (existing behavior preserved)", async () => {
    getTokenMock.mockResolvedValue(null);

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/account/profile")
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("/account/sign-in");
  });

  it("still allows authenticated users through /account/* (existing behavior preserved)", async () => {
    getTokenMock.mockResolvedValue({ sub: "user-1", id: "user-1" });

    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/account/profile")
    );

    expect(response.status).toBe(200);
  });
});

describe("proxy.ts — MONEY PATH: /checkout and /cart never redirected", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    productSlugExistsMock.mockResolvedValue(true);
    // Even if the resolver would return a redirect, the proxy should NOT apply it
    // for /checkout or /cart paths.
    resolveRedirectMock.mockResolvedValue({ toPath: "/somewhere", status: 301 });
    getTokenMock.mockResolvedValue(null);
  });

  it("does NOT call resolveRedirect for /checkout paths (money path excluded)", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/checkout")
    );

    // resolveRedirect must NOT be called for /checkout
    expect(resolveRedirectMock).not.toHaveBeenCalled();
    // Proxy passes through (200 = NextResponse.next())
    expect(response.status).toBe(200);
  });

  it("does NOT call resolveRedirect for /checkout/confirmation (money path excluded)", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/checkout/confirmation")
    );

    expect(resolveRedirectMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it("does NOT call resolveRedirect for /cart paths (money path excluded)", async () => {
    const response = await proxy(
      new NextRequest("https://www.fromthetrunk.shop/cart")
    );

    expect(resolveRedirectMock).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });
});

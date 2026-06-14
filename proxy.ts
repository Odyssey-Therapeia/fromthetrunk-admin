import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import { productSlugExists } from "@/db/queries/products";
import { resolveRedirect } from "@/lib/content/redirect-resolver";

/**
 * Proxy handles:
 * 1. Route protection — redirect unauthenticated users from protected paths
 * 2. Security — additional runtime security checks
 * 3. P3-09: Managed redirects — consult the redirects table for any path
 *    not handled by the product-404 or auth checks above.
 *
 * Renamed from middleware.ts to proxy.ts for Next.js 16 convention.
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 *
 * CRITICAL: the redirect consultation is ADDITIVE.
 * The product-404 guard and auth-protection logic are unchanged.
 * Redirect paths excluded from consultation:
 *   - /api/* (Hono API routes — never redirect)
 *   - /collection/:slug (product 404 guard runs instead)
 *   - /account/* (auth protection runs instead)
 *   - Next.js internals (_next/*)
 */

const protectedPaths = [
  "/account/profile",
  "/account/addresses",
  "/account/orders",
  "/account/wishlist",
];

const isProtected = (pathname: string) =>
  protectedPaths.some((prefix) => pathname.startsWith(prefix));

const isDraftPreviewRequest = (request: NextRequest) =>
  request.cookies.has("__prerender_bypass") ||
  request.cookies.has("__next_preview_data");

const getProductDetailSlug = (pathname: string) => {
  const match = pathname.match(/^\/collection\/([^/]+)\/?$/);
  if (!match) return null;

  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return "";
  }
};

/**
 * Paths excluded from redirect consultation.
 * These are handled by dedicated logic above (product 404, auth) or must
 * never be intercepted (API routes, Next.js internals).
 *
 * MONEY PATH GUARD: /checkout/* and /cart/* are explicitly excluded so that
 * an admin-created redirect can never break the guest-checkout payment flow.
 * Even if a redirect row exists for /checkout or /cart, the proxy will pass
 * through to the Next.js route handler unchanged.
 */
const isExcludedFromRedirectCheck = (pathname: string): boolean =>
  pathname.startsWith("/_next/") ||
  pathname.startsWith("/api/") ||
  pathname.startsWith("/account/") ||
  pathname.startsWith("/collection/") ||
  pathname.startsWith("/checkout") ||
  pathname.startsWith("/cart");

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();
  const productSlug = getProductDetailSlug(pathname);

  if (
    productSlug !== null &&
    !isDraftPreviewRequest(request) &&
    !(await productSlugExists(productSlug, { includeDrafts: false }))
  ) {
    return new NextResponse("Product not found.", {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex",
      },
      status: 404,
    });
  }

  // ─── Route Protection ───────────────────────────────────────────
  if (isProtected(pathname)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token) {
      const signInUrl = new URL("/account/sign-in", request.url);
      signInUrl.searchParams.set("callbackUrl", request.url);
      return NextResponse.redirect(signInUrl);
    }
  }

  // ─── P3-09: Managed redirects ───────────────────────────────────
  // Additive: only runs for paths not already handled by product-404 or auth.
  // Never alters /api/*, /account/*, /collection/*, or Next.js internals.
  if (!isExcludedFromRedirectCheck(pathname)) {
    const redirect = await resolveRedirect(pathname);
    if (redirect) {
      const destination = new URL(redirect.toPath, request.url);
      return NextResponse.redirect(destination, { status: redirect.status });
    }
  }

  // ─── Webhook signature check (skip auth for webhooks) ──────────
  // Razorpay webhooks need to bypass auth but the signature is
  // verified in the route handler itself.

  return response;
}

export const config = {
  matcher: [
    // Existing matchers (unchanged)
    "/account/profile/:path*",
    "/account/addresses/:path*",
    "/account/orders/:path*",
    "/account/wishlist/:path*",
    "/collection/:slug",
    // P3-09: broad matcher for managed redirects on all non-internal paths.
    // _next/* and /api/* are excluded inside the proxy function itself.
    "/((?!_next/|api/|favicon.ico|manifest.json|apple-touch-icon.png|logos/).*)",
  ],
};

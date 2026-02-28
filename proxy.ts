import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Proxy handles:
 * 1. Route protection — redirect unauthenticated users from protected paths
 * 2. Security — additional runtime security checks
 *
 * Renamed from middleware.ts to proxy.ts for Next.js 16 convention.
 * See: https://nextjs.org/docs/messages/middleware-to-proxy
 */

const protectedPaths = [
  "/account/profile",
  "/account/addresses",
  "/account/orders",
  "/account/wishlist",
  "/checkout",
];

const isProtected = (pathname: string) =>
  protectedPaths.some((prefix) => pathname.startsWith(prefix));

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

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

  // ─── Webhook signature check (skip auth for webhooks) ──────────
  // Razorpay webhooks need to bypass auth but the signature is
  // verified in the route handler itself.

  return response;
}

export const config = {
  matcher: [
    "/account/profile/:path*",
    "/account/addresses/:path*",
    "/account/orders/:path*",
    "/account/wishlist/:path*",
    "/checkout/:path*",
  ],
};

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware handles:
 * 1. Route protection — redirect unauthenticated users from protected paths
 * 2. Security — additional runtime security checks
 */

const protectedPaths = [
  "/account/profile",
  "/account/addresses",
  "/account/orders",
  "/checkout",
];

const isProtected = (pathname: string) =>
  protectedPaths.some((prefix) => pathname.startsWith(prefix));

export async function middleware(request: NextRequest) {
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
    "/checkout/:path*",
  ],
};

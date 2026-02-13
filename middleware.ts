import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Protect account and checkout routes — redirect unauthenticated visitors
 * to the sign-in page with a callback URL so they return after logging in.
 *
 * Public routes (collection, product pages, home, our-story, how-it-works)
 * are not gated.
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

  // Only gate protected paths
  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  // Check for a valid session token (works with both DB and JWT strategies)
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const signInUrl = new URL("/account/sign-in", request.url);
    signInUrl.searchParams.set("callbackUrl", request.url);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/account/profile/:path*",
    "/account/addresses/:path*",
    "/account/orders/:path*",
    "/checkout/:path*",
  ],
};

import { getToken } from "next-auth/jwt";

import type { Context, MiddlewareHandler } from "hono";
import type { NextRequest } from "next/server";

import { errorResponse } from "@/lib/http/error-response";
import { verifyBearerSecret } from "@/lib/http/verify-secret";

import type { AuthUser, HonoBindings } from "../types";

const unauthorized = () => errorResponse(401, "Unauthorized", "UNAUTHORIZED");
const forbidden = () => errorResponse(403, "Forbidden", "FORBIDDEN");

const isProduction = process.env.NODE_ENV === "production";
const adminSessionCookieName = `${isProduction ? "__Secure-" : ""}ftt-admin.session-token`;

const toAuthUser = (token: Record<string, unknown>): AuthUser | null => {
  const id =
    typeof token.id === "string"
      ? token.id
      : typeof token.sub === "string"
        ? token.sub
        : null;

  if (!id) return null;

  return {
    email: typeof token.email === "string" ? token.email : null,
    id,
    role: typeof token.role === "string" ? token.role : null,
  };
};

export const authMiddleware: MiddlewareHandler<HonoBindings> = async (
  c,
  next,
) => {
  const token = await getToken({
    // getToken only reads headers/cookies, so we can pass the original Hono request
    // through directly and avoid cloning/proxy issues in serverless runtimes.
    req: c.req.raw as unknown as NextRequest,
    secret: process.env.NEXTAUTH_SECRET,
    cookieName: adminSessionCookieName,
  });

  const authUser = token ? toAuthUser(token as Record<string, unknown>) : null;
  c.set("authUser", authUser);
  await next();
};

export const requireAuth = (c: Context<HonoBindings>): AuthUser | Response => {
  const authUser = c.get("authUser");

  if (!authUser) {
    return unauthorized();
  }

  return authUser;
};

export const requireAdmin = (c: Context<HonoBindings>): AuthUser | Response => {
  const authUser = c.get("authUser");

  if (authUser?.role === "admin") {
    return authUser;
  }

  const adminSecret = process.env.ADMIN_API_SECRET;
  const authHeader = c.req.header("authorization") ?? null;

  if (adminSecret && verifyBearerSecret(authHeader, adminSecret)) {
    return {
      id: "admin-secret",
      role: "admin",
    };
  }

  if (!authUser) {
    return unauthorized();
  }

  return forbidden();
};

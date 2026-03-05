import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

import type { Context, MiddlewareHandler } from "hono";

import { errorResponse } from "@/lib/http/error-response";
import { verifyBearerSecret } from "@/lib/http/verify-secret";

import type { AuthUser, HonoBindings } from "../types";

const unauthorized = () => errorResponse(401, "Unauthorized", "UNAUTHORIZED");
const forbidden = () => errorResponse(403, "Forbidden", "FORBIDDEN");

const toAuthUser = (token: Record<string, unknown>): AuthUser | null => {
  const id = typeof token.id === "string" ? token.id : typeof token.sub === "string" ? token.sub : null;
  if (!id) return null;

  return {
    email: typeof token.email === "string" ? token.email : null,
    id,
    role: typeof token.role === "string" ? token.role : null,
  };
};

export const authMiddleware: MiddlewareHandler<HonoBindings> = async (c, next) => {
  const req = new NextRequest(c.req.raw);
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
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

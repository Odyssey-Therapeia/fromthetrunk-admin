/**
 * Route test harness — P2-11
 *
 * Provides a small factory that eliminates the repeated OpenAPIHono scaffolding
 * found in every route unit test. A new L2 route test should need ≤ ~30 lines.
 *
 * Usage:
 *
 *   import { createRouteHarness } from "tests/helpers/route-harness";
 *
 *   const harness = createRouteHarness({
 *     register: (app) => registerUserRoutes(app),
 *     authUser: { id: "admin-1", email: "admin@example.com", role: "admin" },
 *   });
 *
 *   const response = await harness.request("/admins", { method: "POST", ... });
 */

import { OpenAPIHono } from "@hono/zod-openapi";
import type { AuthUser, HonoBindings } from "@/api/hono/types";

export type RouteHarnessOptions = {
  /**
   * Function that registers the route(s) under test onto the provided app.
   * Called once per `createRouteHarness` invocation.
   */
  register: (app: OpenAPIHono<HonoBindings>) => void;

  /**
   * The value to inject as `authUser` via middleware.
   * Pass `null` (or omit) for unauthenticated/public routes.
   */
  authUser?: AuthUser | null;
};

export type RouteHarness = {
  /**
   * Dispatch a request to the underlying Hono app.
   * Mirrors `app.request(path, init)` directly.
   */
  request: (path: string, init?: RequestInit) => Promise<Response>;

  /** The underlying Hono app, for advanced access. */
  app: OpenAPIHono<HonoBindings>;
};

/**
 * Build a configured Hono app with optional auth injection and return a thin
 * wrapper whose `.request()` mirrors `app.request()`.
 *
 * The returned harness is **stateless** — every call to `request()` dispatches
 * into the same app instance. Rebuild via `createRouteHarness` if per-test
 * isolation of the app itself is required (most tests do not need this).
 */
export function createRouteHarness({
  register,
  authUser = null,
}: RouteHarnessOptions): RouteHarness {
  const app = new OpenAPIHono<HonoBindings>();

  // Always inject authUser so every route handler can call c.get("authUser")
  // safely, regardless of whether the route requires authentication.
  app.use("*", async (c, next) => {
    c.set("authUser", authUser ?? null);
    await next();
  });

  register(app);

  return {
    app,
    request: (path, init) => Promise.resolve(app.request(path, init)),
  };
}

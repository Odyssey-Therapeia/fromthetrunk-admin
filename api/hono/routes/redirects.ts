/**
 * P3-09: Admin redirects CRUD routes.
 *
 * Endpoints (all under /redirects when mounted):
 *   GET    /      — list all redirects (admin-gated)
 *   POST   /      — create a redirect (admin-gated; rejects duplicate from_path → 409)
 *   DELETE /:from — delete a redirect by from_path (admin-gated)
 *
 * Status code: the redirects table has no status column (spec-vs-reality drift).
 * All redirects use 301 (permanent). The resolver handles the actual HTTP status.
 *
 * The `store` parameter is optional and defaults to the Drizzle adapter.
 * Pass `createInMemoryContentStore()` in tests.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import type { ContentStore } from "@/lib/ports/content-store";
import { createLogger } from "@/lib/log";

const log = createLogger("admin:redirects");

// ── Money-path / reserved deny-list ──────────────────────────────────────────
// These fromPath prefixes are blocked at create time so an admin cannot
// accidentally break the checkout / cart flow. They mirror the
// isExcludedFromRedirectCheck() guard in proxy.ts.

const BLOCKED_FROM_PATH_PREFIXES: readonly string[] = [
  "/checkout",
  "/cart",
  "/api",
  "/account",
  "/_next",
];

function isBlockedFromPath(fromPath: string): boolean {
  return BLOCKED_FROM_PATH_PREFIXES.some((prefix) => fromPath.startsWith(prefix));
}

// ── toPath validation ─────────────────────────────────────────────────────────
// Allowed toPath values:
//   - Relative paths starting with "/" (e.g. "/new-slug")
//   - Absolute http(s):// URLs (e.g. "https://example.com/page")
// Blocked: javascript:, data:, protocol-relative "//" (open-redirect risk),
//   and any other scheme that is not http/https.

function isValidToPath(toPath: string): boolean {
  // Absolute URL: must be http or https only
  if (/^https?:\/\//i.test(toPath)) {
    return true;
  }
  // Relative path: must start with "/" but NOT "//" (protocol-relative)
  if (toPath.startsWith("/") && !toPath.startsWith("//")) {
    return true;
  }
  return false;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const createRedirectBodySchema = z.object({
  fromPath: z
    .string()
    .min(1)
    .startsWith("/", { message: "fromPath must start with /" }),
  toPath: z
    .string()
    .min(1)
    .refine(isValidToPath, {
      message:
        "toPath must be a relative path starting with / or an absolute http(s) URL. javascript:, data:, and protocol-relative // targets are not allowed.",
    }),
});

const fromParamSchema = z.object({
  from: z.string().min(1),
});

// ── Route factory ─────────────────────────────────────────────────────────────

export const registerRedirectsRoutes = (
  app: OpenAPIHono<HonoBindings>,
  store?: ContentStore
) => {
  let _prodStore: ContentStore | undefined;

  async function resolveStore(): Promise<ContentStore> {
    if (store) return store;
    if (_prodStore) return _prodStore;
    const { createDrizzleContentStore } = await import(
      "@/lib/adapters/drizzle-content-store"
    );
    _prodStore = createDrizzleContentStore();
    return _prodStore;
  }

  // ── GET / — list all redirects ────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "All redirects" },
      },
      tags: ["Admin Redirects"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const cs = await resolveStore();
        const list = await cs.listRedirects();
        return c.json(list, 200);
      } catch (err) {
        log.error("Failed to list redirects", { err: err as Record<string, unknown> });
        return c.json({ code: "LIST_FAILED", message: "Failed to list redirects." }, 500);
      }
    }
  );

  // ── POST / — create redirect ──────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: createRedirectBodySchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Redirect created" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid fromPath (must start with /)",
        },
        401: {
          content: { "application/json": { schema: errorSchema } },
          description: "Unauthorized",
        },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Duplicate from_path",
        },
      },
      tags: ["Admin Redirects"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");

      // Deny-list: block money-path / reserved prefixes at create time.
      if (isBlockedFromPath(body.fromPath)) {
        return c.json(
          {
            code: "BLOCKED_FROM_PATH",
            message: `fromPath "${body.fromPath}" is a reserved or money-path prefix and cannot be redirected.`,
          },
          400
        );
      }

      try {
        const cs = await resolveStore();
        const redirect = await cs.createRedirect(body.fromPath, body.toPath);
        return c.json(redirect, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create redirect.";
        // Duplicate fromPath errors contain "already exists" from the in-memory store,
        // or a Postgres unique constraint violation from Drizzle.
        if (/already exists|unique/i.test(message)) {
          return c.json({ code: "DUPLICATE_FROM_PATH", message }, 409);
        }
        log.error("Failed to create redirect", { err: err as Record<string, unknown> });
        return c.json({ code: "CREATE_FAILED", message }, 500);
      }
    }
  );

  // ── DELETE /:from — delete redirect ──────────────────────────────────────

  app.openapi(
    createRoute({
      method: "delete",
      path: "/:from",
      request: { params: fromParamSchema },
      responses: {
        200: { description: "Redirect deleted" },
        401: {
          content: { "application/json": { schema: errorSchema } },
          description: "Unauthorized",
        },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Redirect not found",
        },
      },
      tags: ["Admin Redirects"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      // The :from param comes URL-encoded; decode it so "/old-page" works.
      const rawFrom = c.req.valid("param").from;
      const fromPath = decodeURIComponent(rawFrom);

      try {
        const cs = await resolveStore();
        const deleted = await cs.deleteRedirect(fromPath);
        if (!deleted) {
          return c.json({ code: "NOT_FOUND", message: "Redirect not found." }, 404);
        }
        return c.json({ deleted: true }, 200);
      } catch (err) {
        log.error("Failed to delete redirect", { err: err as Record<string, unknown> });
        return c.json({ code: "DELETE_FAILED", message: "Failed to delete redirect." }, 500);
      }
    }
  );
};

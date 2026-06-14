/**
 * P3-09: Admin navigation menu CRUD routes.
 *
 * Endpoints (all under /navigation when mounted):
 *   GET  /header   — get current header menu (returns { menu: NavigationMenu | null })
 *   POST /header   — save header menu items (admin-gated)
 *   GET  /footer   — get current footer menu (returns { menu: NavigationMenu | null })
 *   POST /footer   — save footer menu items (admin-gated)
 *
 * The `store` parameter is optional and defaults to the Drizzle adapter.
 * Pass `createInMemoryContentStore()` in tests.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import type { ContentStore, MenuSlot } from "@/lib/ports/content-store";
import { createLogger } from "@/lib/log";

const log = createLogger("admin:navigation");

// ── href validation ───────────────────────────────────────────────────────────
// Allowed href shapes:
//   - Relative paths starting with "/" (e.g. "/collection")
//   - Absolute https:// or http:// URLs (e.g. "https://instagram.com/...")
// Blocked: javascript:, data:, and other scheme-injection attempts.
//
// Note: nav hrefs may point to reserved-slug paths (e.g. /collection, /checkout)
// because those are legitimate destinations. The reserved-slug deny-list applies
// to CMS page creation only — not to navigation link destinations.

function isValidHref(href: string): boolean {
  // Absolute URL: must be http or https only (blocks javascript:, data:, etc.)
  if (/^https?:\/\//i.test(href)) {
    return true;
  }
  // Relative path: must start with /
  if (href.startsWith("/")) {
    return true;
  }
  return false;
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const hrefSchema = z
  .string()
  .min(1)
  .refine(isValidHref, {
    message: "href must be a relative path starting with / or an absolute http(s) URL",
  });

const menuItemSchema = z.object({
  label: z.string().min(1),
  href: hrefSchema,
});

const footerLinkSchema = z.object({
  label: z.string().min(1),
  href: hrefSchema,
});

const footerSectionSchema = z.object({
  title: z.string().min(1),
  links: z.array(footerLinkSchema),
});

const saveHeaderMenuBodySchema = z.object({
  items: z.array(menuItemSchema),
});

const saveFooterMenuBodySchema = z.object({
  items: z.array(footerSectionSchema),
});

// Union schema for OpenAPI registration (accepts both shapes).
// Slot-specific validation happens inside the handler after param resolution.
const saveMenuBodySchema = z.union([saveHeaderMenuBodySchema, saveFooterMenuBodySchema]);

const slotParamSchema = z.object({
  slot: z.enum(["header", "footer"]),
});

// ── Route factory ─────────────────────────────────────────────────────────────

export const registerNavigationRoutes = (
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

  // ── GET /:slot — get current menu ─────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/:slot",
      request: { params: slotParamSchema },
      responses: {
        200: { description: "Navigation menu for slot (or null if not set)" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid slot",
        },
      },
      tags: ["Admin Navigation"],
    }),
    async (c) => {
      const { slot } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const menu = await cs.getMenu(slot as MenuSlot);
        return c.json({ menu }, 200);
      } catch (err) {
        log.error("Failed to get menu", { err: err as Record<string, unknown>, slot });
        return c.json({ code: "GET_MENU_FAILED", message: "Failed to get menu." }, 500);
      }
    }
  );

  // ── POST /:slot — save menu (admin-only) ──────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/:slot",
      request: {
        params: slotParamSchema,
        body: {
          content: {
            "application/json": { schema: saveMenuBodySchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Menu saved" },
        400: {
          content: { "application/json": { schema: errorSchema } },
          description: "Invalid slot or items",
        },
        401: {
          content: { "application/json": { schema: errorSchema } },
          description: "Unauthorized",
        },
        403: {
          content: { "application/json": { schema: errorSchema } },
          description: "Forbidden",
        },
      },
      tags: ["Admin Navigation"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { slot } = c.req.valid("param");

      // Parse raw JSON and validate with the per-slot schema.
      // The OpenAPI union schema above is intentionally loose so both shapes
      // pass initial Hono deserialization; the strict per-slot parse below
      // produces the real validation error returned to the caller.
      const rawBody = await c.req.json().catch(() => null);
      const slotSchema =
        slot === "footer" ? saveFooterMenuBodySchema : saveHeaderMenuBodySchema;
      const parsed = slotSchema.safeParse(rawBody);
      if (!parsed.success) {
        return c.json(
          { code: "INVALID_BODY", message: parsed.error.message },
          400
        );
      }

      const { items } = parsed.data;

      try {
        const cs = await resolveStore();
        const saved = await cs.saveMenu(slot as MenuSlot, items as unknown[]);
        return c.json(saved, 200);
      } catch (err) {
        log.error("Failed to save menu", { err: err as Record<string, unknown>, slot });
        return c.json({ code: "SAVE_MENU_FAILED", message: "Failed to save menu." }, 500);
      }
    }
  );
};

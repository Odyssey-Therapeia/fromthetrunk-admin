/**
 * P3-04: Admin pages CRUD routes.
 * P3-06: Added publish, unpublish, preview-token endpoints.
 *        Wired revalidateTag("page:<slug>") + content_published event emit
 *        on all publish-state-changing operations.
 *
 * Endpoints (all under /pages when mounted):
 *   GET    /                                        — list all pages (admin)
 *   POST   /                                        — create page (admin; rejects reserved slugs → 409)
 *   GET    /:id                                     — get page by id (admin)
 *   PATCH  /:id                                     — update page title/seo (admin)
 *   GET    /:id/versions                            — list versions for page (admin)
 *   POST   /:id/versions                            — create version for page (admin)
 *   POST   /:id/versions/:versionId/restore         — publish a specific version (admin)
 *   POST   /:id/publish                             — publish latest draft version (admin)
 *   POST   /:id/unpublish                           — clear published_version_id (admin)
 *   GET    /:id/preview-token                       — generate signed preview token (admin)
 *
 * The `store` parameter is optional and defaults to the Drizzle adapter.
 * Pass `createInMemoryContentStore()` in tests.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { revalidateTag } from "next/cache";

import { requireAdmin } from "@/api/hono/middleware/auth";
import { errorSchema, idParamSchema } from "@/api/hono/schemas/common";
import type { HonoBindings } from "@/api/hono/types";
import type { ContentStore } from "@/lib/ports/content-store";
import { createLogger } from "@/lib/log";
import { createPreviewToken } from "@/lib/content/preview-token";
import { getSiteOrigin } from "@/lib/config/site";

const log = createLogger("admin:pages");

// ── Local schemas ─────────────────────────────────────────────────────────────

const createPageBodySchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(160).optional(),
    })
    .optional()
    .nullable(),
});

const updatePageBodySchema = z.object({
  title: z.string().min(1).optional(),
  seo: z
    .object({
      title: z.string().max(70).optional(),
      description: z.string().max(160).optional(),
    })
    .optional()
    .nullable(),
});

const createVersionBodySchema = z.object({
  blocks: z.array(z.record(z.string(), z.unknown())).optional().default([]),
});

const versionRestoreParamSchema = z.object({
  id: z.string().uuid(),
  versionId: z.string().uuid(),
});

// ── Shared helper: safe revalidateTag ────────────────────────────────────────
// revalidateTag requires a Next.js static generation store (server context).
// Outside that context (e.g. unit tests, Hono standalone) it throws.
// We catch and log non-fatally so the rest of the publish operation succeeds.

function safeRevalidateTag(tag: string): void {
  try {
    revalidateTag(tag, "max");
  } catch (err) {
    log.error("revalidateTag failed (non-fatal, likely outside Next.js runtime)", {
      err: err as Record<string, unknown>,
      tag,
    });
  }
}

// ── Shared helper: emit content_published fire-and-forget ─────────────────────

async function emitContentPublished(
  pageId: string,
  slug: string,
  versionId: string
): Promise<void> {
  try {
    // Dynamic import keeps the analytics adapter out of the cold-start
    // critical path and prevents DATABASE_URL from being required in tests
    // that don't mock the DB (pages-route.test.ts).
    const { emitAnalyticsEvent } = await import("@/lib/analytics/emit");
    await emitAnalyticsEvent({
      event_id: crypto.randomUUID(),
      type: "content_published",
      payload: { pageId, slug, versionId },
      occurredAt: new Date(),
    });
  } catch (err) {
    // Fire-and-forget: never propagate sink errors into the publish path.
    log.error("content_published emit failed (non-fatal)", {
      err: err as Record<string, unknown>,
      pageId,
      slug,
    });
  }
}

// ── Route factory ─────────────────────────────────────────────────────────────

export type EmitFn = (
  pageId: string,
  slug: string,
  versionId: string
) => Promise<void>;

export const registerPagesRoutes = (
  app: OpenAPIHono<HonoBindings>,
  store?: ContentStore,
  /** Optional emit override — injected in tests to avoid the dynamic import chain. */
  emitOverride?: EmitFn
) => {
  // Resolve emit: use injection if provided, else use the dynamic-import default.
  // Always wrapped in a catch so a throwing emit never propagates to the caller.
  const _rawEmit: EmitFn = emitOverride ?? emitContentPublished;
  const doEmit = (pageId: string, slug: string, versionId: string): Promise<void> =>
    _rawEmit(pageId, slug, versionId).catch((err: unknown) => {
      log.error("content_published emit failed (non-fatal)", {
        err: err as Record<string, unknown>,
        pageId,
        slug,
      });
    });

  // Cache the lazily-resolved production store (one instance per registration).
  let _prodStore: ContentStore | undefined;

  // Lazily resolve the store so the Drizzle import (and DB connection) is
  // deferred. When `store` is injected (tests) it is used directly.
  async function resolveStore(): Promise<ContentStore> {
    if (store) return store;
    if (_prodStore) return _prodStore;
    const { createDrizzleContentStore } = await import(
      "@/lib/adapters/drizzle-content-store"
    );
    _prodStore = createDrizzleContentStore();
    return _prodStore;
  }

  // ── GET / — list pages ─────────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/",
      responses: {
        200: { description: "All pages" },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const cs = await resolveStore();
        const pages = await cs.listPages();
        return c.json(pages, 200);
      } catch (err) {
        log.error("Failed to list pages", { err: err as Record<string, unknown> });
        return c.json({ code: "LIST_FAILED", message: "Failed to list pages." }, 500);
      }
    }
  );

  // ── POST / — create page ───────────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/",
      request: {
        body: {
          content: {
            "application/json": { schema: createPageBodySchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Page created" },
        409: {
          content: { "application/json": { schema: errorSchema } },
          description: "Reserved slug or duplicate",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const body = c.req.valid("json");

      try {
        const cs = await resolveStore();
        const page = await cs.createPage({
          slug: body.slug,
          title: body.title,
          seo: body.seo ?? null,
        });
        return c.json(page, 201);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create page.";
        // Reserved-slug errors come from the store with "reserved" in the message.
        if (/reserved/i.test(message)) {
          return c.json(
            {
              code: "SLUG_RESERVED",
              message,
            },
            409
          );
        }
        log.error("Failed to create page", { err: err as Record<string, unknown> });
        return c.json({ code: "CREATE_FAILED", message }, 500);
      }
    }
  );

  // ── GET /:id — get page by id ──────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/:id",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Page" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const cs = await resolveStore();
      const page = await cs.getPageById(id);
      if (!page) {
        return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
      }
      return c.json(page, 200);
    }
  );

  // ── PATCH /:id — update page ───────────────────────────────────────────────

  app.openapi(
    createRoute({
      method: "patch",
      path: "/:id",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: updatePageBodySchema },
          },
          required: true,
        },
      },
      responses: {
        200: { description: "Page updated" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");

      try {
        const cs = await resolveStore();
        const updated = await cs.updatePage(id, {
          title: body.title,
          seo: body.seo ?? undefined,
        });
        if (!updated) {
          return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
        }
        return c.json(updated, 200);
      } catch (err) {
        log.error("Failed to update page", { err: err as Record<string, unknown> });
        return c.json({ code: "UPDATE_FAILED", message: "Failed to update page." }, 500);
      }
    }
  );

  // ── GET /:id/versions — list versions ─────────────────────────────────────

  app.openapi(
    createRoute({
      method: "get",
      path: "/:id/versions",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Page versions, newest first" },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const versions = await cs.listPageVersions(id);
        return c.json(versions, 200);
      } catch (err) {
        log.error("Failed to list versions", { err: err as Record<string, unknown> });
        return c.json(
          { code: "LIST_VERSIONS_FAILED", message: "Failed to list versions." },
          500
        );
      }
    }
  );

  // ── POST /:id/versions — create version ────────────────────────────────────

  app.openapi(
    createRoute({
      method: "post",
      path: "/:id/versions",
      request: {
        params: idParamSchema,
        body: {
          content: {
            "application/json": { schema: createVersionBodySchema },
          },
          required: true,
        },
      },
      responses: {
        201: { description: "Version created" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Page not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");
      const body = c.req.valid("json");
      const authUser = c.get("authUser");

      const cs = await resolveStore();

      // Verify page exists
      const page = await cs.getPageById(id);
      if (!page) {
        return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
      }

      try {
        const version = await cs.createPageVersion({
          pageId: id,
          blocks: body.blocks,
          createdBy: authUser?.id ?? "unknown",
        });
        return c.json(version, 201);
      } catch (err) {
        log.error("Failed to create version", { err: err as Record<string, unknown> });
        return c.json(
          { code: "CREATE_VERSION_FAILED", message: "Failed to create version." },
          500
        );
      }
    }
  );

  // ── POST /:id/versions/:versionId/restore — restore/publish ───────────────
  // P3-06: Now also calls revalidateTag + emits content_published event.
  // This is the shared operation used for both "rollback" and normal restore.

  app.openapi(
    createRoute({
      method: "post",
      path: "/:id/versions/:versionId/restore",
      request: { params: versionRestoreParamSchema },
      responses: {
        200: { description: "Page published to the chosen version" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Page not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id, versionId } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const updated = await cs.publishPage(id, versionId);

        // P3-06: Revalidate ISR cache for this page (P3-03a closure).
        safeRevalidateTag(`page:${updated.slug}`);

        // P3-06: Emit content_published event fire-and-forget.
        void doEmit(updated.id, updated.slug, versionId);

        return c.json(updated, 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to restore version.";
        if (/not found/i.test(message)) {
          return c.json({ code: "PAGE_NOT_FOUND", message }, 404);
        }
        log.error("Failed to restore version", { err: err as Record<string, unknown> });
        return c.json({ code: "RESTORE_FAILED", message }, 500);
      }
    }
  );

  // ── POST /:id/publish — publish latest draft version ──────────────────────
  // Fetches the most-recent version for this page and publishes it.
  // Callers (admin editor) call this for the one-click "Publish" button.

  app.openapi(
    createRoute({
      method: "post",
      path: "/:id/publish",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Page published" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Page not found",
        },
        422: {
          content: { "application/json": { schema: errorSchema } },
          description: "No versions to publish",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      try {
        const cs = await resolveStore();

        // Verify page exists
        const page = await cs.getPageById(id);
        if (!page) {
          return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
        }

        // Get the latest version (listPageVersions returns newest first)
        const versions = await cs.listPageVersions(id);
        if (versions.length === 0) {
          return c.json(
            {
              code: "NO_VERSIONS",
              message: "Page has no versions to publish. Save a draft first.",
            },
            422
          );
        }

        const latestVersion = versions[0];
        const updated = await cs.publishPage(id, latestVersion.id);

        // P3-06: Revalidate ISR cache for this page.
        safeRevalidateTag(`page:${updated.slug}`);

        // P3-06: Emit content_published event fire-and-forget.
        void doEmit(updated.id, updated.slug, latestVersion.id);

        return c.json(updated, 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to publish page.";
        log.error("Failed to publish page", { err: err as Record<string, unknown> });
        return c.json({ code: "PUBLISH_FAILED", message }, 500);
      }
    }
  );

  // ── POST /:id/unpublish — clear published_version_id ──────────────────────
  // Clears published state; the page returns to 404 publicly.

  app.openapi(
    createRoute({
      method: "post",
      path: "/:id/unpublish",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Page unpublished" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Page not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const updated = await cs.unpublishPage(id);

        // P3-06: Revalidate ISR cache so the page 404s immediately.
        safeRevalidateTag(`page:${updated.slug}`);

        return c.json(updated, 200);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to unpublish page.";
        if (/not found/i.test(message)) {
          return c.json({ code: "PAGE_NOT_FOUND", message }, 404);
        }
        log.error("Failed to unpublish page", { err: err as Record<string, unknown> });
        return c.json({ code: "UNPUBLISH_FAILED", message }, 500);
      }
    }
  );

  // ── GET /:id/preview-token — generate signed preview token ────────────────
  // Admin-only: returns a signed, expiring token for the page's slug.
  // The token is passed as ?__preview_token=<token> in the preview URL.

  app.openapi(
    createRoute({
      method: "get",
      path: "/:id/preview-token",
      request: { params: idParamSchema },
      responses: {
        200: { description: "Signed preview token" },
        404: {
          content: { "application/json": { schema: errorSchema } },
          description: "Page not found",
        },
      },
      tags: ["Admin Pages"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const { id } = c.req.valid("param");

      try {
        const cs = await resolveStore();
        const page = await cs.getPageById(id);
        if (!page) {
          return c.json({ code: "PAGE_NOT_FOUND", message: "Page not found." }, 404);
        }

        const token = createPreviewToken(page.slug);
        // P3-06 / PRIOR FINDINGS #2: route through /api/preview so the
        // Next.js draftMode cookie is enabled server-side before the CMS
        // catch-all page renders the draft.  getSiteOrigin() is the canonical
        // origin helper (commit f10aa8f — no dead-domain fallback).
        const origin = getSiteOrigin();
        const previewUrl =
          `${origin}/api/preview` +
          `?slug=${encodeURIComponent(page.slug)}` +
          `&__preview_token=${encodeURIComponent(token)}`;

        return c.json({ token, previewUrl, slug: page.slug }, 200);
      } catch (err) {
        log.error("Failed to generate preview token", {
          err: err as Record<string, unknown>,
        });
        return c.json(
          { code: "PREVIEW_TOKEN_FAILED", message: "Failed to generate preview token." },
          500
        );
      }
    }
  );
};

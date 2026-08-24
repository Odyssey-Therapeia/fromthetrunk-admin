/**
 * Controlled catalogue synchronisation routes (Phase 2B.1).
 *
 * GET  /api/v2/integrations/google-merchant/catalogue-sync/preview
 * GET  /api/v2/integrations/google-merchant/catalogue-sync/status
 *   — Admin-only, READ-ONLY. Local SELECTs plus Google products.list GETs; no
 *     Merchant write and no database write, so neither needs a kill switch or a
 *     production gate.
 *
 * POST /api/v2/integrations/google-merchant/catalogue-sync/apply
 *   — Admin-only, production-only, 404 unless
 *     GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED === "true". Inserts at most five
 *     products per invocation, sequentially. INSERT-only: it never deletes.
 *
 * POST /api/v2/integrations/google-merchant/catalogue-sync/delete
 *   — Same gates. The ONLY deletion entry point in the integration, and it
 *     removes exactly one ProductInput, only for a product the audit calls
 *     UNSUPPORTED_PRODUCT_TYPE. Bulk deletion and automatic cleanup of
 *     DELETE_CANDIDATE offers remain unimplemented.
 *
 * No business logic here: the routes validate, delegate to
 * `lib/google-merchant/sync-catalogue.ts` and sanitise the output. A mid-batch
 * failure is a 200 carrying `applied: false` — the batch is a reported outcome,
 * not an exception, because products written before the failure are real.
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";

import { requireAdmin } from "@/api/hono/middleware/auth";
import {
  SYNC_APPLY_CONFIRMATION,
  SYNC_DELETE_UNSUPPORTED_CONFIRMATION,
  SYNC_RESYNC_CONFIRMATION,
  applySyncRequestSchema,
  deleteUnsupportedRequestSchema,
  deleteUnsupportedResponseSchema,
  inventorySyncPreviewResponseSchema,
  resyncRequestSchema,
  resyncResponseSchema,
  syncApplyFailureSchema,
  syncApplySuccessSchema,
  syncPreviewResponseSchema,
  syncStatusResponseSchema,
} from "@/api/hono/schemas/google-merchant-sync";
import type { HonoBindings } from "@/api/hono/types";
import { MERCHANT_PRODUCT_STATUSES } from "@/lib/google-merchant/catalogue-sync";
import type {
  MerchantProductStatus,
  MerchantProductStatusReport,
  SyncPlan,
} from "@/lib/google-merchant/catalogue-sync";
import {
  GoogleMerchantError,
  isGoogleMerchantCatalogueSyncEnabled,
  isProductionRuntime,
} from "@/lib/google-merchant/config";
import type { InventorySyncPlan } from "@/lib/google-merchant/inventory-reconciliation";
import {
  MAX_INVENTORY_SYNC_WRITES,
  previewMerchantInventorySync,
} from "@/lib/google-merchant/reconcile-inventory";
import {
  MAX_SYNC_BATCH_SIZE,
  applyMerchantCatalogueSyncBatch,
  deleteUnsupportedMerchantProduct,
  getMerchantCatalogueSyncStatus,
  previewMerchantCatalogueSync,
  resyncMerchantProduct,
} from "@/lib/google-merchant/sync-catalogue";
import type {
  MerchantDeleteResult,
  MerchantResyncResult,
  MerchantSyncApplyResult,
} from "@/lib/google-merchant/sync-catalogue";
import { errorResponse } from "@/lib/http/error-response";
import { createLogger } from "@/lib/log";

const log = createLogger("hono:google-merchant-sync");

export type GoogleMerchantSyncRouteDeps = {
  /** Injected in tests; default to the real read-only / writing services. */
  previewSync?: () => Promise<SyncPlan>;
  applySync?: (limit: number) => Promise<MerchantSyncApplyResult>;
  resyncProduct?: (productId: string) => Promise<MerchantResyncResult>;
  deleteUnsupportedProduct?: (productId: string) => Promise<MerchantDeleteResult>;
  previewInventorySync?: () => Promise<InventorySyncPlan>;
  syncStatus?: () => Promise<MerchantProductStatusReport[]>;
};

/** Identical body for "disabled" and "not production" — no oracle. */
const notFound = () => errorResponse(404, "Not found.", "NOT_FOUND");

const failed = (message: string) =>
  errorResponse(500, message, "CATALOGUE_SYNC_FAILED");

/** Strip the plan to its publishable shape — ProductInputs never leave. */
const toPreviewBody = (plan: SyncPlan) =>
  syncPreviewResponseSchema.parse({
    actions: plan.actions.map((action) => action.report),
    summary: plan.summary,
  });

/** Strip the inventory plan to its publishable shape — ProductInputs never leave. */
const toInventoryPreviewBody = (plan: InventorySyncPlan) =>
  inventorySyncPreviewResponseSchema.parse({
    actions: plan.actions.map((action) => action.report),
    summary: { ...plan.summary, writeCeiling: MAX_INVENTORY_SYNC_WRITES },
  });

const toStatusBody = (products: MerchantProductStatusReport[]) => {
  const byStatus = Object.fromEntries(
    MERCHANT_PRODUCT_STATUSES.map((status) => [status, 0]),
  ) as Record<MerchantProductStatus, number>;

  for (const product of products) byStatus[product.status] += 1;

  return syncStatusResponseSchema.parse({
    products,
    summary: { byStatus, managedProducts: products.length },
  });
};

export const registerGoogleMerchantSyncRoutes = (
  app: OpenAPIHono<HonoBindings>,
  deps: GoogleMerchantSyncRouteDeps = {},
) => {
  const previewSync = deps.previewSync ?? previewMerchantCatalogueSync;
  const applySync = deps.applySync ?? applyMerchantCatalogueSyncBatch;
  const syncStatus = deps.syncStatus ?? getMerchantCatalogueSyncStatus;
  const resyncProduct = deps.resyncProduct ?? resyncMerchantProduct;
  const deleteUnsupportedProduct =
    deps.deleteUnsupportedProduct ?? deleteUnsupportedMerchantProduct;
  const previewInventorySync =
    deps.previewInventorySync ?? previewMerchantInventorySync;

  app.openapi(
    createRoute({
      method: "get",
      path: "/catalogue-sync/preview",
      description:
        "Read-only reconciliation of READY local products against the products " +
        "in our Merchant API data source. Performs no Merchant write and no " +
        "database write. Admin only.",
      responses: {
        200: { description: "Reconciliation plan" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        500: { description: "Preview failed" },
      },
      summary: "Preview the Google Merchant catalogue synchronisation",
      tags: ["Integrations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const plan = await previewSync();

        log.info("Catalogue sync previewed", {
          adminId: adminOrResponse.id,
          insert: plan.summary.insert,
        });

        return c.json(toPreviewBody(plan), 200);
      } catch (error) {
        log.error("Catalogue sync preview failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "CATALOGUE_SYNC_FAILED",
        });

        return failed("The catalogue sync preview could not be completed.");
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/catalogue-sync/status",
      description:
        "Read-only status of the products currently in our Merchant API data " +
        "source, with Google's destination statuses and item-level issues. " +
        "Google processing is asynchronous — a successful insert does not imply " +
        "approval. Admin only.",
      responses: {
        200: { description: "Processing status per managed product" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        500: { description: "Status lookup failed" },
      },
      summary: "Inspect Google Merchant processing status",
      tags: ["Integrations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        return c.json(toStatusBody(await syncStatus()), 200);
      } catch (error) {
        log.error("Catalogue sync status failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "CATALOGUE_SYNC_FAILED",
        });

        return failed("The Merchant status could not be retrieved.");
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/catalogue-sync/apply",
      description:
        `Insert at most ${MAX_SYNC_BATCH_SIZE} missing READY products into the ` +
        `Merchant API data source, sequentially. Admin-only, production-only, ` +
        `disabled unless GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED="true". ` +
        `Body: {"confirm":"${SYNC_APPLY_CONFIRMATION}","limit":${MAX_SYNC_BATCH_SIZE}}. ` +
        `A 200 means Google accepted the inputs, not that the offers are approved.`,
      responses: {
        200: { description: "Batch outcome (applied true or false)" },
        400: { description: "Missing or invalid confirmation / limit" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Endpoint unavailable" },
        500: { description: "Batch failed before any write" },
      },
      summary: "Apply one controlled Google Merchant sync batch",
      tags: ["Integrations"],
    }),
    async (c) => {
      // Kill switch and production gate, before any auth work so the endpoint
      // behaves exactly like a route that does not exist.
      if (!isGoogleMerchantCatalogueSyncEnabled() || !isProductionRuntime()) {
        return notFound();
      }

      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rawBody = await c.req.json().catch(() => null);
      const parsed = applySyncRequestSchema.safeParse(rawBody);

      if (!parsed.success) {
        return errorResponse(
          400,
          `Request body must be {"confirm":"${SYNC_APPLY_CONFIRMATION}","limit":<1-${MAX_SYNC_BATCH_SIZE}>}.`,
          "INVALID_REQUEST",
        );
      }

      try {
        const result = await applySync(parsed.data.limit);

        log.info("Catalogue sync batch completed", {
          adminId: adminOrResponse.id,
          applied: result.applied,
          succeeded: result.succeeded,
        });

        // A stopped batch is a reported outcome, not an error: the products
        // written before the failure are real and must be acknowledged.
        return c.json(
          result.applied
            ? syncApplySuccessSchema.parse(result)
            : syncApplyFailureSchema.parse(result),
          200,
        );
      } catch (error) {
        if (error instanceof GoogleMerchantError) {
          log.error("Catalogue sync batch failed", { code: error.code });
          return errorResponse(error.status, error.message, error.code);
        }

        log.error("Catalogue sync batch failed", {
          code: "CATALOGUE_SYNC_FAILED",
        });

        return failed("The catalogue sync batch could not be completed.");
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/catalogue-sync/resync",
      description:
        `Re-submit ONE existing Merchant offer with its current ProductInput — ` +
        `the way to push a corrected payload, since the planner leaves ` +
        `ALREADY_PRESENT offers alone. Admin-only, production-only, and gated by ` +
        `the same GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED switch as apply. Body: ` +
        `{"confirm":"${SYNC_RESYNC_CONFIRMATION}","productId":"<uuid>"}.`,
      responses: {
        200: { description: "Offer resubmitted" },
        400: { description: "Missing or invalid confirmation / product id" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Endpoint unavailable, or product not found" },
        409: { description: "Product not READY, or the offer conflicts" },
        500: { description: "Resync failed" },
        502: { description: "Google rejected the request" },
      },
      summary: "Resync one Google Merchant product",
      tags: ["Integrations"],
    }),
    async (c) => {
      if (!isGoogleMerchantCatalogueSyncEnabled() || !isProductionRuntime()) {
        return notFound();
      }

      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rawBody = await c.req.json().catch(() => null);
      const parsed = resyncRequestSchema.safeParse(rawBody);

      if (!parsed.success) {
        return errorResponse(
          400,
          `Request body must be {"confirm":"${SYNC_RESYNC_CONFIRMATION}","productId":"<uuid>"}.`,
          "INVALID_REQUEST",
        );
      }

      try {
        const result = await resyncProduct(parsed.data.productId);

        log.info("Merchant product resynced", {
          adminId: adminOrResponse.id,
          productId: parsed.data.productId,
        });

        return c.json(resyncResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof GoogleMerchantError) {
          log.error("Merchant product resync failed", { code: error.code });
          return errorResponse(error.status, error.message, error.code);
        }

        log.error("Merchant product resync failed", {
          code: "CATALOGUE_SYNC_FAILED",
        });

        return failed("The product resync could not be completed.");
      }
    },
  );

  app.openapi(
    createRoute({
      method: "get",
      path: "/inventory-sync/preview",
      description:
        "Read-only preview of the AUTOMATIC inventory reconciliation: for each " +
        "published product, its Merchant readiness, its effective local stock " +
        "status, the availability Google currently holds, and the action the " +
        "cron worker would take. Performs local SELECTs plus one products.list " +
        "GET — no Merchant write and no database write, so it needs neither a " +
        "kill switch nor a production gate. Admin only.",
      responses: {
        200: { description: "Inventory reconciliation plan" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        500: { description: "Preview failed" },
      },
      summary: "Preview the Google Merchant inventory reconciliation",
      tags: ["Integrations"],
    }),
    async (c) => {
      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      try {
        const plan = await previewInventorySync();

        log.info("Inventory sync previewed", {
          adminId: adminOrResponse.id,
          pendingWrites: plan.summary.pendingWrites,
        });

        return c.json(toInventoryPreviewBody(plan), 200);
      } catch (error) {
        log.error("Inventory sync preview failed", {
          code:
            error instanceof GoogleMerchantError
              ? error.code
              : "CATALOGUE_SYNC_FAILED",
        });

        return failed("The inventory sync preview could not be completed.");
      }
    },
  );

  app.openapi(
    createRoute({
      method: "post",
      path: "/catalogue-sync/delete",
      description:
        `Permanently delete ONE ProductInput from the Merchant API data source, ` +
        `and ONLY when the local audit classifies that product as ` +
        `UNSUPPORTED_PRODUCT_TYPE — the cleanup path for offers inserted before ` +
        `the saree-only eligibility gate existed. READY, SOLD, RESERVED and ` +
        `image-blocked products are always refused; this is not a bulk delete ` +
        `and never processes DELETE_CANDIDATE offers in general. POST rather ` +
        `than DELETE because an explicit confirmation body is required. ` +
        `Admin-only, production-only, and gated by the same ` +
        `GOOGLE_MERCHANT_CATALOGUE_SYNC_ENABLED switch as apply and resync. ` +
        `Body: {"confirm":"${SYNC_DELETE_UNSUPPORTED_CONFIRMATION}","productId":"<uuid>"}. ` +
        `A 200 with deleted:false means the offer was already absent and no ` +
        `delete request was sent.`,
      responses: {
        200: { description: "Offer deleted, or already absent" },
        400: { description: "Missing or invalid confirmation / product id" },
        401: { description: "Unauthorized" },
        403: { description: "Forbidden" },
        404: { description: "Endpoint unavailable, or product not found" },
        409: {
          description:
            "Product is not UNSUPPORTED_PRODUCT_TYPE, or the offer conflicts",
        },
        500: { description: "Delete failed" },
        502: { description: "Google rejected the request" },
      },
      summary: "Delete one unsupported Google Merchant product",
      tags: ["Integrations"],
    }),
    async (c) => {
      // Same kill switch and production gate as apply/resync, before any auth
      // work, so the endpoint behaves exactly like a route that does not exist.
      if (!isGoogleMerchantCatalogueSyncEnabled() || !isProductionRuntime()) {
        return notFound();
      }

      const adminOrResponse = requireAdmin(c);
      if (adminOrResponse instanceof Response) return adminOrResponse;

      const rawBody = await c.req.json().catch(() => null);
      const parsed = deleteUnsupportedRequestSchema.safeParse(rawBody);

      if (!parsed.success) {
        return errorResponse(
          400,
          `Request body must be {"confirm":"${SYNC_DELETE_UNSUPPORTED_CONFIRMATION}","productId":"<uuid>"}.`,
          "INVALID_REQUEST",
        );
      }

      try {
        const result = await deleteUnsupportedProduct(parsed.data.productId);

        log.info("Unsupported Merchant product delete completed", {
          adminId: adminOrResponse.id,
          deleted: result.deleted,
          productId: parsed.data.productId,
        });

        return c.json(deleteUnsupportedResponseSchema.parse(result), 200);
      } catch (error) {
        if (error instanceof GoogleMerchantError) {
          log.error("Unsupported Merchant product delete failed", {
            code: error.code,
          });
          return errorResponse(error.status, error.message, error.code);
        }

        log.error("Unsupported Merchant product delete failed", {
          code: "CATALOGUE_SYNC_FAILED",
        });

        return failed("The product deletion could not be completed.");
      }
    },
  );
};

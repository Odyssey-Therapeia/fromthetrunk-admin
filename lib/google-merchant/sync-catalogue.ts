/**
 * Phase 2B.1 — catalogue synchronisation, I/O side.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * `previewMerchantCatalogueSync()` and `getMerchantCatalogueSyncStatus()` are
 * STRICTLY READ-ONLY: local SELECTs plus Google `products.list` GETs.
 *
 * `applyMerchantCatalogueSyncBatch()` is the only writer, and it writes ONLY to
 * Google — never to the database. It recomputes everything from current state
 * (an earlier preview is never trusted), takes at most `MAX_SYNC_BATCH_SIZE`
 * INSERT actions in deterministic order, and submits them SEQUENTIALLY, one
 * `productInputs:insert` at a time. On the first failure it stops: products
 * already inserted stay inserted, and the next apply recomputes Google state
 * and naturally resumes with what is still missing.
 *
 * `deleteUnsupportedMerchantProduct()` is the ONE deletion entry point in the
 * whole integration. It removes a single ProductInput, and only when the local
 * audit classifies that product as UNSUPPORTED_PRODUCT_TYPE — the cleanup path
 * for offers inserted before the saree-only eligibility gate existed.
 *
 * STILL NOT IMPLEMENTED, deliberately: bulk deletion, automatic deletion of
 * DELETE_CANDIDATE offers, deletion of SOLD / RESERVED / image-blocked
 * products, cron or webhook reconciliation, product-save / reservation / order
 * hooks, an unrestricted full sync, and any persisted sync state. The planner
 * stays read-only and `applyMerchantCatalogueSyncBatch` stays INSERT-only.
 */

import { runMerchantCatalogueAudit } from "@/lib/google-merchant/audit-catalogue";
import { getGoogleMerchantAccessToken } from "@/lib/google-merchant/auth";
import {
  EXPECTED_CONTENT_LANGUAGE,
  EXPECTED_FEED_LABEL,
  buildMerchantStatusReports,
  planCatalogueSync,
  selectInsertBatch,
} from "@/lib/google-merchant/catalogue-sync";
import type {
  MerchantProductStatusReport,
  SyncPlan,
} from "@/lib/google-merchant/catalogue-sync";
import {
  GoogleMerchantError,
  assertServerRuntime,
  getGoogleMerchantConfig,
  getGoogleMerchantDataSourceName,
} from "@/lib/google-merchant/config";
import { deleteGoogleMerchantProductInput } from "@/lib/google-merchant/delete-product-input";
import {
  isManagedByDataSource,
  listGoogleMerchantProducts,
} from "@/lib/google-merchant/google-catalogue";
import type { GoogleMerchantProductSummary } from "@/lib/google-merchant/google-catalogue";
import { upsertGoogleMerchantProductInput } from "@/lib/google-merchant/upsert-product-input";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:sync-catalogue");

/** Hard ceiling for one controlled batch during the bootstrap phase. */
export const MAX_SYNC_BATCH_SIZE = 5;

export type MerchantSyncedProduct = {
  productId: string;
  offerId: string;
  productInputName: string;
  processedProductName: string;
};

export type MerchantSyncApplyResult =
  | {
      applied: true;
      requestedLimit: number;
      attempted: number;
      succeeded: number;
      remainingInsertCandidates: number;
      products: MerchantSyncedProduct[];
    }
  | {
      applied: false;
      requestedLimit: number;
      attempted: number;
      succeeded: number;
      failedProductId: string;
      error: { code: string; message: string };
      products: MerchantSyncedProduct[];
    };

/**
 * Resolve the local desired state, the current Google state and the plan.
 *
 * One access token is minted and reused for every Google call in the run.
 */
async function computeSyncPlan(): Promise<{
  accessToken: string;
  dataSourceName: string;
  plan: SyncPlan;
}> {
  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);

  // Local desired state — the Phase 2A audit, ProductInputs included.
  const audit = await runMerchantCatalogueAudit();

  const accessToken = await getGoogleMerchantAccessToken();
  const googleProducts = await listGoogleMerchantProducts(
    config.accountId,
    accessToken,
  );

  return {
    accessToken,
    dataSourceName,
    plan: planCatalogueSync(audit.audits, googleProducts, dataSourceName),
  };
}

/** Read-only reconciliation preview. Writes nothing, anywhere. */
export async function previewMerchantCatalogueSync(): Promise<SyncPlan> {
  assertServerRuntime();

  const { plan } = await computeSyncPlan();

  return plan;
}

/** Read-only status of the products currently in our Merchant data source. */
export async function getMerchantCatalogueSyncStatus(): Promise<
  MerchantProductStatusReport[]
> {
  assertServerRuntime();

  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);
  const accessToken = await getGoogleMerchantAccessToken();

  const googleProducts = await listGoogleMerchantProducts(
    config.accountId,
    accessToken,
  );

  return buildMerchantStatusReports(googleProducts, dataSourceName);
}

/**
 * Insert at most `limit` missing READY products, sequentially.
 *
 * @param limit 1..MAX_SYNC_BATCH_SIZE. Validated here as well as at the route,
 *   so the ceiling cannot be bypassed by another caller.
 * @throws {GoogleMerchantError} only for a bad limit or a failure BEFORE any
 *   write. A failure mid-batch is reported in the result, not thrown, so the
 *   caller learns exactly how far the batch got.
 */
export async function applyMerchantCatalogueSyncBatch(
  limit: number,
): Promise<MerchantSyncApplyResult> {
  assertServerRuntime();

  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_SYNC_BATCH_SIZE) {
    throw new GoogleMerchantError(
      "SYNC_LIMIT_INVALID",
      `limit must be an integer between 1 and ${MAX_SYNC_BATCH_SIZE}.`,
      400,
    );
  }

  // Recompute from CURRENT local and Google state — an earlier preview is never
  // trusted, which is also what makes a resumed batch correct.
  const { accessToken, plan } = await computeSyncPlan();
  const batch = selectInsertBatch(plan, limit);

  const products: MerchantSyncedProduct[] = [];

  // Sequential by design: no Promise.all. One failure must stop the batch
  // rather than leave several writes in flight.
  for (const action of batch) {
    const productInput = action.productInput;
    if (!productInput) continue;

    try {
      const result = await upsertGoogleMerchantProductInput(productInput, {
        accessToken,
      });

      products.push({
        offerId: result.offerId,
        processedProductName: result.processedProductName,
        productId: action.report.productId,
        productInputName: result.productInputName,
      });
    } catch (error) {
      const merchantError =
        error instanceof GoogleMerchantError
          ? error
          : new GoogleMerchantError(
              "GOOGLE_REQUEST_FAILED",
              "The Merchant API request could not be completed.",
              502,
            );

      log.error("Catalogue sync batch stopped", {
        code: merchantError.code,
        succeeded: products.length,
      });

      return {
        applied: false,
        attempted: products.length + 1,
        error: { code: merchantError.code, message: merchantError.message },
        failedProductId: action.report.productId,
        products,
        requestedLimit: limit,
        succeeded: products.length,
      };
    }
  }

  log.info("Catalogue sync batch applied", {
    succeeded: products.length,
  });

  return {
    applied: true,
    attempted: batch.length,
    products,
    remainingInsertCandidates: Math.max(
      plan.summary.insert - products.length,
      0,
    ),
    requestedLimit: limit,
    succeeded: products.length,
  };
}

// ---------------------------------------------------------------------------
// Controlled single-product resync
// ---------------------------------------------------------------------------

export type MerchantResyncResult = {
  resynced: true;
  productId: string;
  offerId: string;
  productInputName: string;
  processedProductName: string;
  /** Safe image summary — the primary URL and how many extras were sent. */
  merchantImages: { primary: string; additionalCount: number };
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * The verdict of looking one offer up in the CURRENT Google state.
 *
 * Shared by resync and delete so ownership and identity are checked in exactly
 * one place. "Absent" is a fact, not an error — each caller decides what it
 * means: resync refuses (there is nothing to correct), delete treats it as
 * already-clean and issues no request.
 */
type ManagedOfferLookup =
  | { status: "absent" }
  | { status: "duplicated" }
  | { status: "unexpected_content_language" }
  | { status: "unexpected_feed_label" }
  | { status: "found"; product: GoogleMerchantProductSummary };

/**
 * Find the ONE offer in our data source carrying this offerId.
 *
 * Ownership first: a product from "Found by Google", a supplemental feed or any
 * other API source is filtered out before the offerId is even compared, so it
 * can never be matched, resubmitted or deleted. Identity second: the surviving
 * offer must be `en` / `IN`, or the caller fails closed.
 */
function findManagedMerchantOffer(
  googleProducts: GoogleMerchantProductSummary[],
  dataSourceName: string,
  offerId: string,
): ManagedOfferLookup {
  const managed = googleProducts.filter(
    (product) =>
      isManagedByDataSource(product, dataSourceName) &&
      product.offerId === offerId,
  );

  if (managed.length === 0) return { status: "absent" };
  if (managed.length > 1) return { status: "duplicated" };

  const [product] = managed;

  if (product.contentLanguage !== EXPECTED_CONTENT_LANGUAGE) {
    return { status: "unexpected_content_language" };
  }

  if (product.feedLabel !== EXPECTED_FEED_LABEL) {
    return { status: "unexpected_feed_label" };
  }

  return { product, status: "found" };
}

/**
 * Re-submit ONE existing Merchant product with its current ProductInput.
 *
 * The bootstrap planner deliberately leaves ALREADY_PRESENT offers alone, so
 * this is the only way to push a corrected payload — for example after the
 * image-metadata backfill makes the Merchant-safe image selection drop an
 * oversized photo that Google rejected.
 *
 * Everything is recomputed from current state: the readiness audit decides
 * whether the product may be submitted at all, the ProductInput is the one the
 * audit built (never rebuilt here), and the offer must already exist in OUR
 * data source with the expected language and feed label. Anything else fails
 * closed without writing.
 */
export async function resyncMerchantProduct(
  productId: string,
): Promise<MerchantResyncResult> {
  assertServerRuntime();

  if (!UUID_PATTERN.test(productId)) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_FOUND",
      "That product id is not a valid product identifier.",
      400,
    );
  }

  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);

  // 1-4. Current local state, through the SAME readiness logic as everything else.
  const audit = await runMerchantCatalogueAudit();
  const entry = audit.audits.find(
    (candidate) => candidate.report.productId === productId,
  );

  if (!entry) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_FOUND",
      "The product is not a published product in this catalogue.",
      404,
    );
  }

  if (entry.report.merchantReadiness !== "READY" || !entry.productInput) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_PURCHASABLE",
      `The product is not ready for Merchant submission (${entry.report.merchantReadiness}).`,
      409,
    );
  }

  const productInput = entry.productInput;

  // 5-9. Current Google state: the offer must already be ours, and unambiguous.
  const accessToken = await getGoogleMerchantAccessToken();
  const googleProducts = await listGoogleMerchantProducts(
    config.accountId,
    accessToken,
  );

  const lookup = findManagedMerchantOffer(
    googleProducts,
    dataSourceName,
    productInput.offerId,
  );

  switch (lookup.status) {
    case "absent":
      throw new GoogleMerchantError(
        "PRODUCT_NOT_FOUND",
        "The offer is not present in the configured Merchant data source.",
        409,
      );
    case "duplicated":
      throw new GoogleMerchantError(
        "GOOGLE_REQUEST_FAILED",
        "The offer is duplicated in the configured Merchant data source.",
        409,
      );
    case "unexpected_content_language":
      throw new GoogleMerchantError(
        "GOOGLE_REQUEST_FAILED",
        "The existing offer has an unexpected content language.",
        409,
      );
    case "unexpected_feed_label":
      throw new GoogleMerchantError(
        "GOOGLE_REQUEST_FAILED",
        "The existing offer has an unexpected feed label.",
        409,
      );
    default:
      break;
  }

  // 10. The shared write primitive — one Merchant write, nothing rebuilt.
  const result = await upsertGoogleMerchantProductInput(productInput, {
    accessToken,
  });

  log.info("Merchant product resynced", { productId });

  return {
    merchantImages: {
      additionalCount: productInput.productAttributes.additionalImageLinks.length,
      primary: productInput.productAttributes.imageLink,
    },
    offerId: result.offerId,
    processedProductName: result.processedProductName,
    productId,
    productInputName: result.productInputName,
    resynced: true,
  };
}

// ---------------------------------------------------------------------------
// Controlled single-product deletion of an unsupported product type
// ---------------------------------------------------------------------------

/**
 * The outcome of a controlled deletion.
 *
 * `deleted: false` is NOT a failure and NOT a fabricated success: it means the
 * offer was already absent from our data source, so no DELETE request was sent.
 * Every gate had already passed at that point — the desired end state simply
 * held before we acted.
 */
export type MerchantDeleteResult =
  | {
      deleted: true;
      productId: string;
      offerId: string;
      productInputName: string;
    }
  | {
      deleted: false;
      alreadyAbsent: true;
      productId: string;
      offerId: string;
    };

/**
 * Permanently delete ONE unsupported product's ProductInput. THE ONLY delete.
 *
 * This exists for exactly one situation: an offer that reached Google before
 * the saree-only eligibility gate existed and can never legitimately be
 * republished. It is not a general cleanup tool.
 *
 * Everything is recomputed from CURRENT state immediately before the write — an
 * earlier browser preview is never trusted — and every gate must pass:
 *
 *   A. the product id is a UUID;
 *   B. the product is in the current published audit;
 *   C. its readiness is EXACTLY `UNSUPPORTED_PRODUCT_TYPE`. READY, SOLD,
 *      RESERVED, NO_MERCHANT_SAFE_IMAGE and every other state are refused —
 *      this is deliberately NOT a "delete any non-ready product" path, so a
 *      future sold saree can never be permanently removed through it;
 *   D. the audit carries NO ProductInput, the invariant for an unsupported
 *      product. A ProductInput here would mean readiness and the mapper
 *      disagree, so it fails closed as an internal inconsistency;
 *   E-H. exactly one offer with this offerId exists in OUR configured data
 *      source, with contentLanguage `en` and feedLabel `IN`. A "Found by
 *      Google" or supplemental-feed match is never touched; zero matches means
 *      already absent; more than one is a conflict.
 *
 * Google processing is asynchronous, so the processed Product may still appear
 * in `products.list` for minutes after a successful delete. A second call in
 * that window sees the offer, deletes it again (harmless and idempotent
 * upstream); once Google has reconciled, a later call reports `deleted: false,
 * alreadyAbsent: true` and issues no request.
 *
 * @throws {GoogleMerchantError} sanitised, for every refusal. No Google request
 *   is made unless all gates pass.
 */
export async function deleteUnsupportedMerchantProduct(
  productId: string,
): Promise<MerchantDeleteResult> {
  assertServerRuntime();

  // A. Identity.
  if (!UUID_PATTERN.test(productId)) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_FOUND",
      "That product id is not a valid product identifier.",
      400,
    );
  }

  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);

  // B. Current local state, through the SAME readiness logic as everything else.
  const audit = await runMerchantCatalogueAudit();
  const entry = audit.audits.find(
    (candidate) => candidate.report.productId === productId,
  );

  if (!entry) {
    throw new GoogleMerchantError(
      "PRODUCT_NOT_FOUND",
      "The product is not a published product in this catalogue.",
      404,
    );
  }

  // C. The single permitted readiness state.
  if (entry.report.merchantReadiness !== "UNSUPPORTED_PRODUCT_TYPE") {
    throw new GoogleMerchantError(
      "MERCHANT_DELETE_NOT_PERMITTED",
      `Only a product whose Merchant readiness is UNSUPPORTED_PRODUCT_TYPE may be deleted (this product is ${entry.report.merchantReadiness}).`,
      409,
    );
  }

  // D. The invariant: an unsupported product has no ProductInput.
  if (entry.productInput !== null) {
    log.error("Unsupported product unexpectedly carries a ProductInput", {
      productId,
    });

    throw new GoogleMerchantError(
      "MERCHANT_DELETE_INVARIANT_VIOLATED",
      "The audit reported an unsupported product type but still produced a Merchant payload. Refusing to delete.",
      500,
    );
  }

  // E. Current Google state. One token for the read and the delete.
  const accessToken = await getGoogleMerchantAccessToken();
  const googleProducts = await listGoogleMerchantProducts(
    config.accountId,
    accessToken,
  );

  // F-H. Ownership, uniqueness and identity — the shared resolver.
  const lookup = findManagedMerchantOffer(
    googleProducts,
    dataSourceName,
    productId,
  );

  switch (lookup.status) {
    case "absent":
      // Nothing to do, and nothing to claim. No DELETE is issued.
      log.info("Unsupported Merchant offer already absent", { productId });

      return {
        alreadyAbsent: true,
        deleted: false,
        offerId: productId,
        productId,
      };
    case "duplicated":
      throw new GoogleMerchantError(
        "GOOGLE_REQUEST_FAILED",
        "The offer is duplicated in the configured Merchant data source.",
        409,
      );
    case "unexpected_content_language":
      throw new GoogleMerchantError(
        "GOOGLE_REQUEST_FAILED",
        "The existing offer has an unexpected content language.",
        409,
      );
    case "unexpected_feed_label":
      throw new GoogleMerchantError(
        "GOOGLE_REQUEST_FAILED",
        "The existing offer has an unexpected feed label.",
        409,
      );
    default:
      break;
  }

  // The single delete primitive — one Merchant request, nothing else touched.
  const result = await deleteGoogleMerchantProductInput(productId, {
    accessToken,
  });

  log.info("Unsupported Merchant product deleted", { productId });

  return {
    deleted: true,
    offerId: result.offerId,
    productId,
    productInputName: result.productInputName,
  };
}

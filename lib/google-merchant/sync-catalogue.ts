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
 * NOT in this phase: deletion (candidates are reported only), product-save /
 * reservation / order hooks, cron reconciliation, an unrestricted full sync,
 * and any persisted sync state.
 */

import { runMerchantCatalogueAudit } from "@/lib/google-merchant/audit-catalogue";
import { getGoogleMerchantAccessToken } from "@/lib/google-merchant/auth";
import {
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
import { listGoogleMerchantProducts } from "@/lib/google-merchant/google-catalogue";
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

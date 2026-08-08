/**
 * Phase 2A.1 — catalogue backfill, database side.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * `previewMerchantCatalogueBackfill()` is STRICTLY READ-ONLY.
 * `applyMerchantCatalogueBackfill()` writes ONLY `products.attributes`, through
 * the existing `updateProduct` helper — no raw SQL, no other column, no other
 * table, and never a Merchant API call.
 *
 * TRANSACTIONS: the database client is `drizzle-orm/neon-http`, which has no
 * multi-statement transaction abstraction (each statement is its own HTTP
 * round trip). Rather than fake one, apply performs bounded per-product updates
 * and fails closed: the first failure stops the run and the result reports
 * exactly which products were written and which were not. Each write is
 * independently safe — it only adds absent keys — so a partial run leaves the
 * catalogue consistent and the next apply resumes where this one stopped.
 */

import { listProducts, updateProduct } from "@/db/queries/products";
import { listProductTypes } from "@/db/queries/product-types";
import type { ProductTypeRecord } from "@/db/queries/product-types";
import { runMerchantCatalogueAudit } from "@/lib/google-merchant/audit-catalogue";
import {
  mergeBackfillAttributes,
  planCatalogueBackfill,
  validatePlannedChange,
} from "@/lib/google-merchant/catalogue-backfill";
import type {
  CatalogueBackfillPlan,
  ProductBackfillChange,
} from "@/lib/google-merchant/catalogue-backfill";
import { GoogleMerchantError, assertServerRuntime } from "@/lib/google-merchant/config";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:catalogue-backfill");

/** Page size for the backfill scan — the catalogue is far below this today. */
export const BACKFILL_PRODUCT_LIMIT = 1000;

export type MerchantBackfillApplyResult = {
  applied: true;
  productsChanged: number;
  fieldsWritten: number;
  readinessAfter: { ready: number; blocked: number };
};

/**
 * Load the products and types the plan is computed from.
 *
 * Published products only — the same population the readiness audit reports on
 * — but ALL stock statuses: a sold saree may be restocked, and these defaults
 * are catalogue-level facts. Stock status is read, never written.
 */
async function loadBackfillInputs() {
  const [{ rows }, productTypes] = await Promise.all([
    listProducts({
      includeDrafts: false,
      limit: BACKFILL_PRODUCT_LIMIT,
      offset: 0,
    }),
    listProductTypes(),
  ]);

  const productTypesById = new Map<string, ProductTypeRecord>(
    productTypes.map((type) => [type.id, type]),
  );

  return { productTypesById, rows };
}

/** Compute the plan from current database state. Performs NO write. */
export async function previewMerchantCatalogueBackfill(): Promise<CatalogueBackfillPlan> {
  assertServerRuntime();

  const { productTypesById, rows } = await loadBackfillInputs();

  return planCatalogueBackfill(rows, productTypesById);
}

/**
 * Apply the backfill.
 *
 * The preview is recomputed from current state first — the plan a caller saw
 * earlier is never trusted — and every individual change is re-validated
 * against the freshly read row and type immediately before its write.
 *
 * @throws {GoogleMerchantError} when a change no longer validates, or when a
 *   write fails. Both stop the run; the error message names no row data.
 */
export async function applyMerchantCatalogueBackfill(): Promise<MerchantBackfillApplyResult> {
  assertServerRuntime();

  // 1. Recompute from current state.
  const { productTypesById, rows } = await loadBackfillInputs();
  const plan = planCatalogueBackfill(rows, productTypesById);
  const productsById = new Map(rows.map((row) => [row.id, row]));

  // 2. Validate every proposed mutation before writing any of them.
  for (const change of plan.changes) {
    const product = productsById.get(change.productId);
    const productType = product?.typeId
      ? (productTypesById.get(product.typeId) ?? null)
      : null;

    const refusal = product
      ? validatePlannedChange(change, product, productType)
      : "PRODUCT_NOT_FOUND";

    if (refusal) {
      log.error("Refusing catalogue backfill", { reason: refusal });
      throw new GoogleMerchantError(
        "CATALOGUE_BACKFILL_REFUSED",
        "A proposed change no longer matches the current catalogue state.",
        409,
      );
    }
  }

  // 3. Bounded writes, fail closed on the first failure.
  let productsChanged = 0;
  let fieldsWritten = 0;

  for (const change of plan.changes) {
    const product = productsById.get(change.productId);
    if (!product) continue;

    try {
      const updated = await updateProduct(change.productId, {
        attributes: mergeBackfillAttributes(product, change),
      });

      if (!updated) throw new Error("product disappeared");
    } catch {
      log.error("Catalogue backfill write failed", {
        productsChanged,
        stoppedAt: change.productId,
      });

      throw new GoogleMerchantError(
        "CATALOGUE_BACKFILL_WRITE_FAILED",
        `The backfill stopped after ${productsChanged} product(s). No value was overwritten.`,
        502,
      );
    }

    productsChanged += 1;
    fieldsWritten += Object.keys(change.set).length;
  }

  // 4. Re-run the existing readiness logic over the updated catalogue.
  const readiness = await runMerchantCatalogueAudit();

  log.info("Catalogue backfill applied", {
    fieldsWritten,
    productsChanged,
    ready: readiness.summary.ready,
  });

  return {
    applied: true,
    fieldsWritten,
    productsChanged,
    readinessAfter: {
      blocked: readiness.summary.blocked,
      ready: readiness.summary.ready,
    },
  };
}

export type { ProductBackfillChange };

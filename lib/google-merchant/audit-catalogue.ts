/**
 * Phase 2A — catalogue readiness audit, database side.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * STRICTLY READ-ONLY. Two SELECTs and nothing else:
 *   1. `listProducts({ includeDrafts: false, … })` — the existing hydrated query.
 *   2. `getBatchActiveReservationsCounts(ids)` — ONE batched call for the whole
 *      page, only when inventory v2 is on. Never one query per product.
 *
 * No writes, no migrations, no Google call — the audit never touches the
 * Merchant API, so it needs no kill switch and no production gate. All decision
 * logic lives in the pure `catalogue-readiness` module.
 */

import { listProducts } from "@/db/queries/products";
import { getBatchActiveReservationsCounts } from "@/db/queries/reservations";
import { isInventoryV2 } from "@/lib/config/flags";
import { auditMerchantCatalogue } from "@/lib/google-merchant/catalogue-readiness";
import type { MerchantCatalogueAudit } from "@/lib/google-merchant/catalogue-readiness";
import { assertServerRuntime } from "@/lib/google-merchant/config";

/** Page size for the audit — the catalogue is far below this today. */
export const MERCHANT_AUDIT_PRODUCT_LIMIT = 1000;

export type MerchantCatalogueAuditResult = MerchantCatalogueAudit & {
  /** Total published products in the database, for truncation awareness. */
  totalPublishedProducts: number;
  /** True when more published products exist than this page audited. */
  truncated: boolean;
};

/**
 * Run the audit over every published product.
 *
 * @returns typed audits (each carrying the ProductInput Phase 2B would submit)
 *   plus a deterministic summary.
 */
export async function runMerchantCatalogueAudit(options: {
  limit?: number;
  offset?: number;
} = {}): Promise<MerchantCatalogueAuditResult> {
  assertServerRuntime();

  const limit = options.limit ?? MERCHANT_AUDIT_PRODUCT_LIMIT;
  const offset = options.offset ?? 0;

  const { rows, totalCount } = await listProducts({
    includeDrafts: false,
    limit,
    offset,
  });

  const inventoryV2 = isInventoryV2();

  // ONE reservations query for the whole page — no N+1.
  const activeReservationCounts = inventoryV2
    ? await getBatchActiveReservationsCounts(rows.map((row) => row.id))
    : new Map<string, number>();

  const audit = auditMerchantCatalogue(rows, {
    activeReservationCounts,
    inventoryV2,
  });

  return {
    ...audit,
    totalPublishedProducts: totalCount,
    truncated: offset + rows.length < totalCount,
  };
}

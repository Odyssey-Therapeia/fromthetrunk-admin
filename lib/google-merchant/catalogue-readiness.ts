/**
 * Phase 2A — Google Merchant catalogue readiness audit (PURE).
 *
 * Answers one question per published product: *would the validated Merchant
 * ProductInput mapper accept this today, and if not, exactly why?*
 *
 * READ-ONLY BY CONSTRUCTION. This module performs no network I/O, no database
 * access and no Google call — it is a function of the product rows plus an
 * inventory context supplied by the caller. Nothing here inserts, updates or
 * deletes anything, in Neon or in Merchant Center.
 *
 * THE INVARIANT: a product reported READY is one that
 * `buildMerchantProductInput` has ALREADY accepted — the audit literally runs
 * the mapper and keeps its output. There is no second rule set, and readiness
 * cannot drift from what Phase 2B would submit.
 *
 * The audit is stricter than the mapper on exactly ONE point, deliberately:
 * `material` must be explicitly recorded (see `resolveExplicitMaterial`) rather
 * than falling back to the display-details inference. That only ever makes the
 * audit refuse products the mapper would accept, never the reverse, so the
 * invariant holds; the reason is that submitting an inferred fabric to Google
 * would be fabricated data.
 *
 * PHASE 2B: consume `MerchantProductAudit.productInput` — the typed, ready-to-
 * submit ProductInput built during the audit. Never parse the report strings.
 */

import { deriveStockStatus } from "@/db/inventory";
import type { StockStatus } from "@/db/inventory";
import type { ProductWithRelations } from "@/db/queries/products";
import { isExcludedTestProduct } from "@/lib/channels/feed-exclusions";
import {
  GoogleMerchantError,
  GoogleMerchantProductDataError,
} from "@/lib/google-merchant/config";
import {
  buildMerchantProductInput,
  resolveExplicitMaterial,
} from "@/lib/google-merchant/product-input";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";

// ---------------------------------------------------------------------------
// States and reasons
// ---------------------------------------------------------------------------

/**
 * Readiness states, in the fixed order used for every summary breakdown so the
 * response shape is byte-stable across runs.
 *
 * UNSUPPORTED_PRODUCT_TYPE is declared for Phase 2B completeness but is not
 * currently assignable: the repository has no reviewed product-type → Merchant
 * category mapping, so every published product is audited against the single
 * validated apparel rule set. Inventing a "this type is unsupported" rule here
 * would be exactly the second rule set this module exists to avoid.
 */
export const MERCHANT_READINESS_STATES = [
  "READY",
  "MISSING_REQUIRED_ATTRIBUTES",
  "NO_VALID_IMAGE",
  "INVALID_PRICE",
  "INVALID_LANDING_PAGE",
  "UNSUPPORTED_PRODUCT_TYPE",
  "RESERVED",
  "SOLD",
  "NOT_PUBLISHED",
  "EXCLUDED_TEST_PRODUCT",
  "MAPPING_ERROR",
] as const;

export type MerchantReadiness = (typeof MERCHANT_READINESS_STATES)[number];

/** Machine-readable reasons. Stable identifiers, never free text. */
export const MERCHANT_AUDIT_REASON_CODES = [
  "product_not_published",
  "excluded_test_product",
  "inventory_reserved",
  "inventory_sold",
  "stock_status_disagreement",
  "missing_apparel_attributes",
  "missing_material",
  "no_public_image",
  "image_not_public_https",
  "price_not_positive_integer",
  "landing_page_not_canonical",
  "mapper_rejected",
] as const;

export type MerchantAuditReasonCode =
  (typeof MERCHANT_AUDIT_REASON_CODES)[number];

/**
 * The only product information that leaves the audit.
 *
 * No database row, no metadata, no image records, no credentials, no upstream
 * payloads. `stockStatus` is the EFFECTIVE status the audit decided on (the
 * inventory-v2 derived value when that flag is on), which is the value that
 * actually drove the outcome.
 */
export type MerchantProductAuditReport = {
  productId: string;
  slug: string;
  name: string;
  status: string;
  stockStatus: StockStatus;
  merchantReadiness: MerchantReadiness;
  missingFields: string[];
  reasons: MerchantAuditReasonCode[];
};

export type MerchantProductAudit = {
  report: MerchantProductAuditReport;
  /**
   * The ProductInput the mapper produced — non-null exactly when the report is
   * READY. This is Phase 2B's input: audit → READY → take this object → upsert.
   */
  productInput: MerchantProductInput | null;
};

export type MerchantAuditSummary = {
  publishedProducts: number;
  ready: number;
  blocked: number;
  /** Count per readiness state, zero-filled, in MERCHANT_READINESS_STATES order. */
  byReason: Record<MerchantReadiness, number>;
  /** Count per reason code, zero-filled, in MERCHANT_AUDIT_REASON_CODES order. */
  byReasonCode: Record<MerchantAuditReasonCode, number>;
};

export type MerchantCatalogueAudit = {
  audits: MerchantProductAudit[];
  summary: MerchantAuditSummary;
};

/** Inventory facts the caller resolved once for the whole batch. */
export type MerchantInventoryContext = {
  /** `isInventoryV2()` — decided once, not per product. */
  inventoryV2: boolean;
  /** productId → active reservation count, from ONE batch query. */
  activeReservationCounts: ReadonlyMap<string, number>;
};

// ---------------------------------------------------------------------------
// Per-product audit
// ---------------------------------------------------------------------------

const blocked = (
  product: ProductWithRelations,
  stockStatus: StockStatus,
  merchantReadiness: MerchantReadiness,
  reasons: MerchantAuditReasonCode[],
  missingFields: string[] = [],
): MerchantProductAudit => ({
  productInput: null,
  report: {
    merchantReadiness,
    missingFields,
    name: product.name,
    productId: product.id,
    reasons,
    slug: product.slug,
    status: product.status,
    stockStatus,
  },
});

/**
 * Translate a mapper rejection into a readiness state.
 *
 * The mapper's typed error codes ARE the audit's vocabulary — that is what
 * keeps the two from diverging.
 */
function classifyMapperError(
  product: ProductWithRelations,
  stockStatus: StockStatus,
  error: unknown,
): MerchantProductAudit {
  if (error instanceof GoogleMerchantProductDataError) {
    return blocked(
      product,
      stockStatus,
      "MISSING_REQUIRED_ATTRIBUTES",
      ["missing_apparel_attributes"],
      [...error.missingFields],
    );
  }

  if (error instanceof GoogleMerchantError) {
    switch (error.code) {
      case "PRODUCT_IMAGE_MISSING":
        return blocked(product, stockStatus, "NO_VALID_IMAGE", [
          "no_public_image",
        ]);
      case "PRODUCT_IMAGE_INVALID":
        return blocked(product, stockStatus, "NO_VALID_IMAGE", [
          "image_not_public_https",
        ]);
      case "PRODUCT_PRICE_INVALID":
        return blocked(product, stockStatus, "INVALID_PRICE", [
          "price_not_positive_integer",
        ]);
      case "PRODUCT_LINK_INVALID":
        return blocked(product, stockStatus, "INVALID_LANDING_PAGE", [
          "landing_page_not_canonical",
        ]);
      case "PRODUCT_NOT_PURCHASABLE":
        // The effective status said available but the mapper disagreed, i.e.
        // the raw stockStatus column contradicts the derived state. Report the
        // column's verdict — never advertise a possibly-held saree.
        return blocked(
          product,
          stockStatus,
          product.stockStatus === "sold" ? "SOLD" : "RESERVED",
          ["stock_status_disagreement"],
        );
      default:
        return blocked(product, stockStatus, "MAPPING_ERROR", [
          "mapper_rejected",
        ]);
    }
  }

  return blocked(product, stockStatus, "MAPPING_ERROR", ["mapper_rejected"]);
}

/**
 * Audit one product against the Merchant mapper.
 *
 * @param effectiveStockStatus the inventory-v2 derived status when that flag is
 *   on, otherwise the product's own `stockStatus`.
 */
export function auditMerchantProduct(
  product: ProductWithRelations,
  effectiveStockStatus: StockStatus,
): MerchantProductAudit {
  if (product.status !== "published") {
    return blocked(product, effectiveStockStatus, "NOT_PUBLISHED", [
      "product_not_published",
    ]);
  }

  if (isExcludedTestProduct(product)) {
    return blocked(product, effectiveStockStatus, "EXCLUDED_TEST_PRODUCT", [
      "excluded_test_product",
    ]);
  }

  if (effectiveStockStatus === "reserved") {
    return blocked(product, effectiveStockStatus, "RESERVED", [
      "inventory_reserved",
    ]);
  }

  if (effectiveStockStatus === "sold") {
    return blocked(product, effectiveStockStatus, "SOLD", ["inventory_sold"]);
  }

  let productInput: MerchantProductInput;
  try {
    productInput = buildMerchantProductInput({
      effectiveStockStatus,
      product,
    });
  } catch (error) {
    return classifyMapperError(product, effectiveStockStatus, error);
  }

  // Stricter than the mapper by design: an inferred fabric is not real data.
  if (resolveExplicitMaterial(product) === null) {
    return blocked(
      product,
      effectiveStockStatus,
      "MISSING_REQUIRED_ATTRIBUTES",
      ["missing_material"],
      ["material"],
    );
  }

  return {
    productInput,
    report: {
      merchantReadiness: "READY",
      missingFields: [],
      name: product.name,
      productId: product.id,
      reasons: [],
      slug: product.slug,
      status: product.status,
      stockStatus: effectiveStockStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Catalogue audit
// ---------------------------------------------------------------------------

/**
 * The status that decides purchasability, resolved from the batch context.
 *
 * Inventory v2 ON: `deriveStockStatus` over quantity_available + the batched
 * active-reservation count — the derived state overrides a stale column.
 * OFF: the `stockStatus` column, exactly as every other read path.
 */
function resolveEffectiveStockStatus(
  product: ProductWithRelations,
  context: MerchantInventoryContext,
): StockStatus {
  if (!context.inventoryV2) return product.stockStatus;

  return deriveStockStatus({
    activeReservationsCount: context.activeReservationCounts.get(product.id) ?? 0,
    quantityAvailable: product.quantityAvailable,
  });
}

const zeroFilled = <K extends string>(keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/** Summarise audits deterministically: fixed key order, zero-filled counts. */
export function summariseMerchantAudit(
  audits: MerchantProductAudit[],
): MerchantAuditSummary {
  const byReason = zeroFilled(MERCHANT_READINESS_STATES);
  const byReasonCode = zeroFilled(MERCHANT_AUDIT_REASON_CODES);

  for (const { report } of audits) {
    byReason[report.merchantReadiness] += 1;
    for (const reason of report.reasons) {
      byReasonCode[reason] += 1;
    }
  }

  const ready = byReason.READY;

  return {
    blocked: audits.length - ready,
    byReason,
    byReasonCode,
    publishedProducts: audits.length,
    ready,
  };
}

/**
 * Audit a whole catalogue. Pure: the caller supplies the products and the
 * inventory context (one batch reservation query, never one per product).
 *
 * Output order mirrors input order, so repeated runs over the same rows produce
 * an identical response.
 */
export function auditMerchantCatalogue(
  products: ProductWithRelations[],
  context: MerchantInventoryContext,
): MerchantCatalogueAudit {
  const audits = products.map((product) =>
    auditMerchantProduct(
      product,
      resolveEffectiveStockStatus(product, context),
    ),
  );

  return { audits, summary: summariseMerchantAudit(audits) };
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/** Escape a CSV cell per RFC 4180 (mirrors the products export). */
const escapeCsvCell = (value: unknown): string => {
  const str = value == null ? "" : String(value);
  return /[",\n\r]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

export const MERCHANT_AUDIT_CSV_HEADERS = [
  "product_id",
  "slug",
  "name",
  "stock_status",
  "merchant_readiness",
  "missing_fields",
  "reasons",
] as const;

/** Serialise reports to CSV. List columns are pipe-separated. */
export function toMerchantAuditCsv(
  reports: MerchantProductAuditReport[],
): string {
  const rows = [MERCHANT_AUDIT_CSV_HEADERS.join(",")];

  for (const report of reports) {
    rows.push(
      [
        report.productId,
        report.slug,
        report.name,
        report.stockStatus,
        report.merchantReadiness,
        report.missingFields.join("|"),
        report.reasons.join("|"),
      ]
        .map(escapeCsvCell)
        .join(","),
    );
  }

  return rows.join("\n");
}

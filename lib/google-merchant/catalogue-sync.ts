/**
 * Phase 2B.1 — catalogue synchronisation planner (PURE).
 *
 * Reconciles the LOCAL desired state against the CURRENT Google state and
 * returns a typed plan. No network, no database, no Google call — a function of
 * the audit result plus the Google product list, which is what makes every
 * classification rule directly testable.
 *
 * THE INVARIANT: the desired state is the Phase 2A audit. A product is
 * syncable exactly when the audit called it READY, and the ProductInput that
 * would be submitted is the one the audit already built and carried on
 * `MerchantProductAudit.productInput`. Phase 2B NEVER rebuilds a ProductInput
 * and never re-implements a readiness rule.
 *
 * IDENTITY: the local product UUID is the Merchant `offerId`. Matching is by
 * offerId only — never by slug, which is editable. `contentLanguage` must be
 * "en" and `feedLabel` "IN"; an offer of ours carrying anything else is a
 * CONFLICT and is never written to.
 *
 * OWNERSHIP: only Google products whose `dataSource` is the configured API data
 * source participate. "Found by Google", supplemental feeds and other sources
 * are invisible to this plan.
 */

import type { MerchantProductAudit } from "@/lib/google-merchant/catalogue-readiness";
import {
  isManagedByDataSource,
} from "@/lib/google-merchant/google-catalogue";
import type {
  GoogleItemLevelIssue,
  GoogleMerchantProductSummary,
} from "@/lib/google-merchant/google-catalogue";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";

export const EXPECTED_CONTENT_LANGUAGE = "en";
export const EXPECTED_FEED_LABEL = "IN";

/**
 * Plan actions, in the fixed order used for deterministic breakdowns.
 *
 * UPDATE is declared for a later phase and is not currently emitted: this
 * bootstrap does not compute a semantic diff, so an offer already present in
 * our data source is reported as ALREADY_PRESENT and left alone. (A re-submit
 * would be harmless — productInputs:insert upserts on the same identity — but
 * "already present" is the honest description of what the planner knows.)
 *
 * DELETE_CANDIDATE is a REPORT, not an instruction. Nothing acts on it: this
 * module is pure, the apply batch is INSERT-only, and the one delete endpoint
 * takes an explicit product id and re-derives its own gates from scratch.
 */
export const SYNC_ACTIONS = [
  "INSERT",
  "ALREADY_PRESENT",
  "UPDATE",
  "DELETE_CANDIDATE",
  "BLOCKED_LOCAL",
  "CONFLICT",
] as const;

export type SyncActionType = (typeof SYNC_ACTIONS)[number];

/** The safe, publishable description of one planned action. */
export type SyncActionReport = {
  productId: string;
  offerId: string;
  slug: null | string;
  name: null | string;
  action: SyncActionType;
  /** Machine-readable detail: readiness state, or why an offer conflicts. */
  reason: null | string;
};

export type SyncAction = {
  report: SyncActionReport;
  /**
   * The ProductInput to submit — present only on INSERT/UPDATE actions, taken
   * verbatim from the audit. Never leaves the process.
   */
  productInput: null | MerchantProductInput;
};

export type SyncPlanSummary = {
  localPublished: number;
  localReady: number;
  googleManaged: number;
  alreadyPresent: number;
  insert: number;
  update: number;
  deleteCandidates: number;
  conflicts: number;
};

export type SyncPlan = {
  summary: SyncPlanSummary;
  actions: SyncAction[];
};

const identity = (audit: MerchantProductAudit) => ({
  name: audit.report.name,
  offerId: audit.report.productId,
  productId: audit.report.productId,
  slug: audit.report.slug,
});

/** Deterministic order for the whole plan and for batch selection. */
const byOfferId = (a: SyncAction, b: SyncAction) =>
  a.report.offerId < b.report.offerId
    ? -1
    : a.report.offerId > b.report.offerId
      ? 1
      : 0;

/**
 * Build the reconciliation plan.
 *
 * @param audits every published product's Phase 2A audit, in audit order.
 * @param googleProducts every product Google holds for the account — filtered
 *   to our data source here, so callers cannot forget to.
 */
export function planCatalogueSync(
  audits: MerchantProductAudit[],
  googleProducts: GoogleMerchantProductSummary[],
  dataSourceName: string,
): SyncPlan {
  const managed = googleProducts.filter((product) =>
    isManagedByDataSource(product, dataSourceName),
  );

  const managedByOfferId = new Map<string, GoogleMerchantProductSummary[]>();
  for (const product of managed) {
    const bucket = managedByOfferId.get(product.offerId) ?? [];
    bucket.push(product);
    managedByOfferId.set(product.offerId, bucket);
  }

  const actions: SyncAction[] = [];
  const localOfferIds = new Set<string>();

  for (const audit of audits) {
    const offerId = audit.report.productId;
    localOfferIds.add(offerId);

    const existing = managedByOfferId.get(offerId) ?? [];
    const ready = audit.report.merchantReadiness === "READY";

    // A duplicate offerId inside our own data source is never safe to write to.
    if (existing.length > 1) {
      actions.push({
        productInput: null,
        report: {
          ...identity(audit),
          action: "CONFLICT",
          reason: "DUPLICATE_OFFER_ID",
        },
      });
      continue;
    }

    const [google] = existing;

    if (google) {
      const languageMismatch =
        google.contentLanguage !== EXPECTED_CONTENT_LANGUAGE;
      const feedLabelMismatch = google.feedLabel !== EXPECTED_FEED_LABEL;

      if (languageMismatch || feedLabelMismatch) {
        actions.push({
          productInput: null,
          report: {
            ...identity(audit),
            action: "CONFLICT",
            reason: languageMismatch
              ? "UNEXPECTED_CONTENT_LANGUAGE"
              : "UNEXPECTED_FEED_LABEL",
          },
        });
        continue;
      }
    }

    if (!ready) {
      // Present in Google but not READY (sold, unpublished, incomplete, an
      // unsupported product type): a deletion CANDIDATE — reported only. The
      // planner never deletes, and nothing consumes DELETE_CANDIDATE to delete
      // either. The one delete path in the integration
      // (`deleteUnsupportedMerchantProduct`) takes a single explicitly named
      // product id and re-derives its own gates; it never reads this plan.
      actions.push({
        productInput: null,
        report: {
          ...identity(audit),
          action: google ? "DELETE_CANDIDATE" : "BLOCKED_LOCAL",
          reason: audit.report.merchantReadiness,
        },
      });
      continue;
    }

    if (google) {
      actions.push({
        productInput: null,
        report: { ...identity(audit), action: "ALREADY_PRESENT", reason: null },
      });
      continue;
    }

    actions.push({
      // Straight from the audit — Phase 2B never rebuilds a ProductInput.
      productInput: audit.productInput,
      report: { ...identity(audit), action: "INSERT", reason: null },
    });
  }

  // Offers in our data source with no local product row at all.
  for (const [offerId, entries] of managedByOfferId) {
    if (localOfferIds.has(offerId)) continue;

    actions.push({
      productInput: null,
      report: {
        action: entries.length > 1 ? "CONFLICT" : "DELETE_CANDIDATE",
        name: entries[0]?.title ?? null,
        offerId,
        productId: offerId,
        reason: entries.length > 1 ? "DUPLICATE_OFFER_ID" : "NO_LOCAL_PRODUCT",
        slug: null,
      },
    });
  }

  actions.sort(byOfferId);

  const count = (action: SyncActionType) =>
    actions.filter((entry) => entry.report.action === action).length;

  return {
    actions,
    summary: {
      alreadyPresent: count("ALREADY_PRESENT"),
      conflicts: count("CONFLICT"),
      deleteCandidates: count("DELETE_CANDIDATE"),
      googleManaged: managed.length,
      insert: count("INSERT"),
      localPublished: audits.length,
      localReady: audits.filter(
        (audit) => audit.report.merchantReadiness === "READY",
      ).length,
      update: count("UPDATE"),
    },
  };
}

/**
 * The INSERT actions a batch may execute, in deterministic offerId order.
 *
 * Only INSERT — never ALREADY_PRESENT (so the approved Tangerine offer is not
 * re-submitted during the bootstrap), never DELETE_CANDIDATE, never CONFLICT.
 */
export function selectInsertBatch(plan: SyncPlan, limit: number): SyncAction[] {
  return plan.actions
    .filter(
      (action) =>
        action.report.action === "INSERT" && action.productInput !== null,
    )
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Status interpretation
// ---------------------------------------------------------------------------

export const MERCHANT_PRODUCT_STATUSES = [
  "APPROVED",
  "LIMITED",
  "PENDING",
  "DISAPPROVED",
  "UNKNOWN",
] as const;

export type MerchantProductStatus = (typeof MERCHANT_PRODUCT_STATUSES)[number];

/**
 * Classify a processed Google product.
 *
 * Google reports per-destination country lists, so:
 *   - anything disapproved anywhere          → DISAPPROVED
 *   - approved somewhere AND pending elsewhere → LIMITED
 *   - approved somewhere only                → APPROVED
 *   - pending only                           → PENDING
 *   - no destination information at all      → UNKNOWN
 *
 * Processing is asynchronous: a product Google has accepted but not yet
 * reviewed reports PENDING, and an insert never implies approval. Nothing here
 * attempts to remediate an issue.
 */
export function classifyMerchantProductStatus(
  product: GoogleMerchantProductSummary,
): MerchantProductStatus {
  if (product.destinationStatuses.length === 0) return "UNKNOWN";

  let approved = false;
  let pending = false;

  for (const status of product.destinationStatuses) {
    if (status.disapprovedCountries.length > 0) return "DISAPPROVED";
    if (status.approvedCountries.length > 0) approved = true;
    if (status.pendingCountries.length > 0) pending = true;
  }

  if (approved && pending) return "LIMITED";
  if (approved) return "APPROVED";
  if (pending) return "PENDING";

  return "UNKNOWN";
}

/** The safe, publishable status projection for one managed product. */
export type MerchantProductStatusReport = {
  offerId: string;
  title: null | string;
  availability: null | string;
  price: null | { amountMicros: string; currencyCode: string };
  status: MerchantProductStatus;
  destinationStatuses: GoogleMerchantProductSummary["destinationStatuses"];
  itemLevelIssues: GoogleItemLevelIssue[];
};

/** Project the managed subset of a Google product list for the status endpoint. */
export function buildMerchantStatusReports(
  googleProducts: GoogleMerchantProductSummary[],
  dataSourceName: string,
): MerchantProductStatusReport[] {
  return googleProducts
    .filter((product) => isManagedByDataSource(product, dataSourceName))
    .map((product) => ({
      availability: product.availability,
      destinationStatuses: product.destinationStatuses,
      itemLevelIssues: product.itemLevelIssues,
      offerId: product.offerId,
      price: product.price,
      status: classifyMerchantProductStatus(product),
      title: product.title,
    }))
    .sort((a, b) => (a.offerId < b.offerId ? -1 : a.offerId > b.offerId ? 1 : 0));
}

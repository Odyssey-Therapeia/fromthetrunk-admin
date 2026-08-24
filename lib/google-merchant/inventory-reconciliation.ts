/**
 * Automatic Google Merchant inventory reconciliation — the PLANNER (PURE).
 *
 * State-based, not event-based. There is no queue and no webhook fan-out: the
 * CURRENT contents of Neon are the desired state, and every run re-derives the
 * whole plan from scratch. That is what makes the worker idempotent, safe to
 * run once a minute, and safe to miss runs entirely — a dropped run costs
 * latency, never correctness.
 *
 * CRITICALLY, this is why checkout never depends on Google. Nothing in the
 * payment path calls Merchant Center; the reconciler observes the result
 * afterwards. Google being slow or down can delay an availability change, but
 * can never fail a reservation, a Razorpay callback or a paid order.
 *
 * No network, no database, no Google call — a function of the Phase 2A audit
 * plus the Google product list, which is what makes every rule directly
 * testable.
 *
 * THE INVARIANT, unchanged from the bootstrap planner: readiness is the single
 * source of eligibility truth. This module never re-derives whether a product
 * is a saree, never rebuilds a ProductInput, and never invents product data —
 * it only compares the audit's verdict against what Google currently holds.
 *
 * OWNERSHIP: only products whose `dataSource` is the configured API data source
 * participate. "Found by Google", supplemental feeds and other API sources are
 * visible but never mutated.
 */

import type { MerchantProductAudit } from "@/lib/google-merchant/catalogue-readiness";
import {
  EXPECTED_CONTENT_LANGUAGE,
  EXPECTED_FEED_LABEL,
} from "@/lib/google-merchant/catalogue-sync";
import { isManagedByDataSource } from "@/lib/google-merchant/google-catalogue";
import type { GoogleMerchantProductSummary } from "@/lib/google-merchant/google-catalogue";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";

/**
 * Actions, in SAFETY-FIRST execution order.
 *
 * The order of this array is the order writes are executed in, and it is not
 * arbitrary. Removing a sold saree and marking a held one out of stock protect
 * a customer from buying something they cannot have; adding a saree back only
 * costs a little reach. If a run hits its write ceiling, the actions that get
 * done are the protective ones.
 */
export const INVENTORY_SYNC_ACTIONS = [
  "DELETE_SOLD",
  "SET_OUT_OF_STOCK",
  "SET_IN_STOCK",
  "INSERT",
  "NOOP",
  "BLOCKED_LOCAL",
  "CONFLICT",
] as const;

export type InventorySyncActionType = (typeof INVENTORY_SYNC_ACTIONS)[number];

/** The actions that actually issue a Merchant write, in execution order. */
export const INVENTORY_SYNC_WRITE_ACTIONS = [
  "DELETE_SOLD",
  "SET_OUT_OF_STOCK",
  "SET_IN_STOCK",
  "INSERT",
] as const;

export type InventorySyncWriteAction =
  (typeof INVENTORY_SYNC_WRITE_ACTIONS)[number];

const WRITE_ACTION_PRIORITY = new Map<InventorySyncActionType, number>(
  INVENTORY_SYNC_WRITE_ACTIONS.map((action, index) => [action, index]),
);

export const isInventorySyncWriteAction = (
  action: InventorySyncActionType,
): action is InventorySyncWriteAction => WRITE_ACTION_PRIORITY.has(action);

/**
 * Machine-readable reasons. Stable identifiers, never free text.
 *
 * These explain WHY an action was chosen, which for a NOOP or a BLOCKED_LOCAL
 * is the only interesting part of the report.
 */
export const INVENTORY_SYNC_REASONS = [
  "ALREADY_IN_STOCK",
  "ALREADY_OUT_OF_STOCK",
  "AVAILABLE_NOT_IN_MERCHANT",
  "AVAILABLE_STALE_AVAILABILITY",
  "RESERVED_NOT_IN_MERCHANT",
  "RESERVED_STALE_AVAILABILITY",
  "SOLD_NOT_IN_MERCHANT",
  "SOLD_PRESENT_IN_MERCHANT",
  "UNSUPPORTED_PRODUCT_TYPE_ABSENT",
  "UNSUPPORTED_PRODUCT_TYPE_PRESENT",
  "NOT_READY_ABSENT",
  "NOT_READY_PRESENT",
  "READY_WITHOUT_PRODUCT_INPUT",
  "NO_LOCAL_PRODUCT",
  "DUPLICATE_OFFER_ID",
  "UNEXPECTED_CONTENT_LANGUAGE",
  "UNEXPECTED_FEED_LABEL",
] as const;

export type InventorySyncReason = (typeof INVENTORY_SYNC_REASONS)[number];

/**
 * The safe, publishable description of one planned action.
 *
 * No ProductInput, no image URL, no price, no database row, no Google resource
 * name — only what a human needs to understand the decision.
 */
export type InventorySyncActionReport = {
  productId: string;
  offerId: string;
  slug: null | string;
  name: null | string;
  /** The audit's verdict — the single source of eligibility truth. */
  merchantReadiness: null | string;
  /** The EFFECTIVE local stock status the audit decided on. */
  localStockStatus: null | string;
  /** Whether an offer with this id exists in OUR data source. */
  presentInMerchant: boolean;
  /** Google's current availability for that offer, when present. */
  googleAvailability: null | string;
  action: InventorySyncActionType;
  reason: InventorySyncReason;
};

export type InventorySyncAction = {
  report: InventorySyncActionReport;
  /**
   * The ProductInput to submit — present ONLY on INSERT, taken verbatim from
   * the audit. Never rebuilt here, and never leaves the process.
   */
  productInput: null | MerchantProductInput;
};

export type InventorySyncPlanSummary = {
  checked: number;
  googleManaged: number;
  /** Count per action, zero-filled, in INVENTORY_SYNC_ACTIONS order. */
  byAction: Record<InventorySyncActionType, number>;
  /** Total actions that would issue a Merchant write. */
  pendingWrites: number;
  /**
   * Offers of ours in Merchant whose local product row has vanished entirely.
   * Reported, never acted on — orphan cleanup is a bootstrap decision.
   */
  orphanedOffers: number;
  /**
   * Ineligible product types still present in Merchant. Reported, never
   * touched: broadening automatic deletion is explicitly out of scope.
   */
  unsupportedPresent: number;
};

export type InventorySyncPlan = {
  summary: InventorySyncPlanSummary;
  actions: InventorySyncAction[];
};

const identity = (audit: MerchantProductAudit) => ({
  merchantReadiness: audit.report.merchantReadiness,
  localStockStatus: audit.report.stockStatus,
  name: audit.report.name,
  offerId: audit.report.productId,
  productId: audit.report.productId,
  slug: audit.report.slug,
});

/** Deterministic order for the whole plan and for write selection. */
const byOfferId = (a: InventorySyncAction, b: InventorySyncAction) =>
  a.report.offerId < b.report.offerId
    ? -1
    : a.report.offerId > b.report.offerId
      ? 1
      : 0;

const zeroFilled = <K extends string>(keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((key) => [key, 0])) as Record<K, number>;

/**
 * Decide one product's action.
 *
 * `google` is the single managed offer for this product, or null when none
 * exists. Conflicts (duplicates, wrong language, wrong feed label) are resolved
 * by the caller before this is reached, so nothing here can write to an offer
 * whose identity is in doubt.
 */
function classify(
  audit: MerchantProductAudit,
  google: GoogleMerchantProductSummary | null,
): InventorySyncAction {
  const readiness = audit.report.merchantReadiness;
  const present = google !== null;
  const googleAvailability = google?.availability ?? null;

  const base = {
    ...identity(audit),
    googleAvailability,
    presentInMerchant: present,
  };

  const noop = (reason: InventorySyncReason): InventorySyncAction => ({
    productInput: null,
    report: { ...base, action: "NOOP", reason },
  });

  const blocked = (reason: InventorySyncReason): InventorySyncAction => ({
    productInput: null,
    report: { ...base, action: "BLOCKED_LOCAL", reason },
  });

  // ---- READY: an eligible, available saree the mapper already accepted.
  if (readiness === "READY") {
    if (!present) {
      // The ProductInput is the audit's own — never rebuilt here. If it is
      // somehow missing, refuse rather than invent one.
      if (audit.productInput === null) {
        return blocked("READY_WITHOUT_PRODUCT_INPUT");
      }

      return {
        productInput: audit.productInput,
        report: {
          ...base,
          action: "INSERT",
          reason: "AVAILABLE_NOT_IN_MERCHANT",
        },
      };
    }

    if (googleAvailability === "IN_STOCK") return noop("ALREADY_IN_STOCK");

    return {
      productInput: null,
      report: {
        ...base,
        action: "SET_IN_STOCK",
        reason: "AVAILABLE_STALE_AVAILABILITY",
      },
    };
  }

  // ---- RESERVED: someone is holding it. Never inserted, only hidden.
  if (readiness === "RESERVED") {
    // Absent is already the desired state — a held saree must not be added.
    if (!present) return noop("RESERVED_NOT_IN_MERCHANT");

    if (googleAvailability === "OUT_OF_STOCK") {
      return noop("ALREADY_OUT_OF_STOCK");
    }

    return {
      productInput: null,
      report: {
        ...base,
        action: "SET_OUT_OF_STOCK",
        reason: "RESERVED_STALE_AVAILABILITY",
      },
    };
  }

  // ---- SOLD: gone for good, so the offer is removed rather than hidden.
  //
  // Eligibility is already guaranteed here: the readiness audit applies the
  // saree-only product-type gate BEFORE the stock checks, so a sold blouse
  // reports UNSUPPORTED_PRODUCT_TYPE and can never reach this branch. Only an
  // eligible saree is ever SOLD.
  if (readiness === "SOLD") {
    if (!present) return noop("SOLD_NOT_IN_MERCHANT");

    return {
      productInput: null,
      report: {
        ...base,
        action: "DELETE_SOLD",
        reason: "SOLD_PRESENT_IN_MERCHANT",
      },
    };
  }

  // ---- Ineligible product type: never inserted, never patched, and NOT
  // auto-deleted. Removing one is a deliberate, separately gated, one-product
  // admin action — broadening it to an unattended worker is out of scope.
  if (readiness === "UNSUPPORTED_PRODUCT_TYPE") {
    return present
      ? blocked("UNSUPPORTED_PRODUCT_TYPE_PRESENT")
      : noop("UNSUPPORTED_PRODUCT_TYPE_ABSENT");
  }

  // ---- Every other blocked state: NO_MERCHANT_SAFE_IMAGE,
  // MISSING_REQUIRED_ATTRIBUTES, INVALID_PRICE, NOT_PUBLISHED, MAPPING_ERROR…
  //
  // Absent: cannot be inserted, because inserting would mean inventing the data
  // readiness says is missing. Present: NO rule is invented for it here. An
  // existing offer whose local product has become image-blocked or unpublished
  // is reported for human review, not silently mutated or removed.
  return blocked(present ? "NOT_READY_PRESENT" : "NOT_READY_ABSENT");
}

/**
 * Build the inventory reconciliation plan.
 *
 * @param audits every published product's readiness audit, in audit order.
 * @param googleProducts every product Google holds for the account — filtered
 *   to our data source here, so callers cannot forget to.
 */
export function planInventoryReconciliation(
  audits: MerchantProductAudit[],
  googleProducts: GoogleMerchantProductSummary[],
  dataSourceName: string,
): InventorySyncPlan {
  const managed = googleProducts.filter((product) =>
    isManagedByDataSource(product, dataSourceName),
  );

  const managedByOfferId = new Map<string, GoogleMerchantProductSummary[]>();
  for (const product of managed) {
    const bucket = managedByOfferId.get(product.offerId) ?? [];
    bucket.push(product);
    managedByOfferId.set(product.offerId, bucket);
  }

  const actions: InventorySyncAction[] = [];
  const localOfferIds = new Set<string>();

  for (const audit of audits) {
    const offerId = audit.report.productId;
    localOfferIds.add(offerId);

    const existing = managedByOfferId.get(offerId) ?? [];

    const conflict = (reason: InventorySyncReason): InventorySyncAction => ({
      productInput: null,
      report: {
        ...identity(audit),
        action: "CONFLICT",
        googleAvailability: null,
        presentInMerchant: true,
        reason,
      },
    });

    // A duplicate offerId inside our own data source is never safe to write to:
    // we cannot tell which input a PATCH or DELETE would hit.
    if (existing.length > 1) {
      actions.push(conflict("DUPLICATE_OFFER_ID"));
      continue;
    }

    const [google] = existing;

    if (google) {
      if (google.contentLanguage !== EXPECTED_CONTENT_LANGUAGE) {
        actions.push(conflict("UNEXPECTED_CONTENT_LANGUAGE"));
        continue;
      }

      if (google.feedLabel !== EXPECTED_FEED_LABEL) {
        actions.push(conflict("UNEXPECTED_FEED_LABEL"));
        continue;
      }
    }

    actions.push(classify(audit, google ?? null));
  }

  // Offers in our data source with no local product row at all. Reported so the
  // anomaly is visible, never acted on: deciding an orphan's fate belongs to
  // the manual bootstrap reconciliation, not to an unattended worker.
  for (const [offerId, entries] of managedByOfferId) {
    if (localOfferIds.has(offerId)) continue;

    actions.push({
      productInput: null,
      report: {
        action: "NOOP",
        googleAvailability: entries[0]?.availability ?? null,
        localStockStatus: null,
        merchantReadiness: null,
        name: entries[0]?.title ?? null,
        offerId,
        presentInMerchant: true,
        productId: offerId,
        reason: "NO_LOCAL_PRODUCT",
        slug: null,
      },
    });
  }

  actions.sort(byOfferId);

  const byAction = zeroFilled(INVENTORY_SYNC_ACTIONS);
  let pendingWrites = 0;
  let orphanedOffers = 0;
  let unsupportedPresent = 0;

  for (const { report } of actions) {
    byAction[report.action] += 1;
    if (isInventorySyncWriteAction(report.action)) pendingWrites += 1;
    if (report.reason === "NO_LOCAL_PRODUCT") orphanedOffers += 1;
    if (report.reason === "UNSUPPORTED_PRODUCT_TYPE_PRESENT") {
      unsupportedPresent += 1;
    }
  }

  return {
    actions,
    summary: {
      byAction,
      checked: audits.length,
      googleManaged: managed.length,
      orphanedOffers,
      pendingWrites,
      unsupportedPresent,
    },
  };
}

/**
 * The writes one run may execute, in SAFETY-FIRST then deterministic order.
 *
 * DELETE_SOLD first, then SET_OUT_OF_STOCK, then SET_IN_STOCK, then INSERT —
 * so a run that hits its ceiling has done the protective work, and the merely
 * additive work waits for the next minute. Within one action type the order is
 * by offerId, so a stuck product cannot starve the rest: it is retried in the
 * same position every run and the ones after it still get their turn.
 *
 * Never NOOP, never BLOCKED_LOCAL, never CONFLICT.
 */
export function selectInventoryWrites(
  plan: InventorySyncPlan,
  limit: number,
): InventorySyncAction[] {
  return plan.actions
    .filter((action) => isInventorySyncWriteAction(action.report.action))
    .sort((a, b) => {
      const priority =
        (WRITE_ACTION_PRIORITY.get(a.report.action) ?? 0) -
        (WRITE_ACTION_PRIORITY.get(b.report.action) ?? 0);

      return priority !== 0 ? priority : byOfferId(a, b);
    })
    .slice(0, Math.max(limit, 0));
}

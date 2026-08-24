/**
 * Automatic Google Merchant inventory reconciliation — the I/O side.
 *
 * SERVER ONLY. Never import from a client component.
 *
 * `previewMerchantInventorySync()` is STRICTLY READ-ONLY: local SELECTs plus a
 * single Google `products.list` GET.
 *
 * `reconcileMerchantInventory()` is the unattended worker. It writes ONLY to
 * Google and NEVER to the database — Neon is authoritative, and a reconciler
 * that could edit inventory would be able to corrupt the very state it is
 * supposed to follow. Every run recomputes the desired state from current Neon
 * data, so the worker is fully idempotent and stateless: no queue, no cursor,
 * no persisted job state. A missed run costs latency, never correctness.
 *
 * CHECKOUT NEVER DEPENDS ON THIS. Nothing in the reservation, Razorpay callback
 * or paid-order path calls Merchant Center. Google being slow or down delays an
 * availability change and nothing else.
 *
 * ORDER OF WORK, deliberately safety-first:
 *   1. DELETE_SOLD       — a sold saree must stop being advertised
 *   2. SET_OUT_OF_STOCK  — a held saree must stop being advertised
 *   3. SET_IN_STOCK      — a freed saree may be advertised again
 *   4. INSERT            — a new saree may be added
 * A run that hits its write ceiling has therefore done the protective work
 * first, and the additive work waits for the next minute.
 */

import { runMerchantCatalogueAudit } from "@/lib/google-merchant/audit-catalogue";
import { getGoogleMerchantAccessToken } from "@/lib/google-merchant/auth";
import {
  GoogleMerchantError,
  assertServerRuntime,
  getGoogleMerchantConfig,
  getGoogleMerchantDataSourceName,
} from "@/lib/google-merchant/config";
import { deleteGoogleMerchantProductInput } from "@/lib/google-merchant/delete-product-input";
import { listGoogleMerchantProducts } from "@/lib/google-merchant/google-catalogue";
import {
  INVENTORY_SYNC_ACTIONS,
  planInventoryReconciliation,
  selectInventoryWrites,
} from "@/lib/google-merchant/inventory-reconciliation";
import type {
  InventorySyncAction,
  InventorySyncActionType,
  InventorySyncPlan,
} from "@/lib/google-merchant/inventory-reconciliation";
import { patchGoogleMerchantProductAvailability } from "@/lib/google-merchant/patch-product-availability";
import { upsertGoogleMerchantProductInput } from "@/lib/google-merchant/upsert-product-input";
import { createLogger } from "@/lib/log";

const log = createLogger("google-merchant:reconcile-inventory");

/**
 * Hard ceiling on Merchant writes per run.
 *
 * The catalogue is ~62 products and a steady state needs ZERO writes, so ten is
 * generous for real inventory movement (a checkout touches one saree) while
 * bounding the blast radius of a bad plan: a bug that wanted to rewrite the
 * whole catalogue can do at most ten writes a minute, and an operator has a
 * minute to notice and flip the kill switch. It also bounds wall-clock — ten
 * sequential Merchant calls sit comfortably inside a cron invocation.
 */
export const MAX_INVENTORY_SYNC_WRITES = 10;

/**
 * Upstream failures that will fail identically for every remaining write.
 *
 * A broken credential, a revoked permission or a rate limit is not
 * product-specific, so continuing would just burn the budget and hammer Google.
 * Anything else is treated as product-specific: the run records it and carries
 * on, so one bad saree cannot block a sold saree's deletion.
 */
const RUN_STOPPING_CODES = new Set([
  "GOOGLE_UNAUTHENTICATED",
  "GOOGLE_PERMISSION_DENIED",
  "GOOGLE_RATE_LIMITED",
  "GOOGLE_UNAVAILABLE",
]);

export type InventorySyncFailure = {
  productId: string;
  action: InventorySyncActionType;
  code: string;
};

export type InventorySyncRunResult = {
  /** False when the kill switch is off — the plan is computed, nothing written. */
  enabled: boolean;
  checked: number;
  writesAttempted: number;
  succeeded: number;
  failed: number;
  /** Planned writes this run did NOT get to (ceiling, or an early stop). */
  remaining: number;
  /** Count per action across the whole plan, not just the executed slice. */
  byAction: Record<InventorySyncActionType, number>;
  /** Sanitised per-failure detail: our product id, our action, our error code. */
  failures: InventorySyncFailure[];
  /** True when the run stopped early on a credential/rate-limit failure. */
  stoppedEarly: boolean;
};

/**
 * Resolve the local desired state, the current Google state and the plan.
 *
 * ONE audit (which itself is bounded: one products query, one product-types
 * query, one batched reservations query) and ONE `products.list`, with a single
 * access token minted for the whole run and reused by every write.
 *
 * The audit already resolves the EFFECTIVE stock status — deriving it from
 * quantity plus batched active reservations when inventory v2 is on, and from
 * the `stockStatus` column when it is off — so this module never re-derives
 * inventory itself.
 */
async function computeInventoryPlan(): Promise<{
  accessToken: string;
  plan: InventorySyncPlan;
}> {
  const config = getGoogleMerchantConfig();
  const dataSourceName = getGoogleMerchantDataSourceName(config);

  const audit = await runMerchantCatalogueAudit();

  const accessToken = await getGoogleMerchantAccessToken();
  const googleProducts = await listGoogleMerchantProducts(
    config.accountId,
    accessToken,
  );

  return {
    accessToken,
    plan: planInventoryReconciliation(
      audit.audits,
      googleProducts,
      dataSourceName,
    ),
  };
}

/** Read-only preview of what the worker would do. Writes nothing, anywhere. */
export async function previewMerchantInventorySync(): Promise<InventorySyncPlan> {
  assertServerRuntime();

  const { plan } = await computeInventoryPlan();

  return plan;
}

/**
 * Execute ONE write.
 *
 * Each action maps to exactly one shared primitive — no bespoke HTTP, no
 * rebuilt payloads. INSERT submits the ProductInput the readiness audit already
 * produced, so attributes are never re-inferred here.
 */
async function executeWrite(
  action: InventorySyncAction,
  accessToken: string,
): Promise<void> {
  const { offerId } = action.report;

  switch (action.report.action) {
    case "DELETE_SOLD":
      await deleteSoldOffer(offerId, accessToken);
      return;
    case "SET_OUT_OF_STOCK":
      await patchGoogleMerchantProductAvailability(offerId, "OUT_OF_STOCK", {
        accessToken,
      });
      return;
    case "SET_IN_STOCK":
      await patchGoogleMerchantProductAvailability(offerId, "IN_STOCK", {
        accessToken,
      });
      return;
    case "INSERT": {
      if (!action.productInput) {
        // The planner never emits INSERT without one; belt and braces.
        throw new GoogleMerchantError(
          "MERCHANT_PRODUCT_DATA_INCOMPLETE",
          "The planned insert carried no ProductInput.",
          500,
        );
      }

      await upsertGoogleMerchantProductInput(action.productInput, {
        accessToken,
      });
      return;
    }
    default:
      // Not reachable: only write actions are selected for execution.
      return;
  }
}

/**
 * Delete a sold saree's ProductInput, treating "already gone" as convergence.
 *
 * Google's processed `products.list` lags behind `productInputs.delete`, so a
 * later run can still see the processed Product after the input is already
 * removed and will plan DELETE_SOLD again. That repeat delete answers 404,
 * which is the desired end state — the offer is gone — not a failure. Turning
 * it into one would leave the worker permanently "failing" for every sold
 * saree until Google caught up.
 *
 * This leniency is scoped to the AUTOMATIC sold path only. The delete primitive
 * and the manual, admin-triggered unsupported-product endpoint are untouched:
 * there a 404 still surfaces, because a human asked about a specific offer and
 * deserves to know it was not there.
 */
async function deleteSoldOffer(
  offerId: string,
  accessToken: string,
): Promise<void> {
  try {
    await deleteGoogleMerchantProductInput(offerId, { accessToken });
  } catch (error) {
    if (
      error instanceof GoogleMerchantError &&
      error.upstreamStatus === 404
    ) {
      log.info("Sold offer already absent upstream", { offerId });
      return;
    }

    throw error;
  }
}

/**
 * Reconcile Merchant inventory against current Neon state.
 *
 * @param options.enabled the kill switch. When false the plan is still computed
 *   (so the cron response stays informative) but NOT ONE write is issued.
 * @param options.limit 1..MAX_INVENTORY_SYNC_WRITES.
 */
export async function reconcileMerchantInventory(
  options: { enabled: boolean; limit?: number } = { enabled: false },
): Promise<InventorySyncRunResult> {
  assertServerRuntime();

  const limit = Math.min(
    Math.max(options.limit ?? MAX_INVENTORY_SYNC_WRITES, 0),
    MAX_INVENTORY_SYNC_WRITES,
  );

  const { accessToken, plan } = await computeInventoryPlan();

  const base = {
    byAction: plan.summary.byAction,
    checked: plan.summary.checked,
  };

  if (!options.enabled) {
    log.info("Inventory reconciliation skipped — switch off", {
      pendingWrites: plan.summary.pendingWrites,
    });

    return {
      ...base,
      enabled: false,
      failed: 0,
      failures: [],
      remaining: plan.summary.pendingWrites,
      stoppedEarly: false,
      succeeded: 0,
      writesAttempted: 0,
    };
  }

  const batch = selectInventoryWrites(plan, limit);

  const failures: InventorySyncFailure[] = [];
  let attempted = 0;
  let succeeded = 0;
  let stoppedEarly = false;

  // Sequential by design: no Promise.all. Merchant writes are ordered by
  // safety, and a burst of concurrent writes would both lose that ordering and
  // multiply the damage of a bad plan.
  for (const action of batch) {
    attempted += 1;

    try {
      await executeWrite(action, accessToken);
      succeeded += 1;
    } catch (error) {
      const code =
        error instanceof GoogleMerchantError
          ? error.code
          : "GOOGLE_REQUEST_FAILED";

      failures.push({
        action: action.report.action,
        code,
        productId: action.report.productId,
      });

      // A credential or rate-limit failure will repeat for every remaining
      // write. Stop, and let the next run retry from fresh state.
      if (RUN_STOPPING_CODES.has(code)) {
        stoppedEarly = true;
        log.error("Inventory reconciliation stopped early", { code });
        break;
      }

      log.error("Inventory reconciliation write failed", {
        action: action.report.action,
        code,
      });
    }
  }

  log.info("Inventory reconciliation completed", {
    attempted,
    failed: failures.length,
    succeeded,
  });

  return {
    ...base,
    enabled: true,
    failed: failures.length,
    failures,
    // Everything planned that this run did not successfully complete — whether
    // it was beyond the ceiling, skipped by an early stop, or failed. The next
    // run recomputes and picks it up.
    remaining: Math.max(plan.summary.pendingWrites - succeeded, 0),
    stoppedEarly,
    succeeded,
    writesAttempted: attempted,
  };
}

/** Re-exported for the route layer's zero-filled response shape. */
export { INVENTORY_SYNC_ACTIONS };

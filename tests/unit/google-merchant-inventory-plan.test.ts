/**
 * Automatic Merchant inventory reconciliation — the PURE planner.
 *
 * What these tests prove:
 *   - The whole business state machine, one case per transition: AVAILABLE
 *     inserts or corrects, RESERVED hides but never inserts, SOLD deletes but
 *     never resurrects, and every ineligible or blocked state writes nothing.
 *   - Eligibility is INHERITED from the readiness audit, never re-derived: an
 *     UNSUPPORTED_PRODUCT_TYPE blouse is never inserted, never patched and
 *     never automatically deleted, present or absent.
 *   - No product data is ever invented: an INSERT carries the audit's own
 *     ProductInput, and a blocked product is never inserted to "fix" it.
 *   - Ownership and identity fail closed: another data source is invisible, and
 *     a duplicate offer, a wrong contentLanguage or a wrong feedLabel is a
 *     CONFLICT that writes nothing.
 *   - Write selection is safety-first — DELETE_SOLD, SET_OUT_OF_STOCK,
 *     SET_IN_STOCK, INSERT — and deterministic within each action.
 */

import { describe, expect, it } from "vitest";

import type { MerchantProductAudit } from "@/lib/google-merchant/catalogue-readiness";
import {
  INVENTORY_SYNC_ACTIONS,
  isInventorySyncWriteAction,
  planInventoryReconciliation,
  selectInventoryWrites,
} from "@/lib/google-merchant/inventory-reconciliation";
import type { InventorySyncActionType } from "@/lib/google-merchant/inventory-reconciliation";
import type { GoogleMerchantProductSummary } from "@/lib/google-merchant/google-catalogue";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/10696807524`;
const OTHER_DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/99999999`;

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const mkProductInput = (offerId: string): MerchantProductInput =>
  ({
    contentLanguage: "en",
    feedLabel: "IN",
    offerId,
    productAttributes: { availability: "IN_STOCK", title: `Saree ${offerId}` },
  }) as unknown as MerchantProductInput;

/**
 * An audit entry. Readiness already encodes the effective stock state — the
 * audit derives it from quantity plus batched reservations under inventory v2 —
 * so the planner never re-derives inventory itself.
 */
const mkAudit = (
  productId: string,
  merchantReadiness = "READY",
  overrides: {
    productInput?: MerchantProductInput | null;
    stockStatus?: string;
  } = {},
): MerchantProductAudit =>
  ({
    imageDiagnostics: {
      duplicateImages: 0,
      ignored: [],
      ignoredImages: 0,
      safeImages: 1,
      totalImages: 1,
    },
    productInput:
      overrides.productInput !== undefined
        ? overrides.productInput
        : merchantReadiness === "READY"
          ? mkProductInput(productId)
          : null,
    report: {
      images: { ignoredImages: 0, safeImages: 1, totalImages: 1 },
      merchantReadiness,
      missingFields: [],
      name: `Saree ${productId.slice(-2)}`,
      productId,
      reasons: [],
      slug: `saree-${productId.slice(-2)}`,
      status: "published",
      stockStatus:
        overrides.stockStatus ??
        (merchantReadiness === "SOLD"
          ? "sold"
          : merchantReadiness === "RESERVED"
            ? "reserved"
            : "available"),
    },
  }) as MerchantProductAudit;

const mkGoogle = (
  offerId: string,
  overrides: Partial<GoogleMerchantProductSummary> = {},
): GoogleMerchantProductSummary => ({
  availability: "IN_STOCK",
  contentLanguage: "en",
  dataSource: DATA_SOURCE,
  destinationStatuses: [],
  feedLabel: "IN",
  itemLevelIssues: [],
  name: `accounts/${ACCOUNT_ID}/products/en~IN~${offerId}`,
  offerId,
  price: { amountMicros: "5299000000", currencyCode: "INR" },
  title: `Product ${offerId}`,
  ...overrides,
});

const planOne = (
  audit: MerchantProductAudit,
  googleProducts: GoogleMerchantProductSummary[] = [],
) => planInventoryReconciliation([audit], googleProducts, DATA_SOURCE).actions[0];

/** Every action that would issue a write, across a whole plan. */
const writesIn = (plan: { actions: Array<{ report: { action: InventorySyncActionType } }> }) =>
  plan.actions.filter((action) => isInventorySyncWriteAction(action.report.action));

// ---------------------------------------------------------------------------
// AVAILABLE
// ---------------------------------------------------------------------------

describe("planInventoryReconciliation — AVAILABLE", () => {
  it("NOOPs a READY saree Google already has IN_STOCK", () => {
    const action = planOne(mkAudit(uuid(1)), [mkGoogle(uuid(1))]);

    expect(action.report.action).toBe("NOOP");
    expect(action.report.reason).toBe("ALREADY_IN_STOCK");
    expect(action.productInput).toBeNull();
  });

  it("SET_IN_STOCKs a READY saree Google has OUT_OF_STOCK", () => {
    const action = planOne(mkAudit(uuid(1)), [
      mkGoogle(uuid(1), { availability: "OUT_OF_STOCK" }),
    ]);

    expect(action.report.action).toBe("SET_IN_STOCK");
    expect(action.report.reason).toBe("AVAILABLE_STALE_AVAILABILITY");
    expect(action.report.googleAvailability).toBe("OUT_OF_STOCK");
    // A PATCH needs no ProductInput — only the offer id and the new value.
    expect(action.productInput).toBeNull();
  });

  it("SET_IN_STOCKs when Google reports an unknown or missing availability", () => {
    for (const availability of ["PREORDER", "BACKORDER", null]) {
      const action = planOne(mkAudit(uuid(1)), [
        mkGoogle(uuid(1), { availability }),
      ]);

      expect(action.report.action).toBe("SET_IN_STOCK");
    }
  });

  it("INSERTs a READY saree Google does not have, using the audit's ProductInput", () => {
    const audit = mkAudit(uuid(1));
    const action = planOne(audit, []);

    expect(action.report.action).toBe("INSERT");
    expect(action.report.reason).toBe("AVAILABLE_NOT_IN_MERCHANT");
    // Identity, not a rebuild: the very object the audit carried.
    expect(action.productInput).toBe(audit.productInput);
  });

  it("refuses to insert a READY product with no ProductInput rather than build one", () => {
    const action = planOne(mkAudit(uuid(1), "READY", { productInput: null }), []);

    expect(action.report.action).toBe("BLOCKED_LOCAL");
    expect(action.report.reason).toBe("READY_WITHOUT_PRODUCT_INPUT");
    expect(action.productInput).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// RESERVED
// ---------------------------------------------------------------------------

describe("planInventoryReconciliation — RESERVED", () => {
  it("SET_OUT_OF_STOCKs a reserved saree Google still shows IN_STOCK", () => {
    const action = planOne(mkAudit(uuid(1), "RESERVED"), [mkGoogle(uuid(1))]);

    expect(action.report.action).toBe("SET_OUT_OF_STOCK");
    expect(action.report.reason).toBe("RESERVED_STALE_AVAILABILITY");
    expect(action.report.localStockStatus).toBe("reserved");
  });

  it("NOOPs a reserved saree already OUT_OF_STOCK", () => {
    const action = planOne(mkAudit(uuid(1), "RESERVED"), [
      mkGoogle(uuid(1), { availability: "OUT_OF_STOCK" }),
    ]);

    expect(action.report.action).toBe("NOOP");
    expect(action.report.reason).toBe("ALREADY_OUT_OF_STOCK");
  });

  it("NEVER inserts a reserved saree that is absent from Merchant", () => {
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(1), "RESERVED")],
      [],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("NOOP");
    expect(plan.actions[0].report.reason).toBe("RESERVED_NOT_IN_MERCHANT");
    expect(plan.summary.pendingWrites).toBe(0);
    expect(writesIn(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// SOLD
// ---------------------------------------------------------------------------

describe("planInventoryReconciliation — SOLD", () => {
  it("DELETE_SOLDs a sold saree still present in Merchant", () => {
    const action = planOne(mkAudit(uuid(1), "SOLD"), [mkGoogle(uuid(1))]);

    expect(action.report.action).toBe("DELETE_SOLD");
    expect(action.report.reason).toBe("SOLD_PRESENT_IN_MERCHANT");
    expect(action.productInput).toBeNull();
  });

  it("deletes a sold saree regardless of the availability Google reports", () => {
    for (const availability of ["IN_STOCK", "OUT_OF_STOCK", null]) {
      const action = planOne(mkAudit(uuid(1), "SOLD"), [
        mkGoogle(uuid(1), { availability }),
      ]);

      expect(action.report.action).toBe("DELETE_SOLD");
    }
  });

  it("NOOPs a sold saree already absent — no write, no resurrection", () => {
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(1), "SOLD")],
      [],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("NOOP");
    expect(plan.actions[0].report.reason).toBe("SOLD_NOT_IN_MERCHANT");
    expect(writesIn(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Ineligible and blocked states
// ---------------------------------------------------------------------------

describe("planInventoryReconciliation — ineligible product types", () => {
  it("writes nothing for a blouse that is absent", () => {
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(1), "UNSUPPORTED_PRODUCT_TYPE")],
      [],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("NOOP");
    expect(plan.actions[0].report.reason).toBe(
      "UNSUPPORTED_PRODUCT_TYPE_ABSENT",
    );
    expect(writesIn(plan)).toEqual([]);
  });

  it("reports but never mutates a blouse that is present", () => {
    // Explicitly NOT DELETE_SOLD: broadening automatic deletion to ineligible
    // types is out of scope, and the manual endpoint remains the only way.
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(1), "UNSUPPORTED_PRODUCT_TYPE")],
      [mkGoogle(uuid(1))],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("BLOCKED_LOCAL");
    expect(plan.actions[0].report.reason).toBe(
      "UNSUPPORTED_PRODUCT_TYPE_PRESENT",
    );
    expect(plan.summary.unsupportedPresent).toBe(1);
    expect(writesIn(plan)).toEqual([]);
  });

  it("keeps all nine production blouses out of every write", () => {
    const plan = planInventoryReconciliation(
      Array.from({ length: 9 }, (_, index) =>
        mkAudit(uuid(100 + index), "UNSUPPORTED_PRODUCT_TYPE"),
      ),
      [mkGoogle(uuid(100))],
      DATA_SOURCE,
    );

    expect(plan.summary.pendingWrites).toBe(0);
    expect(selectInventoryWrites(plan, 10)).toEqual([]);
  });
});

describe("planInventoryReconciliation — other blocked states", () => {
  const blockedStates = [
    "NO_MERCHANT_SAFE_IMAGE",
    "MISSING_REQUIRED_ATTRIBUTES",
    "NO_VALID_IMAGE",
    "INVALID_PRICE",
    "INVALID_LANDING_PAGE",
    "NOT_PUBLISHED",
    "EXCLUDED_TEST_PRODUCT",
    "MAPPING_ERROR",
  ];

  for (const state of blockedStates) {
    it(`never inserts a ${state} product`, () => {
      const plan = planInventoryReconciliation(
        [mkAudit(uuid(1), state)],
        [],
        DATA_SOURCE,
      );

      expect(plan.actions[0].report.action).toBe("BLOCKED_LOCAL");
      expect(plan.actions[0].report.reason).toBe("NOT_READY_ABSENT");
      expect(plan.actions[0].productInput).toBeNull();
      expect(writesIn(plan)).toEqual([]);
    });

    it(`invents no rule for a ${state} product that is present`, () => {
      const plan = planInventoryReconciliation(
        [mkAudit(uuid(1), state)],
        [mkGoogle(uuid(1))],
        DATA_SOURCE,
      );

      expect(plan.actions[0].report.action).toBe("BLOCKED_LOCAL");
      expect(plan.actions[0].report.reason).toBe("NOT_READY_PRESENT");
      expect(writesIn(plan)).toEqual([]);
    });
  }

  it("leaves the two image-blocked production sarees alone", () => {
    const plan = planInventoryReconciliation(
      [
        mkAudit(uuid(300), "NO_MERCHANT_SAFE_IMAGE"),
        mkAudit(uuid(301), "NO_MERCHANT_SAFE_IMAGE"),
      ],
      [],
      DATA_SOURCE,
    );

    expect(plan.summary.pendingWrites).toBe(0);
    expect(plan.summary.byAction.BLOCKED_LOCAL).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Ownership and identity
// ---------------------------------------------------------------------------

describe("planInventoryReconciliation — ownership and identity", () => {
  it("ignores an identical offer in another data source", () => {
    // Invisible: the READY saree is treated as absent and inserted into OURS,
    // and the foreign offer is never patched or deleted.
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(1))],
      [mkGoogle(uuid(1), { dataSource: OTHER_DATA_SOURCE })],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("INSERT");
    expect(plan.actions[0].report.presentInMerchant).toBe(false);
    expect(plan.summary.googleManaged).toBe(0);
  });

  it("never deletes a sold saree that only exists in another data source", () => {
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(1), "SOLD")],
      [mkGoogle(uuid(1), { dataSource: OTHER_DATA_SOURCE })],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("NOOP");
    expect(writesIn(plan)).toEqual([]);
  });

  const conflicts: Array<{
    label: string;
    google: GoogleMerchantProductSummary[];
    reason: string;
  }> = [
    {
      google: [mkGoogle(uuid(1)), mkGoogle(uuid(1))],
      label: "a duplicate offer id",
      reason: "DUPLICATE_OFFER_ID",
    },
    {
      google: [mkGoogle(uuid(1), { contentLanguage: "hi" })],
      label: "an unexpected content language",
      reason: "UNEXPECTED_CONTENT_LANGUAGE",
    },
    {
      google: [mkGoogle(uuid(1), { feedLabel: "US" })],
      label: "an unexpected feed label",
      reason: "UNEXPECTED_FEED_LABEL",
    },
  ];

  for (const { google, label, reason } of conflicts) {
    it(`fails closed on ${label}`, () => {
      for (const readiness of ["READY", "RESERVED", "SOLD"]) {
        const plan = planInventoryReconciliation(
          [mkAudit(uuid(1), readiness)],
          google,
          DATA_SOURCE,
        );

        expect(plan.actions[0].report.action).toBe("CONFLICT");
        expect(plan.actions[0].report.reason).toBe(reason);
        expect(plan.actions[0].productInput).toBeNull();
        expect(writesIn(plan)).toEqual([]);
      }
    });
  }

  it("reports an orphaned offer without acting on it", () => {
    const plan = planInventoryReconciliation([], [mkGoogle(uuid(9))], DATA_SOURCE);

    expect(plan.actions[0].report.action).toBe("NOOP");
    expect(plan.actions[0].report.reason).toBe("NO_LOCAL_PRODUCT");
    expect(plan.summary.orphanedOffers).toBe(1);
    expect(writesIn(plan)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Write selection
// ---------------------------------------------------------------------------

describe("selectInventoryWrites", () => {
  /** One of every write action, deliberately in the WRONG order by offerId. */
  const mixedPlan = () =>
    planInventoryReconciliation(
      [
        mkAudit(uuid(1)), // INSERT       (absent)
        mkAudit(uuid(2), "RESERVED"), // SET_OUT_OF_STOCK
        mkAudit(uuid(3)), // SET_IN_STOCK (present, OUT_OF_STOCK)
        mkAudit(uuid(4), "SOLD"), // DELETE_SOLD
        mkAudit(uuid(5)), // NOOP
      ],
      [
        mkGoogle(uuid(2)),
        mkGoogle(uuid(3), { availability: "OUT_OF_STOCK" }),
        mkGoogle(uuid(4)),
        mkGoogle(uuid(5)),
      ],
      DATA_SOURCE,
    );

  it("orders writes safety-first, not by offer id", () => {
    const actions = selectInventoryWrites(mixedPlan(), 10).map(
      (action) => action.report.action,
    );

    expect(actions).toEqual([
      "DELETE_SOLD",
      "SET_OUT_OF_STOCK",
      "SET_IN_STOCK",
      "INSERT",
    ]);
  });

  it("does the protective work first when the ceiling bites", () => {
    const actions = selectInventoryWrites(mixedPlan(), 2).map(
      (action) => action.report.action,
    );

    expect(actions).toEqual(["DELETE_SOLD", "SET_OUT_OF_STOCK"]);
  });

  it("is deterministic within one action type", () => {
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(30)), mkAudit(uuid(10)), mkAudit(uuid(20))],
      [],
      DATA_SOURCE,
    );

    const first = selectInventoryWrites(plan, 10).map((a) => a.report.offerId);
    const second = selectInventoryWrites(plan, 10).map((a) => a.report.offerId);

    expect(first).toEqual([uuid(10), uuid(20), uuid(30)]);
    expect(second).toEqual(first);
  });

  it("never selects NOOP, BLOCKED_LOCAL or CONFLICT", () => {
    const plan = planInventoryReconciliation(
      [
        mkAudit(uuid(1), "UNSUPPORTED_PRODUCT_TYPE"),
        mkAudit(uuid(2), "NO_MERCHANT_SAFE_IMAGE"),
        mkAudit(uuid(3), "SOLD"),
        mkAudit(uuid(4)),
      ],
      [mkGoogle(uuid(1)), mkGoogle(uuid(4)), mkGoogle(uuid(4))],
      DATA_SOURCE,
    );

    const actions = selectInventoryWrites(plan, 10).map((a) => a.report.action);

    expect(actions).toEqual([]);
    expect(plan.summary.byAction.CONFLICT).toBe(1);
    expect(plan.summary.byAction.BLOCKED_LOCAL).toBe(2);
  });

  it("returns nothing for a zero or negative limit", () => {
    expect(selectInventoryWrites(mixedPlan(), 0)).toEqual([]);
    expect(selectInventoryWrites(mixedPlan(), -5)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Summary and steady state
// ---------------------------------------------------------------------------

describe("planInventoryReconciliation — summary", () => {
  it("needs ZERO writes in the settled production shape", () => {
    // 46 READY sarees already in Merchant and IN_STOCK, 9 blouses absent,
    // 4 sold sarees absent, 1 reserved absent, 2 image-blocked absent.
    const audits = [
      ...Array.from({ length: 46 }, (_, i) => mkAudit(uuid(i + 1))),
      ...Array.from({ length: 9 }, (_, i) =>
        mkAudit(uuid(100 + i), "UNSUPPORTED_PRODUCT_TYPE"),
      ),
      ...Array.from({ length: 4 }, (_, i) => mkAudit(uuid(200 + i), "SOLD")),
      mkAudit(uuid(250), "RESERVED"),
      ...Array.from({ length: 2 }, (_, i) =>
        mkAudit(uuid(300 + i), "NO_MERCHANT_SAFE_IMAGE"),
      ),
    ];

    const plan = planInventoryReconciliation(
      audits,
      Array.from({ length: 46 }, (_, i) => mkGoogle(uuid(i + 1))),
      DATA_SOURCE,
    );

    expect(plan.summary.checked).toBe(62);
    expect(plan.summary.googleManaged).toBe(46);
    expect(plan.summary.pendingWrites).toBe(0);
    expect(plan.summary.byAction.NOOP).toBe(60);
    expect(plan.summary.byAction.BLOCKED_LOCAL).toBe(2);
  });

  it("plans exactly one write when one saree is reserved at checkout", () => {
    const audits = [
      ...Array.from({ length: 45 }, (_, i) => mkAudit(uuid(i + 1))),
      mkAudit(uuid(46), "RESERVED"),
    ];

    const plan = planInventoryReconciliation(
      audits,
      Array.from({ length: 46 }, (_, i) => mkGoogle(uuid(i + 1))),
      DATA_SOURCE,
    );

    expect(plan.summary.pendingWrites).toBe(1);
    expect(selectInventoryWrites(plan, 10)).toHaveLength(1);
    expect(selectInventoryWrites(plan, 10)[0].report.action).toBe(
      "SET_OUT_OF_STOCK",
    );
  });

  it("zero-fills every action in declaration order", () => {
    const plan = planInventoryReconciliation([], [], DATA_SOURCE);

    expect(Object.keys(plan.summary.byAction)).toEqual([
      ...INVENTORY_SYNC_ACTIONS,
    ]);
    expect(plan.summary).toEqual({
      byAction: expect.any(Object),
      checked: 0,
      googleManaged: 0,
      orphanedOffers: 0,
      pendingWrites: 0,
      unsupportedPresent: 0,
    });
  });

  it("is stable across repeated runs over the same input", () => {
    const audits = [mkAudit(uuid(1)), mkAudit(uuid(2), "SOLD")];
    const google = [mkGoogle(uuid(2))];

    const first = planInventoryReconciliation(audits, google, DATA_SOURCE);
    const second = planInventoryReconciliation(audits, google, DATA_SOURCE);

    expect(JSON.stringify(second.actions.map((a) => a.report))).toBe(
      JSON.stringify(first.actions.map((a) => a.report)),
    );
  });

  it("leaks no ProductInput, price or image into any report", () => {
    const plan = planInventoryReconciliation(
      [mkAudit(uuid(1)), mkAudit(uuid(2), "SOLD")],
      [mkGoogle(uuid(2))],
      DATA_SOURCE,
    );

    const serialised = JSON.stringify(plan.actions.map((a) => a.report));

    for (const leak of [
      "productAttributes",
      "amountMicros",
      "imageLink",
      "5299000000",
      "accounts/",
    ]) {
      expect(serialised).not.toContain(leak);
    }
  });
});

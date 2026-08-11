/**
 * Phase 2B.1 — reconciliation planner + Google state parsing (pure).
 *
 * What these tests prove:
 *   - The desired state is the Phase 2A audit: an INSERT action carries the
 *     ProductInput the audit already built, never a rebuilt one.
 *   - Matching is by offerId (the local UUID), never by slug.
 *   - Only products in OUR data source participate; "Found by Google" and
 *     supplemental sources are invisible.
 *   - A duplicate offerId, an unexpected contentLanguage and an unexpected
 *     feedLabel each fail closed as CONFLICT, and are never inserted.
 *   - A managed offer with no READY local product is a DELETE_CANDIDATE and
 *     nothing is ever deleted here.
 *   - Batch selection takes only INSERT actions, in deterministic offerId
 *     order, so the already-approved Tangerine offer is never re-submitted.
 *   - products.list is paginated, and an unreadable page fails closed.
 */

import { describe, expect, it } from "vitest";

import type { MerchantProductAudit } from "@/lib/google-merchant/catalogue-readiness";
import {
  buildMerchantStatusReports,
  classifyMerchantProductStatus,
  planCatalogueSync,
  selectInsertBatch,
} from "@/lib/google-merchant/catalogue-sync";
import {
  isManagedByDataSource,
  parseGoogleProduct,
} from "@/lib/google-merchant/google-catalogue";
import type { GoogleMerchantProductSummary } from "@/lib/google-merchant/google-catalogue";
import type { MerchantProductInput } from "@/lib/google-merchant/product-input";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ACCOUNT_ID = "5833526164";
const DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/10696807524`;
const OTHER_DATA_SOURCE = `accounts/${ACCOUNT_ID}/dataSources/99999999`;
const TANGERINE_ID = "6747c35c-682b-4387-a710-b165249470a2";

const mkProductInput = (offerId: string): MerchantProductInput =>
  ({
    contentLanguage: "en",
    feedLabel: "IN",
    offerId,
    productAttributes: {
      availability: "IN_STOCK",
      title: `Product ${offerId}`,
    },
  }) as unknown as MerchantProductInput;

const mkAudit = (
  productId: string,
  overrides: Partial<MerchantProductAudit["report"]> = {},
): MerchantProductAudit => {
  const readiness = overrides.merchantReadiness ?? "READY";

  return {
    productInput: readiness === "READY" ? mkProductInput(productId) : null,
    report: {
      merchantReadiness: readiness,
      missingFields: [],
      name: `Saree ${productId.slice(0, 4)}`,
      productId,
      reasons: [],
      slug: `saree-${productId.slice(0, 4)}`,
      status: "published",
      stockStatus: "available",
      ...overrides,
    },
  } as MerchantProductAudit;
};

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

const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// ---------------------------------------------------------------------------
// Planner — bootstrap shape
// ---------------------------------------------------------------------------

describe("planCatalogueSync — bootstrap", () => {
  /** 58 READY products, one of which (Tangerine) is already in Google. */
  const productionShape = () => {
    const audits = [
      mkAudit(TANGERINE_ID),
      ...Array.from({ length: 57 }, (_, index) => mkAudit(uuid(index + 1))),
      ...Array.from({ length: 4 }, (_, index) =>
        mkAudit(uuid(900 + index), { merchantReadiness: "SOLD" }),
      ),
    ];

    return planCatalogueSync(audits, [mkGoogle(TANGERINE_ID)], DATA_SOURCE);
  };

  it("plans 57 inserts and 1 already-present from 58 READY / 1 in Google", () => {
    const { summary } = productionShape();

    expect(summary).toEqual({
      alreadyPresent: 1,
      conflicts: 0,
      deleteCandidates: 0,
      googleManaged: 1,
      insert: 57,
      localPublished: 62,
      localReady: 58,
      update: 0,
    });
  });

  it("reports the approved Tangerine product as ALREADY_PRESENT", () => {
    const action = productionShape().actions.find(
      (entry) => entry.report.offerId === TANGERINE_ID,
    );

    expect(action?.report.action).toBe("ALREADY_PRESENT");
    expect(action?.productInput).toBeNull();
  });

  it("reports blocked local products as BLOCKED_LOCAL with their state", () => {
    const blocked = productionShape().actions.filter(
      (entry) => entry.report.action === "BLOCKED_LOCAL",
    );

    expect(blocked).toHaveLength(4);
    expect(blocked[0].report.reason).toBe("SOLD");
    expect(blocked[0].productInput).toBeNull();
  });

  it("carries the audit's ProductInput on every INSERT", () => {
    const inserts = productionShape().actions.filter(
      (entry) => entry.report.action === "INSERT",
    );

    expect(inserts).toHaveLength(57);
    for (const insert of inserts) {
      expect(insert.productInput?.offerId).toBe(insert.report.offerId);
      expect(insert.productInput?.contentLanguage).toBe("en");
      expect(insert.productInput?.feedLabel).toBe("IN");
    }
  });

  it("uses the same object the audit built — no rebuild", () => {
    const audit = mkAudit(uuid(1));
    const plan = planCatalogueSync([audit], [], DATA_SOURCE);

    expect(plan.actions[0].productInput).toBe(audit.productInput);
  });

  it("matches by offerId, not slug", () => {
    const audit = mkAudit(uuid(1), { slug: "renamed-saree" });
    const google = mkGoogle(uuid(1), { title: "Different title" });

    const plan = planCatalogueSync([audit], [google], DATA_SOURCE);

    expect(plan.actions[0].report.action).toBe("ALREADY_PRESENT");
  });

  it("orders actions deterministically by offerId", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(3)), mkAudit(uuid(1)), mkAudit(uuid(2))],
      [],
      DATA_SOURCE,
    );

    expect(plan.actions.map((entry) => entry.report.offerId)).toEqual([
      uuid(1),
      uuid(2),
      uuid(3),
    ]);
  });
});

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

describe("planCatalogueSync — data source ownership", () => {
  it("ignores products from another data source", () => {
    const audit = mkAudit(uuid(1));
    const foreign = mkGoogle(uuid(1), { dataSource: OTHER_DATA_SOURCE });

    const plan = planCatalogueSync([audit], [foreign], DATA_SOURCE);

    expect(plan.summary.googleManaged).toBe(0);
    expect(plan.actions[0].report.action).toBe("INSERT");
  });

  it("ignores Found-by-Google entries", () => {
    const foundByGoogle = mkGoogle(uuid(1), {
      dataSource: `accounts/${ACCOUNT_ID}/dataSources/1111111`,
    });

    const plan = planCatalogueSync([mkAudit(uuid(1))], [foundByGoogle], DATA_SOURCE);

    expect(plan.summary.insert).toBe(1);
    expect(plan.summary.deleteCandidates).toBe(0);
  });

  it("isManagedByDataSource compares the full resource name", () => {
    expect(isManagedByDataSource(mkGoogle("a"), DATA_SOURCE)).toBe(true);
    expect(isManagedByDataSource(mkGoogle("a"), OTHER_DATA_SOURCE)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Conflicts
// ---------------------------------------------------------------------------

describe("planCatalogueSync — conflicts fail closed", () => {
  it("flags a duplicate offerId in our data source", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(1))],
      [mkGoogle(uuid(1)), mkGoogle(uuid(1))],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("CONFLICT");
    expect(plan.actions[0].report.reason).toBe("DUPLICATE_OFFER_ID");
    expect(plan.actions[0].productInput).toBeNull();
    expect(plan.summary.conflicts).toBe(1);
    expect(plan.summary.insert).toBe(0);
  });

  it("flags an unexpected contentLanguage", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(1))],
      [mkGoogle(uuid(1), { contentLanguage: "hi" })],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("CONFLICT");
    expect(plan.actions[0].report.reason).toBe("UNEXPECTED_CONTENT_LANGUAGE");
  });

  it("flags an unexpected feedLabel", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(1))],
      [mkGoogle(uuid(1), { feedLabel: "US" })],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("CONFLICT");
    expect(plan.actions[0].report.reason).toBe("UNEXPECTED_FEED_LABEL");
  });

  it("never offers a conflicted product for insertion", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(1)), mkAudit(uuid(2))],
      [mkGoogle(uuid(1), { feedLabel: "US" })],
      DATA_SOURCE,
    );

    const batch = selectInsertBatch(plan, 5);
    expect(batch.map((entry) => entry.report.offerId)).toEqual([uuid(2)]);
  });

  it("flags a duplicated orphan offer as a conflict, not a delete candidate", () => {
    const plan = planCatalogueSync(
      [],
      [mkGoogle(uuid(9)), mkGoogle(uuid(9))],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("CONFLICT");
    expect(plan.summary.deleteCandidates).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Delete candidates
// ---------------------------------------------------------------------------

describe("planCatalogueSync — delete candidates", () => {
  it("flags a managed offer whose local product is sold", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(1), { merchantReadiness: "SOLD" })],
      [mkGoogle(uuid(1))],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("DELETE_CANDIDATE");
    expect(plan.actions[0].report.reason).toBe("SOLD");
    expect(plan.summary.deleteCandidates).toBe(1);
  });

  it("flags a managed offer with no local product at all", () => {
    const plan = planCatalogueSync([], [mkGoogle(uuid(7))], DATA_SOURCE);

    expect(plan.actions[0].report).toMatchObject({
      action: "DELETE_CANDIDATE",
      offerId: uuid(7),
      productId: uuid(7),
      reason: "NO_LOCAL_PRODUCT",
      slug: null,
    });
  });

  it("flags a managed offer whose local product has NO_MERCHANT_SAFE_IMAGE", () => {
    // The expected pre-backfill state: Phase 2A.2 image safety fails closed on
    // null dimensions, so a currently-approved offer becomes a DELETE_CANDIDATE
    // until the metadata backfill runs. Nothing deletes it — Phase 2B.1 has no
    // delete path — and it must never be picked up by a write batch.
    const plan = planCatalogueSync(
      [mkAudit(TANGERINE_ID, { merchantReadiness: "NO_MERCHANT_SAFE_IMAGE" })],
      [mkGoogle(TANGERINE_ID)],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("DELETE_CANDIDATE");
    expect(plan.actions[0].report.reason).toBe("NO_MERCHANT_SAFE_IMAGE");
    expect(plan.actions[0].productInput).toBeNull();
    expect(plan.summary.deleteCandidates).toBe(1);
    expect(plan.summary.insert).toBe(0);
    expect(selectInsertBatch(plan, 5)).toEqual([]);
  });

  it("models the whole pre-backfill fleet: six managed offers, zero writes", () => {
    const offerIds = [TANGERINE_ID, ...Array.from({ length: 5 }, (_, i) => uuid(i + 1))];

    const plan = planCatalogueSync(
      offerIds.map((id) => mkAudit(id, { merchantReadiness: "NO_MERCHANT_SAFE_IMAGE" })),
      offerIds.map((id) => mkGoogle(id)),
      DATA_SOURCE,
    );

    expect(plan.summary).toMatchObject({
      alreadyPresent: 0,
      conflicts: 0,
      deleteCandidates: 6,
      googleManaged: 6,
      insert: 0,
      localReady: 0,
    });
    expect(selectInsertBatch(plan, 5)).toEqual([]);
  });

  it("returns those offers to ALREADY_PRESENT once readiness recovers", () => {
    const plan = planCatalogueSync(
      [mkAudit(TANGERINE_ID)],
      [mkGoogle(TANGERINE_ID)],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("ALREADY_PRESENT");
    expect(plan.summary.deleteCandidates).toBe(0);
  });

  it("flags an unpublished local product present in Google", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(1), { merchantReadiness: "NOT_PUBLISHED" })],
      [mkGoogle(uuid(1))],
      DATA_SOURCE,
    );

    expect(plan.actions[0].report.action).toBe("DELETE_CANDIDATE");
  });

  it("never selects a delete candidate for the batch", () => {
    const plan = planCatalogueSync(
      [mkAudit(uuid(1), { merchantReadiness: "SOLD" })],
      [mkGoogle(uuid(1)), mkGoogle(uuid(8))],
      DATA_SOURCE,
    );

    expect(selectInsertBatch(plan, 5)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Batch selection
// ---------------------------------------------------------------------------

describe("selectInsertBatch", () => {
  const plan = () =>
    planCatalogueSync(
      [
        mkAudit(TANGERINE_ID),
        ...Array.from({ length: 10 }, (_, index) => mkAudit(uuid(index + 1))),
      ],
      [mkGoogle(TANGERINE_ID)],
      DATA_SOURCE,
    );

  it("takes at most `limit` inserts", () => {
    expect(selectInsertBatch(plan(), 5)).toHaveLength(5);
    expect(selectInsertBatch(plan(), 1)).toHaveLength(1);
  });

  it("is deterministic across calls", () => {
    const first = selectInsertBatch(plan(), 5).map((a) => a.report.offerId);
    const second = selectInsertBatch(plan(), 5).map((a) => a.report.offerId);

    expect(second).toEqual(first);
    expect(first).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)]);
  });

  it("never includes the already-present Tangerine offer", () => {
    const offerIds = selectInsertBatch(plan(), 5).map(
      (entry) => entry.report.offerId,
    );

    expect(offerIds).not.toContain(TANGERINE_ID);
  });

  it("returns fewer than the limit when fewer are missing", () => {
    const small = planCatalogueSync([mkAudit(uuid(1))], [], DATA_SOURCE);

    expect(selectInsertBatch(small, 5)).toHaveLength(1);
  });

  it("resumes with the remaining products after a partial run", () => {
    const audits = Array.from({ length: 10 }, (_, i) => mkAudit(uuid(i + 1)));

    const firstBatch = selectInsertBatch(
      planCatalogueSync(audits, [], DATA_SOURCE),
      5,
    ).map((entry) => entry.report.offerId);

    // Google now holds the first five.
    const secondBatch = selectInsertBatch(
      planCatalogueSync(
        audits,
        firstBatch.map((offerId) => mkGoogle(offerId)),
        DATA_SOURCE,
      ),
      5,
    ).map((entry) => entry.report.offerId);

    expect(firstBatch).toEqual([uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)]);
    expect(secondBatch).toEqual([uuid(6), uuid(7), uuid(8), uuid(9), uuid(10)]);
  });
});

// ---------------------------------------------------------------------------
// Google product parsing
// ---------------------------------------------------------------------------

describe("parseGoogleProduct", () => {
  const raw = {
    contentLanguage: "en",
    dataSource: DATA_SOURCE,
    feedLabel: "IN",
    name: `accounts/${ACCOUNT_ID}/products/en~IN~${TANGERINE_ID}`,
    offerId: TANGERINE_ID,
    productAttributes: {
      availability: "IN_STOCK",
      price: { amountMicros: "5299000000", currencyCode: "INR" },
      title: "Tangerine Noir Floral Border Weave",
    },
    productStatus: {
      destinationStatuses: [
        {
          approvedCountries: ["IN"],
          disapprovedCountries: [],
          pendingCountries: [],
          reportingContext: "SHOPPING_ADS",
        },
      ],
      itemLevelIssues: [
        {
          applicableCountries: ["IN"],
          attribute: "size",
          code: "missing_size",
          description: "Add a size",
          reportingContext: "SHOPPING_ADS",
          severity: "DEMOTED",
        },
      ],
    },
    versionNumber: "7",
  };

  it("projects only the safe fields", () => {
    const parsed = parseGoogleProduct(raw);

    expect(Object.keys(parsed ?? {}).sort()).toEqual([
      "availability",
      "contentLanguage",
      "dataSource",
      "destinationStatuses",
      "feedLabel",
      "itemLevelIssues",
      "name",
      "offerId",
      "price",
      "title",
    ]);
    expect(JSON.stringify(parsed)).not.toContain("versionNumber");
  });

  it("parses price, destination statuses and issues", () => {
    const parsed = parseGoogleProduct(raw);

    expect(parsed?.price).toEqual({
      amountMicros: "5299000000",
      currencyCode: "INR",
    });
    expect(parsed?.destinationStatuses[0].approvedCountries).toEqual(["IN"]);
    expect(parsed?.itemLevelIssues[0]).toEqual({
      applicableCountries: ["IN"],
      attribute: "size",
      code: "missing_size",
      description: "Add a size",
      reportingContext: "SHOPPING_ADS",
      severity: "DEMOTED",
    });
  });

  const incomplete = [
    "name",
    "offerId",
    "contentLanguage",
    "feedLabel",
    "dataSource",
  ];

  for (const field of incomplete) {
    it(`returns null when ${field} is missing`, () => {
      const partial: Record<string, unknown> = { ...raw };
      delete partial[field];

      expect(parseGoogleProduct(partial)).toBeNull();
    });
  }

  it("returns null for a non-object", () => {
    expect(parseGoogleProduct("nope")).toBeNull();
    expect(parseGoogleProduct(null)).toBeNull();
  });

  it("tolerates a missing productStatus", () => {
    const parsed = parseGoogleProduct({ ...raw, productStatus: undefined });

    expect(parsed?.destinationStatuses).toEqual([]);
    expect(parsed?.itemLevelIssues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Status classification
// ---------------------------------------------------------------------------

describe("classifyMerchantProductStatus", () => {
  const withStatuses = (
    statuses: Array<Partial<GoogleMerchantProductSummary["destinationStatuses"][number]>>,
  ) =>
    mkGoogle(uuid(1), {
      destinationStatuses: statuses.map((status) => ({
        approvedCountries: [],
        disapprovedCountries: [],
        pendingCountries: [],
        reportingContext: "SHOPPING_ADS",
        ...status,
      })),
    });

  it("is UNKNOWN with no destination information", () => {
    expect(classifyMerchantProductStatus(withStatuses([]))).toBe("UNKNOWN");
  });

  it("is PENDING while Google is still processing", () => {
    expect(
      classifyMerchantProductStatus(withStatuses([{ pendingCountries: ["IN"] }])),
    ).toBe("PENDING");
  });

  it("is APPROVED when approved and nothing is pending", () => {
    expect(
      classifyMerchantProductStatus(withStatuses([{ approvedCountries: ["IN"] }])),
    ).toBe("APPROVED");
  });

  it("is LIMITED when approved somewhere and pending elsewhere", () => {
    expect(
      classifyMerchantProductStatus(
        withStatuses([
          { approvedCountries: ["IN"] },
          { pendingCountries: ["US"], reportingContext: "FREE_LISTINGS" },
        ]),
      ),
    ).toBe("LIMITED");
  });

  it("is DISAPPROVED when disapproved anywhere", () => {
    expect(
      classifyMerchantProductStatus(
        withStatuses([
          { approvedCountries: ["IN"] },
          { disapprovedCountries: ["IN"], reportingContext: "FREE_LISTINGS" },
        ]),
      ),
    ).toBe("DISAPPROVED");
  });

  it("is UNKNOWN when every country list is empty", () => {
    expect(classifyMerchantProductStatus(withStatuses([{}]))).toBe("UNKNOWN");
  });
});

describe("buildMerchantStatusReports", () => {
  it("includes only our data source, sorted by offerId", () => {
    const reports = buildMerchantStatusReports(
      [
        mkGoogle(uuid(2)),
        mkGoogle(uuid(9), { dataSource: OTHER_DATA_SOURCE }),
        mkGoogle(uuid(1)),
      ],
      DATA_SOURCE,
    );

    expect(reports.map((report) => report.offerId)).toEqual([uuid(1), uuid(2)]);
  });

  it("emits exactly the safe status keys", () => {
    const [report] = buildMerchantStatusReports([mkGoogle(uuid(1))], DATA_SOURCE);

    expect(Object.keys(report).sort()).toEqual([
      "availability",
      "destinationStatuses",
      "itemLevelIssues",
      "offerId",
      "price",
      "status",
      "title",
    ]);
  });

  it("preserves item-level issue metadata", () => {
    const [report] = buildMerchantStatusReports(
      [
        mkGoogle(uuid(1), {
          itemLevelIssues: [
            {
              applicableCountries: ["IN"],
              attribute: "image_link",
              code: "image_link_broken",
              description: "Image not crawlable",
              reportingContext: "SHOPPING_ADS",
              severity: "DISAPPROVED",
            },
          ],
        }),
      ],
      DATA_SOURCE,
    );

    expect(report.itemLevelIssues[0].code).toBe("image_link_broken");
    expect(report.itemLevelIssues[0].severity).toBe("DISAPPROVED");
  });
});

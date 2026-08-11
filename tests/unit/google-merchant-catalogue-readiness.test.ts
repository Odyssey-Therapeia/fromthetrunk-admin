/**
 * Phase 2A — catalogue readiness audit (pure).
 *
 * What these tests prove:
 *   - READY means the real ProductInput mapper accepted the product: the audit
 *     hands back the built input, so Phase 2B never re-derives anything and
 *     never parses report strings.
 *   - Every blocked state is reached through the MAPPER's own typed error, not
 *     through a second rule set — one missing attribute, one bad image, one bad
 *     price, one bad landing page each produce the matching state and reason.
 *   - Inventory v2 derives availability from quantity + batched reservation
 *     counts, and the derived state overrides a stale stockStatus column.
 *   - The excluded test product stays excluded.
 *   - Summaries are deterministic: fixed key order, zero-filled counts, and
 *     `ready + blocked === publishedProducts`.
 *   - Reports carry exactly the eight safe keys — no row, no metadata, no
 *     images, no credentials.
 */

import { describe, expect, it } from "vitest";

import type { ProductWithRelations } from "@/db/queries/products";
import {
  MERCHANT_AUDIT_CSV_HEADERS,
  MERCHANT_AUDIT_REASON_CODES,
  MERCHANT_READINESS_STATES,
  auditMerchantCatalogue,
  auditMerchantProduct,
  summariseMerchantAudit,
  toMerchantAuditCsv,
} from "@/lib/google-merchant/catalogue-readiness";
import type { MerchantInventoryContext } from "@/lib/google-merchant/catalogue-readiness";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-01T00:00:00.000Z");

/** Mirrors the approved Tangerine row's attribute shape (upper-case enums). */
const READY_ATTRIBUTES = {
  age_group: "ADULT",
  color: "Orange",
  fabric: "Chiffon",
  gender: "FEMALE",
  size: "OS",
};

const mkMedia = (url: string, id = "media-1") => ({
  alt: null,
  blurDataUrl: null,
  createdAt: NOW,
  filename: "img.jpg",
  filesize: 2_000_000,
  height: 1600,
  id,
  key: "media/img.jpg",
  metadata: null,
  mimeType: "image/jpeg",
  updatedAt: NOW,
  url,
  width: 1200,
});

let sequence = 0;

function mkProduct(
  overrides: Record<string, unknown> = {},
): ProductWithRelations {
  sequence += 1;

  return {
    artisanId: null,
    attributes: { ...READY_ATTRIBUTES },
    collection: null,
    collectionId: null,
    createdAt: NOW,
    detailsCondition: "Excellent condition",
    detailsDesigner: null,
    detailsFabric: "Chiffon",
    detailsLength: null,
    detailsWidth: null,
    featured: false,
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    images: [
      {
        media: mkMedia("https://blob.vercel-storage.com/img1.jpg"),
        sortOrder: 0,
      },
    ],
    metadata: { internalNote: "do not leak" },
    name: "Tangerine Noir Floral Border Weave",
    originalPricePaise: null,
    pricePaise: 529900,
    quantityAvailable: 1,
    reservedUntil: null,
    slug: `saree-${sequence}`,
    soldAt: null,
    status: "published",
    stockStatus: "available",
    storyEra: null,
    storyNarrative: "A tangerine chiffon with a noir floral border.",
    storyProvenance: null,
    storyTitle: "Tangerine Noir",
    tags: [],
    typeId: null,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProductWithRelations;
}

const legacyContext: MerchantInventoryContext = {
  activeReservationCounts: new Map(),
  inventoryV2: false,
};

const v2Context = (
  counts: Array<[string, number]> = [],
): MerchantInventoryContext => ({
  activeReservationCounts: new Map(counts),
  inventoryV2: true,
});

const auditOne = (overrides: Record<string, unknown> = {}) => {
  const product = mkProduct(overrides);
  return {
    ...auditMerchantCatalogue([product], legacyContext).audits[0],
    product,
  };
};

// ---------------------------------------------------------------------------
// READY
// ---------------------------------------------------------------------------

describe("auditMerchantProduct — READY", () => {
  it("reports a fully mappable product as READY with no reasons", () => {
    const { report } = auditOne();

    expect(report.merchantReadiness).toBe("READY");
    expect(report.reasons).toEqual([]);
    expect(report.missingFields).toEqual([]);
    expect(report.stockStatus).toBe("available");
  });

  it("hands Phase 2B the built ProductInput rather than strings", () => {
    const { product, productInput } = auditOne();

    expect(productInput).not.toBeNull();
    expect(productInput?.offerId).toBe(product.id);
    expect(productInput?.contentLanguage).toBe("en");
    expect(productInput?.feedLabel).toBe("IN");
    expect(productInput?.productAttributes.price).toEqual({
      amountMicros: "5299000000",
      currencyCode: "INR",
    });
    expect(productInput?.productAttributes.link).toBe(
      `https://www.fromthetrunk.shop/collection/${product.slug}`,
    );
  });

  it("accepts the approved Tangerine attribute spellings", () => {
    const { report } = auditOne({ attributes: { ...READY_ATTRIBUTES } });

    expect(report.merchantReadiness).toBe("READY");
  });

  it("never returns a ProductInput for a blocked product", () => {
    const { productInput } = auditOne({ pricePaise: 0 });

    expect(productInput).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Attribute gaps
// ---------------------------------------------------------------------------

describe("auditMerchantProduct — missing attributes", () => {
  const singles: Array<{ field: string; omit: string }> = [
    { field: "color", omit: "color" },
    { field: "gender", omit: "gender" },
    { field: "ageGroup", omit: "age_group" },
    { field: "size", omit: "size" },
  ];

  for (const { field, omit } of singles) {
    it(`flags a product missing ${field}`, () => {
      const attributes: Record<string, unknown> = { ...READY_ATTRIBUTES };
      delete attributes[omit];

      const { report } = auditOne({ attributes });

      expect(report.merchantReadiness).toBe("MISSING_REQUIRED_ATTRIBUTES");
      expect(report.missingFields).toEqual([field]);
      expect(report.reasons).toEqual(["missing_apparel_attributes"]);
    });
  }

  it("lists every missing attribute when several are absent", () => {
    const { report } = auditOne({ attributes: { fabric: "Chiffon" } });

    expect(report.missingFields).toEqual([
      "color",
      "gender",
      "ageGroup",
      "size",
    ]);
    expect(report.merchantReadiness).toBe("MISSING_REQUIRED_ATTRIBUTES");
  });

  it("flags a value outside Google's enum as missing", () => {
    const { report } = auditOne({
      attributes: { ...READY_ATTRIBUTES, gender: "ladies" },
    });

    expect(report.missingFields).toEqual(["gender"]);
  });

  it("flags a product with no explicit fabric or material", () => {
    const { report } = auditOne({
      attributes: {
        age_group: "ADULT",
        color: "Orange",
        gender: "FEMALE",
        size: "OS",
      },
      detailsFabric: null,
    });

    expect(report.merchantReadiness).toBe("MISSING_REQUIRED_ATTRIBUTES");
    expect(report.missingFields).toEqual(["material"]);
    expect(report.reasons).toEqual(["missing_material"]);
  });

  it("accepts a fabric recorded only in attributes", () => {
    const { report } = auditOne({ detailsFabric: null });

    expect(report.merchantReadiness).toBe("READY");
  });

  it("does not infer colour, gender, age group or size from the title", () => {
    const { report } = auditOne({
      attributes: { fabric: "Chiffon" },
      name: "Orange Chiffon Saree for Women, Free Size, Adult",
      storyNarrative: "A women's orange free-size adult saree.",
    });

    expect(report.missingFields).toEqual([
      "color",
      "gender",
      "ageGroup",
      "size",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Images, price, landing page
// ---------------------------------------------------------------------------

describe("auditMerchantProduct — unusable product data", () => {
  it("flags a product with no images", () => {
    const { report } = auditOne({ images: [] });

    expect(report.merchantReadiness).toBe("NO_VALID_IMAGE");
    expect(report.reasons).toEqual(["no_public_image"]);
  });

  it("flags a non-https image", () => {
    const { report } = auditOne({
      images: [{ media: mkMedia("http://insecure.test/a.jpg"), sortOrder: 0 }],
    });

    expect(report.merchantReadiness).toBe("NO_MERCHANT_SAFE_IMAGE");
    expect(report.reasons).toEqual(["merchant_image_url_not_public_https"]);
  });

  it("flags an unresolvable image", () => {
    const { report } = auditOne({
      images: [{ media: { url: 42 }, sortOrder: 0 }],
    });

    expect(report.merchantReadiness).toBe("NO_MERCHANT_SAFE_IMAGE");
  });

  it("flags a zero price", () => {
    const { report } = auditOne({ pricePaise: 0 });

    expect(report.merchantReadiness).toBe("INVALID_PRICE");
    expect(report.reasons).toEqual(["price_not_positive_integer"]);
  });

  it("flags a negative price", () => {
    const { report } = auditOne({ pricePaise: -1 });

    expect(report.merchantReadiness).toBe("INVALID_PRICE");
  });

  it("flags a non-integer price", () => {
    const { report } = auditOne({ pricePaise: 100.5 });

    expect(report.merchantReadiness).toBe("INVALID_PRICE");
  });

  const unsafeSlugs = ["../../evil", "saree?utm=x", "saree#frag", "two words"];

  for (const slug of unsafeSlugs) {
    it(`flags an unsafe landing page for slug ${JSON.stringify(slug)}`, () => {
      const { report } = auditOne({ slug });

      expect(report.merchantReadiness).toBe("INVALID_LANDING_PAGE");
      expect(report.reasons).toEqual(["landing_page_not_canonical"]);
    });
  }
});

// ---------------------------------------------------------------------------
// Lifecycle and exclusions
// ---------------------------------------------------------------------------

describe("auditMerchantProduct — lifecycle", () => {
  it("flags the excluded test product before anything else", () => {
    const { report } = auditOne({
      name: "Test Chiffon Do Not Buy If Not Authorized",
      pricePaise: 0,
    });

    expect(report.merchantReadiness).toBe("EXCLUDED_TEST_PRODUCT");
    expect(report.reasons).toEqual(["excluded_test_product"]);
  });

  it("keeps excluding the test product even when it is otherwise perfect", () => {
    const { report } = auditOne({ name: "test chiffon spare" });

    expect(report.merchantReadiness).toBe("EXCLUDED_TEST_PRODUCT");
  });

  it("flags an unpublished product", () => {
    const { report } = auditOne({ status: "draft" });

    expect(report.merchantReadiness).toBe("NOT_PUBLISHED");
    expect(report.reasons).toEqual(["product_not_published"]);
  });

  it("flags a reserved product", () => {
    const { report } = auditOne({ stockStatus: "reserved" });

    expect(report.merchantReadiness).toBe("RESERVED");
    expect(report.reasons).toEqual(["inventory_reserved"]);
  });

  it("flags a sold product", () => {
    const { report } = auditOne({ stockStatus: "sold" });

    expect(report.merchantReadiness).toBe("SOLD");
    expect(report.reasons).toEqual(["inventory_sold"]);
  });

  it("reports MAPPING_ERROR when the mapper throws something unexpected", () => {
    // `attributes` is not an object — the mapper's own guards still hold, but a
    // getter that throws proves the catch-all path.
    const product = mkProduct();
    Object.defineProperty(product, "images", {
      get() {
        throw new TypeError("exploded");
      },
    });

    const { report } = auditMerchantProduct(product, "available");

    expect(report.merchantReadiness).toBe("MAPPING_ERROR");
    expect(report.reasons).toEqual(["mapper_rejected"]);
  });
});

// ---------------------------------------------------------------------------
// Inventory v2
// ---------------------------------------------------------------------------

describe("auditMerchantCatalogue — inventory v2", () => {
  it("uses the raw stockStatus when inventory v2 is off", () => {
    const product = mkProduct({ quantityAvailable: 0, stockStatus: "available" });

    const { audits } = auditMerchantCatalogue([product], legacyContext);

    expect(audits[0].report.merchantReadiness).toBe("READY");
    expect(audits[0].report.stockStatus).toBe("available");
  });

  it("reports an inventory-v2 available product as READY", () => {
    const product = mkProduct();

    const { audits } = auditMerchantCatalogue([product], v2Context());

    expect(audits[0].report.merchantReadiness).toBe("READY");
  });

  it("blocks a product with an active reservation", () => {
    const product = mkProduct();

    const { audits } = auditMerchantCatalogue(
      [product],
      v2Context([[product.id, 1]]),
    );

    expect(audits[0].report.merchantReadiness).toBe("RESERVED");
    expect(audits[0].report.stockStatus).toBe("reserved");
    expect(audits[0].productInput).toBeNull();
  });

  it("blocks a product whose quantity is zero", () => {
    const product = mkProduct({ quantityAvailable: 0 });

    const { audits } = auditMerchantCatalogue([product], v2Context());

    expect(audits[0].report.merchantReadiness).toBe("SOLD");
    expect(audits[0].report.stockStatus).toBe("sold");
  });

  it("overrides a stale available column with the derived reserved state", () => {
    const product = mkProduct({ stockStatus: "available" });

    const { audits } = auditMerchantCatalogue(
      [product],
      v2Context([[product.id, 3]]),
    );

    expect(audits[0].report.merchantReadiness).toBe("RESERVED");
  });

  it("refuses to call a product ready when the raw column contradicts the derived state", () => {
    // Derived says available (no reservations, qty 1) but the column still says
    // reserved — the mapper refuses, and so does the audit.
    const product = mkProduct({ stockStatus: "reserved" });

    const { audits } = auditMerchantCatalogue([product], v2Context());

    expect(audits[0].report.stockStatus).toBe("available");
    expect(audits[0].report.merchantReadiness).toBe("RESERVED");
    expect(audits[0].report.reasons).toEqual(["stock_status_disagreement"]);
    expect(audits[0].productInput).toBeNull();
  });

  it("maps a sold-column disagreement to SOLD", () => {
    const product = mkProduct({ stockStatus: "sold" });

    const { audits } = auditMerchantCatalogue([product], v2Context());

    expect(audits[0].report.merchantReadiness).toBe("SOLD");
    expect(audits[0].report.reasons).toEqual(["stock_status_disagreement"]);
  });

  it("reads each product's reservation count from the batch map", () => {
    const ready = mkProduct();
    const held = mkProduct();

    const { audits } = auditMerchantCatalogue(
      [ready, held],
      v2Context([[held.id, 2]]),
    );

    expect(audits[0].report.merchantReadiness).toBe("READY");
    expect(audits[1].report.merchantReadiness).toBe("RESERVED");
  });
});

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

describe("summariseMerchantAudit", () => {
  const mixedCatalogue = () => [
    mkProduct(),
    mkProduct(),
    mkProduct({ attributes: { fabric: "Chiffon" } }),
    mkProduct({ images: [] }),
    mkProduct({ pricePaise: 0 }),
    mkProduct({ stockStatus: "sold" }),
    mkProduct({ stockStatus: "reserved" }),
    mkProduct({ name: "test chiffon do not buy" }),
  ];

  it("counts ready, blocked and published deterministically", () => {
    const { summary } = auditMerchantCatalogue(mixedCatalogue(), legacyContext);

    expect(summary.publishedProducts).toBe(8);
    expect(summary.ready).toBe(2);
    expect(summary.blocked).toBe(6);
    expect(summary.ready + summary.blocked).toBe(summary.publishedProducts);
  });

  it("breaks down by readiness state", () => {
    const { summary } = auditMerchantCatalogue(mixedCatalogue(), legacyContext);

    expect(summary.byReason).toEqual({
      EXCLUDED_TEST_PRODUCT: 1,
      INVALID_LANDING_PAGE: 0,
      INVALID_PRICE: 1,
      MAPPING_ERROR: 0,
      MISSING_REQUIRED_ATTRIBUTES: 1,
      NOT_PUBLISHED: 0,
      NO_MERCHANT_SAFE_IMAGE: 0,
      NO_VALID_IMAGE: 1,
      READY: 2,
      RESERVED: 1,
      SOLD: 1,
      UNSUPPORTED_PRODUCT_TYPE: 0,
    });
  });

  it("breaks down by machine-readable reason code", () => {
    const { summary } = auditMerchantCatalogue(mixedCatalogue(), legacyContext);

    expect(summary.byReasonCode.missing_apparel_attributes).toBe(1);
    expect(summary.byReasonCode.no_public_image).toBe(1);
    expect(summary.byReasonCode.price_not_positive_integer).toBe(1);
    expect(summary.byReasonCode.inventory_sold).toBe(1);
    expect(summary.byReasonCode.inventory_reserved).toBe(1);
    expect(summary.byReasonCode.excluded_test_product).toBe(1);
    expect(summary.byReasonCode.mapper_rejected).toBe(0);
  });

  it("zero-fills every state and reason code, in declaration order", () => {
    const { summary } = auditMerchantCatalogue([], legacyContext);

    expect(Object.keys(summary.byReason)).toEqual([...MERCHANT_READINESS_STATES]);
    expect(Object.keys(summary.byReasonCode)).toEqual([
      ...MERCHANT_AUDIT_REASON_CODES,
    ]);
    expect(Object.values(summary.byReason).every((n) => n === 0)).toBe(true);
    expect(summary.publishedProducts).toBe(0);
    expect(summary.ready).toBe(0);
    expect(summary.blocked).toBe(0);
  });

  it("is stable across repeated runs over the same rows", () => {
    const products = mixedCatalogue();

    const first = auditMerchantCatalogue(products, legacyContext);
    const second = auditMerchantCatalogue(products, legacyContext);

    expect(JSON.stringify(second.summary)).toBe(JSON.stringify(first.summary));
    expect(second.audits.map((a) => a.report)).toEqual(
      first.audits.map((a) => a.report),
    );
  });

  it("preserves input order and emits no duplicate product ids", () => {
    const products = mixedCatalogue();
    const { audits } = auditMerchantCatalogue(products, legacyContext);

    const ids = audits.map((entry) => entry.report.productId);
    expect(ids).toEqual(products.map((product) => product.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("summarises an explicit audit list identically", () => {
    const { audits, summary } = auditMerchantCatalogue(
      mixedCatalogue(),
      legacyContext,
    );

    expect(summariseMerchantAudit(audits)).toEqual(summary);
  });
});

// ---------------------------------------------------------------------------
// Output safety
// ---------------------------------------------------------------------------

describe("audit report — safe output only", () => {
  it("emits exactly the agreed safe keys", () => {
    const { report } = auditOne();

    expect(Object.keys(report).sort()).toEqual([
      "images",
      "merchantReadiness",
      "missingFields",
      "name",
      "productId",
      "reasons",
      "slug",
      "status",
      "stockStatus",
    ]);
  });

  it("carries no row internals, media records or price data", () => {
    const { audits } = auditMerchantCatalogue(
      [mkProduct(), mkProduct({ pricePaise: 0 })],
      legacyContext,
    );
    const serialised = JSON.stringify(audits.map((entry) => entry.report));

    for (const leak of [
      "internalNote",
      "metadata",
      "blob.vercel-storage",
      "pricePaise",
      "quantityAvailable",
      "storyNarrative",
      "detailsFabric",
    ]) {
      expect(serialised).not.toContain(leak);
    }
  });

  it("uses only declared reason codes", () => {
    const { audits } = auditMerchantCatalogue(
      [
        mkProduct(),
        mkProduct({ images: [] }),
        mkProduct({ pricePaise: 0 }),
        mkProduct({ slug: "../evil" }),
        mkProduct({ stockStatus: "sold" }),
        mkProduct({ name: "test chiffon x" }),
        mkProduct({ status: "draft" }),
        mkProduct({ attributes: {} }),
      ],
      legacyContext,
    );

    for (const { report } of audits) {
      for (const reason of report.reasons) {
        expect(MERCHANT_AUDIT_REASON_CODES).toContain(reason);
      }
      expect(MERCHANT_READINESS_STATES).toContain(report.merchantReadiness);
    }
  });
});

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

describe("toMerchantAuditCsv", () => {
  it("emits the agreed header row", () => {
    expect(toMerchantAuditCsv([]).split("\n")[0]).toBe(
      "product_id,slug,name,stock_status,merchant_readiness,missing_fields,reasons",
    );
    expect([...MERCHANT_AUDIT_CSV_HEADERS]).toEqual([
      "product_id",
      "slug",
      "name",
      "stock_status",
      "merchant_readiness",
      "missing_fields",
      "reasons",
    ]);
  });

  it("serialises a blocked product with pipe-joined lists", () => {
    const { audits } = auditMerchantCatalogue(
      [mkProduct({ attributes: { fabric: "Chiffon" } })],
      legacyContext,
    );

    const line = toMerchantAuditCsv([audits[0].report]).split("\n")[1];

    expect(line).toContain("MISSING_REQUIRED_ATTRIBUTES");
    expect(line).toContain("color|gender|ageGroup|size");
    expect(line).toContain("missing_apparel_attributes");
  });

  it("escapes a name containing a comma or quote", () => {
    const { audits } = auditMerchantCatalogue(
      [mkProduct({ name: 'Saree, "special" edition' })],
      legacyContext,
    );

    const line = toMerchantAuditCsv([audits[0].report]).split("\n")[1];

    expect(line).toContain('"Saree, ""special"" edition"');
  });
});

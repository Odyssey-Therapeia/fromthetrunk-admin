/**
 * Phase 2A.1 — catalogue attribute backfill planning (pure).
 *
 * What these tests prove:
 *   - Only catalogue-level defaults are proposed: saree gender/ageGroup/size,
 *     blouse gender/ageGroup. Blouse size and every product's colour are left
 *     to a human.
 *   - An existing non-empty value ALWAYS wins — including a value Google would
 *     reject, a non-string value, and one stored under a different key
 *     spelling. This is what makes apply idempotent.
 *   - A value is proposed only when the product TYPE declares the attribute
 *     key, using the type's own spelling; otherwise TYPE_ATTRIBUTE_NOT_DEFINED.
 *   - Types are resolved through typeId → product_types, never by product name.
 *   - Sold and reserved products still receive safe defaults; stock is untouched.
 *   - Unknown or absent product types fail closed.
 */

import { describe, expect, it } from "vitest";

import type { ProductWithRelations } from "@/db/queries/products";
import type { ProductTypeRecord } from "@/db/queries/product-types";
import {
  BACKFILL_POLICIES,
  hasStoredAttributeValue,
  mergeBackfillAttributes,
  planCatalogueBackfill,
  planProductBackfill,
  resolveTypeAttributeKey,
  validatePlannedChange,
} from "@/lib/google-merchant/catalogue-backfill";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date("2026-01-01T00:00:00.000Z");

const SAREE_TYPE_ID = "512925ba-62e3-4a9c-84b6-53fc4295e635";
const BLOUSE_TYPE_ID = "5f02dc6e-1ee4-45fa-864e-eb05debee19b";
const ACCESSORY_TYPE_ID = "d7b326a0-94a7-4830-97ba-6c7782e820af";

const attributeDef = (key: string) => ({
  key,
  meta: { label: key, type: "text" },
  required: false,
});

/** A type schema that declares every key the backfill wants. */
const mkType = (
  id: string,
  slug: string,
  keys: string[],
): ProductTypeRecord =>
  ({
    attributeDefs: keys.map(attributeDef),
    createdAt: NOW,
    id,
    name: slug,
    slug,
    updatedAt: NOW,
  }) as unknown as ProductTypeRecord;

const sareeType = mkType(SAREE_TYPE_ID, "preloved-saree", [
  "fabric",
  "condition",
  "color",
  "gender",
  "age_group",
  "size",
]);

const blouseType = mkType(BLOUSE_TYPE_ID, "blouse", [
  "fabric",
  "condition",
  "color",
  "size",
  "gender",
  "age_group",
]);

/** The schema as it stands in the database today — no gender/age_group. */
const legacySareeType = mkType(SAREE_TYPE_ID, "preloved-saree", [
  "fabric",
  "condition",
  "length",
  "width",
  "designer",
  "occasion",
  "color",
  "blouse_piece",
]);

const accessoryType = mkType(ACCESSORY_TYPE_ID, "accessory", [
  "material",
  "condition",
  "color",
]);

let sequence = 0;

function mkProduct(
  overrides: Record<string, unknown> = {},
): ProductWithRelations {
  sequence += 1;

  return {
    attributes: { color: "Orange", condition: "Excellent", fabric: "Chiffon" },
    createdAt: NOW,
    detailsFabric: "Chiffon",
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    images: [],
    name: `Saree ${sequence}`,
    pricePaise: 529900,
    quantityAvailable: 1,
    slug: `saree-${sequence}`,
    status: "published",
    stockStatus: "available",
    storyTitle: "Story",
    tags: [],
    typeId: SAREE_TYPE_ID,
    updatedAt: NOW,
    ...overrides,
  } as unknown as ProductWithRelations;
}

const typeMap = (...types: ProductTypeRecord[]) =>
  new Map(types.map((type) => [type.id, type]));

// ---------------------------------------------------------------------------
// Saree defaults
// ---------------------------------------------------------------------------

describe("planProductBackfill — preloved saree defaults", () => {
  it("proposes FEMALE / ADULT / OS for a saree missing all three", () => {
    const { change } = planProductBackfill(mkProduct(), sareeType);

    expect(change?.set).toEqual({
      age_group: "ADULT",
      gender: "FEMALE",
      size: "OS",
    });
    expect(change?.productType).toBe("preloved-saree");
  });

  it("proposes gender only when gender alone is missing", () => {
    const { change } = planProductBackfill(
      mkProduct({
        attributes: { age_group: "ADULT", color: "Orange", size: "OS" },
      }),
      sareeType,
    );

    expect(change?.set).toEqual({ gender: "FEMALE" });
  });

  it("proposes age group only when age group alone is missing", () => {
    const { change } = planProductBackfill(
      mkProduct({
        attributes: { color: "Orange", gender: "FEMALE", size: "OS" },
      }),
      sareeType,
    );

    expect(change?.set).toEqual({ age_group: "ADULT" });
  });

  it("proposes size only when size alone is missing", () => {
    const { change } = planProductBackfill(
      mkProduct({
        attributes: { age_group: "ADULT", color: "Orange", gender: "FEMALE" },
      }),
      sareeType,
    );

    expect(change?.set).toEqual({ size: "OS" });
  });

  it("writes using the type's own key spelling", () => {
    const camelType = mkType(SAREE_TYPE_ID, "preloved-saree", [
      "gender",
      "ageGroup",
      "size",
    ]);

    const { change } = planProductBackfill(mkProduct(), camelType);

    expect(Object.keys(change?.set ?? {})).toContain("ageGroup");
    expect(Object.keys(change?.set ?? {})).not.toContain("age_group");
  });

  it("touches nothing but the three default keys", () => {
    const product = mkProduct();
    const { change } = planProductBackfill(product, sareeType);
    const merged = mergeBackfillAttributes(product, change!);

    expect(merged).toEqual({
      age_group: "ADULT",
      color: "Orange",
      condition: "Excellent",
      fabric: "Chiffon",
      gender: "FEMALE",
      size: "OS",
    });
  });
});

// ---------------------------------------------------------------------------
// Existing values always win
// ---------------------------------------------------------------------------

describe("planProductBackfill — never overwrites", () => {
  const preserved: Array<{ attributes: Record<string, unknown>; label: string }> =
    [
      { attributes: { gender: "MALE" }, label: "a different gender" },
      { attributes: { gender: "ladies" }, label: "a Google-invalid gender" },
      { attributes: { age_group: "KIDS" }, label: "a different age group" },
      { attributes: { ageGroup: "ADULT" }, label: "a camelCase age group" },
      { attributes: { "Age Group": "adult" }, label: "a spaced age-group key" },
      { attributes: { size: "M" }, label: "a specific size" },
      { attributes: { size: 42 }, label: "a non-string size" },
      { attributes: { gender: "  FEMALE  " }, label: "a padded gender" },
    ];

  for (const { attributes, label } of preserved) {
    it(`leaves ${label} untouched`, () => {
      const stored = { color: "Orange", ...attributes };
      const { change } = planProductBackfill(
        mkProduct({ attributes: stored }),
        sareeType,
      );

      for (const key of Object.keys(attributes)) {
        expect(change?.set ?? {}).not.toHaveProperty(key);
      }
      // And the equivalent canonical key is not written under another spelling.
      const written = Object.keys(change?.set ?? {});
      if ("ageGroup" in attributes || "Age Group" in attributes) {
        expect(written).not.toContain("age_group");
      }
      if ("gender" in attributes) expect(written).not.toContain("gender");
      if ("size" in attributes) expect(written).not.toContain("size");
    });
  }

  it("treats empty strings and whitespace as fillable", () => {
    const { change } = planProductBackfill(
      mkProduct({
        attributes: { age_group: "   ", color: "Orange", gender: "", size: "" },
      }),
      sareeType,
    );

    expect(change?.set).toEqual({
      age_group: "ADULT",
      gender: "FEMALE",
      size: "OS",
    });
  });

  it("treats null and undefined as fillable", () => {
    const { change } = planProductBackfill(
      mkProduct({
        attributes: {
          age_group: undefined,
          color: "Orange",
          gender: null,
          size: null,
        },
      }),
      sareeType,
    );

    expect(Object.keys(change?.set ?? {}).sort()).toEqual([
      "age_group",
      "gender",
      "size",
    ]);
  });

  it("proposes nothing for a fully populated product", () => {
    const plan = planProductBackfill(
      mkProduct({
        attributes: {
          age_group: "ADULT",
          color: "Orange",
          gender: "FEMALE",
          size: "OS",
        },
      }),
      sareeType,
    );

    expect(plan.change).toBeNull();
    expect(plan.manualReview).toBeNull();
    expect(plan.skipped).toBe(true);
  });

  it("hasStoredAttributeValue matches key spelling variants", () => {
    const product = mkProduct({ attributes: { "AGE-GROUP": "ADULT" } });

    expect(hasStoredAttributeValue(product, "ageGroup")).toBe(true);
    expect(hasStoredAttributeValue(product, "gender")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blouse defaults
// ---------------------------------------------------------------------------

describe("planProductBackfill — blouse defaults", () => {
  const blouse = (attributes: Record<string, unknown> = {}) =>
    mkProduct({
      attributes: { condition: "Excellent", fabric: "Cotton", ...attributes },
      name: "Sleeveless Stretchfit Blouse",
      slug: "sleeveless-stretchfit-blouse",
      typeId: BLOUSE_TYPE_ID,
    });

  it("proposes gender and age group only", () => {
    const { change } = planProductBackfill(blouse({ color: "Black" }), blouseType);

    expect(change?.set).toEqual({ age_group: "ADULT", gender: "FEMALE" });
  });

  it("never defaults blouse size, even though the type defines it", () => {
    const { change } = planProductBackfill(blouse({ color: "Black" }), blouseType);

    expect(change?.set).not.toHaveProperty("size");
    expect(resolveTypeAttributeKey(blouseType, "size")).toBe("size");
  });

  it("never defaults colour, and reports it for manual review", () => {
    const plan = planProductBackfill(blouse(), blouseType);

    expect(plan.change?.set).not.toHaveProperty("color");
    expect(plan.manualReview?.missingFields).toEqual(["color"]);
    expect(plan.manualReview?.reasons).toEqual([
      "PRODUCT_SPECIFIC_VALUE_REQUIRED",
    ]);
  });

  it("declares no size default in the blouse policy", () => {
    expect(BACKFILL_POLICIES.blouse).toEqual({
      ageGroup: "ADULT",
      gender: "FEMALE",
    });
  });
});

// ---------------------------------------------------------------------------
// Type resolution and schema validation
// ---------------------------------------------------------------------------

describe("planProductBackfill — product type resolution", () => {
  it("fails closed when the product has no type", () => {
    const plan = planProductBackfill(mkProduct({ typeId: null }), null);

    expect(plan.change).toBeNull();
    expect(plan.manualReview?.reasons).toEqual(["UNKNOWN_PRODUCT_TYPE"]);
  });

  it("fails closed for a type with no policy", () => {
    const plan = planProductBackfill(
      mkProduct({ typeId: ACCESSORY_TYPE_ID }),
      accessoryType,
    );

    expect(plan.change).toBeNull();
    expect(plan.manualReview?.reasons).toEqual(["UNKNOWN_PRODUCT_TYPE"]);
  });

  it("does not classify by product name", () => {
    // Named like a saree, typed as an accessory — the type wins.
    const plan = planProductBackfill(
      mkProduct({
        name: "Tangerine Noir Preloved Saree",
        typeId: ACCESSORY_TYPE_ID,
      }),
      accessoryType,
    );

    expect(plan.change).toBeNull();
  });

  it("does not classify a saree-typed product by its blouse-like name", () => {
    const { change } = planProductBackfill(
      mkProduct({ name: "Stretchfit Blouse" }),
      sareeType,
    );

    // Saree policy applied — size IS defaulted, because the TYPE is the saree.
    expect(change?.set).toHaveProperty("size", "OS");
  });

  it("reports TYPE_ATTRIBUTE_NOT_DEFINED for keys the type does not declare", () => {
    const plan = planProductBackfill(mkProduct(), legacySareeType);

    expect(plan.change).toBeNull();
    expect(plan.manualReview?.reasons).toContain("TYPE_ATTRIBUTE_NOT_DEFINED");
    expect(plan.manualReview?.missingFields).toEqual([
      "gender",
      "ageGroup",
      "size",
    ]);
  });

  it("proposes only the keys the type does declare", () => {
    const partialType = mkType(SAREE_TYPE_ID, "preloved-saree", [
      "fabric",
      "gender",
    ]);

    const plan = planProductBackfill(mkProduct(), partialType);

    expect(plan.change?.set).toEqual({ gender: "FEMALE" });
    expect(plan.manualReview?.missingFields).toEqual(["ageGroup", "size"]);
    expect(plan.manualReview?.reasons).toContain("TYPE_ATTRIBUTE_NOT_DEFINED");
  });

  it("ignores malformed attribute definitions", () => {
    const brokenType = {
      ...sareeType,
      attributeDefs: [null, "gender", { key: 42 }, { key: "gender" }],
    } as unknown as ProductTypeRecord;

    expect(resolveTypeAttributeKey(brokenType, "gender")).toBe("gender");
    expect(resolveTypeAttributeKey(brokenType, "size")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Inventory independence
// ---------------------------------------------------------------------------

describe("planProductBackfill — inventory independence", () => {
  for (const stockStatus of ["available", "reserved", "sold"] as const) {
    it(`proposes defaults for a ${stockStatus} saree`, () => {
      const { change } = planProductBackfill(
        mkProduct({ quantityAvailable: 0, stockStatus }),
        sareeType,
      );

      expect(change?.set).toEqual({
        age_group: "ADULT",
        gender: "FEMALE",
        size: "OS",
      });
    });
  }

  it("proposes no stock, price, status or content change", () => {
    const product = mkProduct({ stockStatus: "sold" });
    const { change } = planProductBackfill(product, sareeType);

    for (const forbidden of [
      "stockStatus",
      "status",
      "pricePaise",
      "slug",
      "name",
      "images",
      "color",
      "fabric",
      "condition",
      "designer",
    ]) {
      expect(change?.set ?? {}).not.toHaveProperty(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// Catalogue plan + summary
// ---------------------------------------------------------------------------

describe("planCatalogueBackfill", () => {
  const catalogue = () => [
    mkProduct(),
    mkProduct({
      attributes: {
        age_group: "ADULT",
        color: "Orange",
        gender: "FEMALE",
        size: "OS",
      },
    }),
    mkProduct({
      attributes: { condition: "Excellent", fabric: "Cotton" },
      typeId: BLOUSE_TYPE_ID,
    }),
    mkProduct({ typeId: ACCESSORY_TYPE_ID }),
    mkProduct({ typeId: null }),
  ];

  const types = typeMap(sareeType, blouseType, accessoryType);

  it("counts scanned, changed, writes, manual review and skipped", () => {
    const { summary } = planCatalogueBackfill(catalogue(), types);

    expect(summary).toEqual({
      fieldWrites: 5,
      productsScanned: 5,
      productsWouldChange: 2,
      requiresManualReview: 3,
      skipped: 1,
    });
  });

  it("keeps input order and emits no duplicate ids", () => {
    const products = catalogue();
    const { changes } = planCatalogueBackfill(products, types);

    const ids = changes.map((change) => change.productId);
    expect(ids).toEqual([products[0].id, products[2].id]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is stable across repeated runs", () => {
    const products = catalogue();

    expect(JSON.stringify(planCatalogueBackfill(products, types))).toBe(
      JSON.stringify(planCatalogueBackfill(products, types)),
    );
  });

  it("emits only safe product fields", () => {
    const { changes, manualReview } = planCatalogueBackfill(catalogue(), types);

    expect(Object.keys(changes[0]).sort()).toEqual([
      "name",
      "productId",
      "productType",
      "set",
      "slug",
    ]);
    expect(Object.keys(manualReview[0]).sort()).toEqual([
      "missingFields",
      "name",
      "productId",
      "reasons",
      "slug",
    ]);

    const serialised = JSON.stringify({ changes, manualReview });
    for (const leak of ["pricePaise", "stockStatus", "storyTitle", "typeId"]) {
      expect(serialised).not.toContain(leak);
    }
  });

  it("proposes nothing at all against the type schema as it stands today", () => {
    // Neither live type declares gender or age_group, and the saree type does
    // not declare size — so a run today writes nothing and asks for a schema fix.
    const { summary, changes } = planCatalogueBackfill(
      [mkProduct(), mkProduct({ typeId: BLOUSE_TYPE_ID })],
      typeMap(legacySareeType, mkType(BLOUSE_TYPE_ID, "blouse", [
        "fabric",
        "condition",
        "color",
        "size",
        "sleeve_type",
      ])),
    );

    expect(changes).toEqual([]);
    expect(summary.productsWouldChange).toBe(0);
    expect(summary.fieldWrites).toBe(0);
    expect(summary.requiresManualReview).toBe(2);
  });

  it("proposes nothing on a second pass over already-filled rows", () => {
    const products = [mkProduct(), mkProduct({ typeId: BLOUSE_TYPE_ID })];
    const first = planCatalogueBackfill(products, types);

    // Simulate the writes the first pass would perform.
    const written = products.map((product, index) => {
      const change = first.changes.find((c) => c.productId === product.id);
      return change
        ? ({
            ...product,
            attributes: mergeBackfillAttributes(product, change),
          } as ProductWithRelations)
        : products[index];
    });

    const second = planCatalogueBackfill(written, types);

    expect(first.summary.productsWouldChange).toBe(2);
    expect(second.summary.productsWouldChange).toBe(0);
    expect(second.summary.fieldWrites).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Pre-write revalidation
// ---------------------------------------------------------------------------

describe("validatePlannedChange", () => {
  const change = () =>
    planProductBackfill(mkProduct(), sareeType).change!;

  it("passes for an unchanged product and type", () => {
    const product = mkProduct();
    const plan = planProductBackfill(product, sareeType).change!;

    expect(validatePlannedChange(plan, product, sareeType)).toBeNull();
  });

  it("refuses when the value was filled in since the preview", () => {
    const planned = change();
    const product = mkProduct({
      attributes: { color: "Orange", gender: "MALE" },
    });

    expect(validatePlannedChange(planned, product, sareeType)).toBe(
      "VALUE_ALREADY_SET",
    );
  });

  it("refuses when the product type changed", () => {
    expect(validatePlannedChange(change(), mkProduct(), blouseType)).toBe(
      "PRODUCT_TYPE_CHANGED",
    );
  });

  it("refuses when the type no longer declares the key", () => {
    expect(validatePlannedChange(change(), mkProduct(), legacySareeType)).toBe(
      "TYPE_ATTRIBUTE_NOT_DEFINED",
    );
  });

  it("refuses when the product type disappeared", () => {
    expect(validatePlannedChange(change(), mkProduct(), null)).toBe(
      "PRODUCT_TYPE_CHANGED",
    );
  });

  it("refuses a value that is not in the policy", () => {
    const tampered = { ...change(), set: { gender: "MALE" } };

    expect(validatePlannedChange(tampered, mkProduct(), sareeType)).toBe(
      "VALUE_NOT_IN_POLICY",
    );
  });

  it("refuses a key outside the policy", () => {
    const tampered = { ...change(), set: { color: "Blue" } };

    expect(validatePlannedChange(tampered, mkProduct(), sareeType)).toBe(
      "TYPE_ATTRIBUTE_NOT_DEFINED",
    );
  });
});

/**
 * P4-03: tests/unit/collections-evaluator.test.ts
 *
 * Pure-unit tests for evaluateRules() — the smart-collection rule engine.
 *
 * Contract:
 *   evaluateRules(rules, product) returns true iff every condition in `rules`
 *   matches the product (AND semantics).
 *
 * Condition types:
 *   type           — product.typeSlug === value
 *   tag            — product.tagSlugs includes value
 *   price-range    — product.pricePaise >= min && product.pricePaise <= max
 *   attribute-equals — product.attributes[key] === value (string comparison)
 *
 * None of these tests touch the database.
 */

import { describe, expect, it, vi } from "vitest";

// Mock the db module to avoid requiring DATABASE_URL at import time.
// evaluateRules is a pure function — it never accesses the db.
vi.mock("@/db", () => ({
  db: {},
  withRetry: vi.fn(),
}));

import {
  evaluateRules,
  type EvaluatorProduct,
} from "@/db/queries/collections";

// ---------------------------------------------------------------------------
// Shared fixture product (valid, published, has all fields)
// ---------------------------------------------------------------------------

const baseProduct: EvaluatorProduct = {
  pricePaise: 15000,
  typeSlug: "preloved-saree",
  tagSlugs: ["silk", "bridal", "vintage"],
  attributes: {
    fabric: "Pure Silk",
    condition: "excellent",
    color: "Red",
  },
};

// ---------------------------------------------------------------------------
// type condition
// ---------------------------------------------------------------------------

describe("evaluateRules — type condition", () => {
  it("matches when typeSlug equals value", () => {
    expect(
      evaluateRules([{ type: "type", value: "preloved-saree" }], baseProduct)
    ).toBe(true);
  });

  it("does NOT match when typeSlug differs", () => {
    expect(
      evaluateRules([{ type: "type", value: "blouse" }], baseProduct)
    ).toBe(false);
  });

  it("does NOT match when typeSlug is null", () => {
    expect(
      evaluateRules(
        [{ type: "type", value: "preloved-saree" }],
        { ...baseProduct, typeSlug: null }
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// tag condition
// ---------------------------------------------------------------------------

describe("evaluateRules — tag condition", () => {
  it("matches when the product has the tag slug", () => {
    expect(
      evaluateRules([{ type: "tag", value: "silk" }], baseProduct)
    ).toBe(true);
  });

  it("matches another tag in the set", () => {
    expect(
      evaluateRules([{ type: "tag", value: "bridal" }], baseProduct)
    ).toBe(true);
  });

  it("does NOT match a tag the product does not have", () => {
    expect(
      evaluateRules([{ type: "tag", value: "cotton" }], baseProduct)
    ).toBe(false);
  });

  it("does NOT match when tagSlugs is empty (forward-compat: no-tags case)", () => {
    expect(
      evaluateRules(
        [{ type: "tag", value: "silk" }],
        { ...baseProduct, tagSlugs: [] }
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// price-range condition
// ---------------------------------------------------------------------------

describe("evaluateRules — price-range condition", () => {
  it("matches when pricePaise is exactly at the lower bound", () => {
    expect(
      evaluateRules([{ type: "price-range", min: 15000, max: 30000 }], baseProduct)
    ).toBe(true);
  });

  it("matches when pricePaise is exactly at the upper bound", () => {
    expect(
      evaluateRules([{ type: "price-range", min: 5000, max: 15000 }], baseProduct)
    ).toBe(true);
  });

  it("matches when pricePaise is between min and max", () => {
    expect(
      evaluateRules([{ type: "price-range", min: 10000, max: 20000 }], baseProduct)
    ).toBe(true);
  });

  it("does NOT match when pricePaise is below min", () => {
    expect(
      evaluateRules([{ type: "price-range", min: 20000, max: 50000 }], baseProduct)
    ).toBe(false);
  });

  it("does NOT match when pricePaise is above max", () => {
    expect(
      evaluateRules([{ type: "price-range", min: 1000, max: 14999 }], baseProduct)
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// attribute-equals condition
// ---------------------------------------------------------------------------

describe("evaluateRules — attribute-equals condition", () => {
  it("matches when attributes[key] === value", () => {
    expect(
      evaluateRules(
        [{ type: "attribute-equals", key: "fabric", value: "Pure Silk" }],
        baseProduct
      )
    ).toBe(true);
  });

  it("does NOT match when value differs (case-sensitive)", () => {
    expect(
      evaluateRules(
        [{ type: "attribute-equals", key: "fabric", value: "pure silk" }],
        baseProduct
      )
    ).toBe(false);
  });

  it("does NOT match when key is absent from attributes", () => {
    expect(
      evaluateRules(
        [{ type: "attribute-equals", key: "weave", value: "Kanjivaram" }],
        baseProduct
      )
    ).toBe(false);
  });

  it("does NOT match when attributes is empty", () => {
    expect(
      evaluateRules(
        [{ type: "attribute-equals", key: "fabric", value: "Pure Silk" }],
        { ...baseProduct, attributes: {} }
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AND combination — all conditions must pass
// ---------------------------------------------------------------------------

describe("evaluateRules — AND combinations", () => {
  it("passes when ALL conditions match", () => {
    expect(
      evaluateRules(
        [
          { type: "type", value: "preloved-saree" },
          { type: "tag", value: "silk" },
          { type: "price-range", min: 10000, max: 20000 },
          { type: "attribute-equals", key: "condition", value: "excellent" },
        ],
        baseProduct
      )
    ).toBe(true);
  });

  it("fails when at least one condition does not match", () => {
    expect(
      evaluateRules(
        [
          { type: "type", value: "preloved-saree" },   // passes
          { type: "tag", value: "cotton" },             // FAILS
          { type: "price-range", min: 10000, max: 20000 },
        ],
        baseProduct
      )
    ).toBe(false);
  });

  it("fails when the price condition is the only failing one", () => {
    expect(
      evaluateRules(
        [
          { type: "type", value: "preloved-saree" },
          { type: "price-range", min: 50000, max: 100000 }, // FAILS
        ],
        baseProduct
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Edge cases — empty rules and non-matching product
// ---------------------------------------------------------------------------

describe("evaluateRules — edge cases", () => {
  it("returns true for an empty rules array (vacuous truth)", () => {
    expect(evaluateRules([], baseProduct)).toBe(true);
  });

  it("returns false for a product that does NOT match any single condition", () => {
    const unrelated: EvaluatorProduct = {
      pricePaise: 500,
      typeSlug: "accessory",
      tagSlugs: [],
      attributes: {},
    };
    expect(
      evaluateRules(
        [{ type: "type", value: "preloved-saree" }],
        unrelated
      )
    ).toBe(false);
  });

  it("no false positives — blouse does not match preloved-saree conditions", () => {
    const blouseProduct: EvaluatorProduct = {
      pricePaise: 5000,
      typeSlug: "blouse",
      tagSlugs: ["silk"],
      attributes: { fabric: "Raw Silk", condition: "mint" },
    };
    expect(
      evaluateRules(
        [
          { type: "type", value: "preloved-saree" },
          { type: "price-range", min: 10000, max: 50000 },
        ],
        blouseProduct
      )
    ).toBe(false);
  });
});

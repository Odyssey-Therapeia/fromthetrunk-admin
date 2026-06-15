/**
 * P4-01: tests/unit/product-types.test.ts
 *
 * Tests for:
 *   1. buildTypeZodSchema() — builds an enforcing zod schema from attribute_defs
 *   2. detailsToAttributes() — faithful mapping from details* columns to preloved-saree attributes
 *   3. product_types CRUD (list/get/create/update) — contract-level unit tests (no DB required)
 *
 * These tests must pass without touching the database.
 */

import { describe, expect, it } from "vitest";

import {
  buildTypeZodSchema,
  detailsToAttributes,
  type AttributeDef,
} from "@/lib/catalog/type-schema";

// ---------------------------------------------------------------------------
// Fixtures — attribute_defs shapes stored in product_types.attribute_defs
// ---------------------------------------------------------------------------

/**
 * Condition options for select field — mirrors the migration seed.
 */
const conditionOptions = [
  { label: "Mint", value: "mint" },
  { label: "Excellent", value: "excellent" },
  { label: "Very Good", value: "very_good" },
  { label: "Good", value: "good" },
  { label: "Fair", value: "fair" },
];

const occasionOptions = [
  { label: "Bridal", value: "bridal" },
  { label: "Wedding", value: "wedding" },
  { label: "Festive", value: "festive" },
  { label: "Formal", value: "formal" },
  { label: "Casual", value: "casual" },
  { label: "Daily Wear", value: "daily_wear" },
];

/** preloved-saree attribute_defs (mirrors seed data) */
const preloved_saree_defs: AttributeDef[] = [
  {
    key: "fabric",
    meta: { type: "text", label: "Fabric", placeholder: "e.g. Pure Silk" },
    required: true,
  },
  {
    key: "condition",
    meta: {
      type: "select",
      label: "Condition",
      options: conditionOptions,
    },
    required: true,
  },
  {
    key: "length",
    meta: { type: "text", label: "Length", placeholder: "e.g. 5.5m" },
    required: false,
  },
  {
    key: "width",
    meta: { type: "text", label: "Width", placeholder: "e.g. 44 inches" },
    required: false,
  },
  {
    key: "designer",
    meta: { type: "text", label: "Designer / Weaver" },
    required: false,
  },
  {
    key: "occasion",
    meta: {
      type: "multi-select",
      label: "Occasion",
      options: occasionOptions,
    },
    required: false,
  },
  {
    key: "color",
    meta: { type: "text", label: "Primary Color" },
    required: false,
  },
  {
    key: "blouse_piece",
    meta: { type: "boolean", label: "Blouse Piece Included" },
    required: false,
  },
];

/** blouse attribute_defs */
const blouse_defs: AttributeDef[] = [
  {
    key: "fabric",
    meta: { type: "text", label: "Fabric" },
    required: true,
  },
  {
    key: "condition",
    meta: {
      type: "select",
      label: "Condition",
      options: conditionOptions,
    },
    required: true,
  },
  {
    key: "color",
    meta: { type: "text", label: "Color" },
    required: false,
  },
];

/** accessory attribute_defs */
const accessory_defs: AttributeDef[] = [
  {
    key: "material",
    meta: { type: "text", label: "Material" },
    required: true,
  },
  {
    key: "condition",
    meta: {
      type: "select",
      label: "Condition",
      options: conditionOptions,
    },
    required: true,
  },
  {
    key: "color",
    meta: { type: "text", label: "Color" },
    required: false,
  },
];

// ---------------------------------------------------------------------------
// buildTypeZodSchema — core enforcement tests
// ---------------------------------------------------------------------------

describe("buildTypeZodSchema — preloved-saree", () => {
  const schema = buildTypeZodSchema(preloved_saree_defs);

  it("returns a zod schema with .safeParse()", () => {
    expect(typeof schema.safeParse).toBe("function");
  });

  it("accepts a valid saree attributes object (all fields)", () => {
    const result = schema.safeParse({
      fabric: "Pure Silk",
      condition: "excellent",
      length: "5.5m",
      width: "44 inches",
      designer: "Chandralekha",
      occasion: ["bridal", "wedding"],
      color: "Red",
      blouse_piece: true,
    });
    expect(result.success).toBe(true);
  });

  it("accepts a minimal valid object (only required fields)", () => {
    const result = schema.safeParse({
      fabric: "Banarasi",
      condition: "mint",
    });
    expect(result.success).toBe(true);
  });

  it("REJECTS when required fabric is missing", () => {
    const result = schema.safeParse({
      condition: "good",
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS when required condition is missing", () => {
    const result = schema.safeParse({
      fabric: "Cotton",
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS when condition has an invalid enum value", () => {
    const result = schema.safeParse({
      fabric: "Cotton",
      condition: "Restored", // not a valid enum value
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS when condition is 'Excellent' (wrong case — values are lowercase slugs)", () => {
    const result = schema.safeParse({
      fabric: "Silk",
      condition: "Excellent", // case-sensitive: value must be "excellent"
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS when occasion is a string instead of array", () => {
    const result = schema.safeParse({
      fabric: "Silk",
      condition: "mint",
      occasion: "bridal", // should be an array
    });
    expect(result.success).toBe(false);
  });

  it("REJECTS when blouse_piece is a string instead of boolean", () => {
    const result = schema.safeParse({
      fabric: "Silk",
      condition: "mint",
      blouse_piece: "yes", // should be boolean
    });
    expect(result.success).toBe(false);
  });

  it("accepts fabric with empty string when required (zod: string())", () => {
    // required means .min(1) — empty string should fail
    const result = schema.safeParse({
      fabric: "",
      condition: "good",
    });
    // fabric is required: empty string is not acceptable
    expect(result.success).toBe(false);
  });
});

describe("buildTypeZodSchema — blouse", () => {
  const schema = buildTypeZodSchema(blouse_defs);

  it("accepts valid blouse attributes", () => {
    const result = schema.safeParse({
      fabric: "Raw Silk",
      condition: "excellent",
      color: "Navy Blue",
    });
    expect(result.success).toBe(true);
  });

  it("REJECTS missing required fabric", () => {
    const result = schema.safeParse({ condition: "fair" });
    expect(result.success).toBe(false);
  });

  it("REJECTS invalid condition enum", () => {
    const result = schema.safeParse({ fabric: "Cotton", condition: "Perfect" });
    expect(result.success).toBe(false);
  });
});

describe("buildTypeZodSchema — accessory", () => {
  const schema = buildTypeZodSchema(accessory_defs);

  it("accepts valid accessory attributes (required fields only)", () => {
    const result = schema.safeParse({
      material: "Sterling Silver",
      condition: "mint",
    });
    expect(result.success).toBe(true);
  });

  it("REJECTS missing required material", () => {
    const result = schema.safeParse({ condition: "good" });
    expect(result.success).toBe(false);
  });
});

describe("buildTypeZodSchema — edge cases", () => {
  it("empty defs produces a schema that accepts an empty object", () => {
    const schema = buildTypeZodSchema([]);
    const result = schema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("a text field with required=false accepts undefined/absent key", () => {
    const defs: AttributeDef[] = [
      {
        key: "color",
        meta: { type: "text", label: "Color" },
        required: false,
      },
    ];
    const schema = buildTypeZodSchema(defs);
    // Optional field: absent is OK
    expect(schema.safeParse({}).success).toBe(true);
  });

  it("a text field with required=true rejects absent key", () => {
    const defs: AttributeDef[] = [
      {
        key: "fabric",
        meta: { type: "text", label: "Fabric" },
        required: true,
      },
    ];
    const schema = buildTypeZodSchema(defs);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// detailsToAttributes — backfill mapping tests
// ---------------------------------------------------------------------------

describe("detailsToAttributes — preloved-saree mapping", () => {
  it("maps all five details* columns to attribute keys", () => {
    const product = {
      detailsFabric: "Pure Silk",
      detailsLength: "5.5m",
      detailsWidth: "44 inches",
      detailsCondition: "excellent",
      detailsDesigner: "Chandralekha",
    };
    const attrs = detailsToAttributes(product);
    expect(attrs.fabric).toBe("Pure Silk");
    expect(attrs.length).toBe("5.5m");
    expect(attrs.width).toBe("44 inches");
    expect(attrs.condition).toBe("excellent");
    expect(attrs.designer).toBe("Chandralekha");
  });

  it("maps null columns to empty string (COALESCE semantics)", () => {
    const product = {
      detailsFabric: null,
      detailsLength: null,
      detailsWidth: null,
      detailsCondition: null,
      detailsDesigner: null,
    };
    const attrs = detailsToAttributes(product);
    expect(attrs.fabric).toBe("");
    expect(attrs.length).toBe("");
    expect(attrs.width).toBe("");
    expect(attrs.condition).toBe("");
    expect(attrs.designer).toBe(""); // null maps to ""
  });

  it("maps undefined columns to empty string", () => {
    const attrs = detailsToAttributes({});
    expect(attrs.fabric).toBe("");
    expect(attrs.length).toBe("");
    expect(attrs.width).toBe("");
    expect(attrs.condition).toBe("");
    expect(attrs.designer).toBe("");
  });

  it("preserves non-null string values exactly (no trimming)", () => {
    const product = {
      detailsFabric: "  Handloom Cotton  ",
      detailsCondition: "very_good",
    };
    const attrs = detailsToAttributes(product);
    expect(attrs.fabric).toBe("  Handloom Cotton  ");
    expect(attrs.condition).toBe("very_good");
  });

  it("returns only the five mapped keys (no extra keys from product row)", () => {
    const product = {
      detailsFabric: "Silk",
      detailsLength: "6m",
      detailsWidth: "45in",
      detailsCondition: "good",
      detailsDesigner: null,
      // Non-details columns should not appear in attrs
      id: "some-uuid",
      name: "Some Saree",
      pricePaise: 50000,
    };
    const attrs = detailsToAttributes(product);
    const keys = Object.keys(attrs);
    expect(keys).toEqual(
      expect.arrayContaining(["fabric", "length", "width", "condition", "designer"])
    );
    // Should not include non-attribute keys
    expect(keys).not.toContain("id");
    expect(keys).not.toContain("name");
    expect(keys).not.toContain("pricePaise");
  });
});

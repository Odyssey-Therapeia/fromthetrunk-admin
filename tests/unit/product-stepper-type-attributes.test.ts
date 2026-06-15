/**
 * P4-02: tests/unit/product-stepper-type-attributes.test.ts
 *
 * Tests for the type-aware stepper additions:
 *   1. mapProductToStepperValues — hydrates typeId + attributeValues from a product row
 *   2. defaultStepperValues — includes typeId + attributeValues with correct defaults
 *   3. buildAttributePayload — pure function: stepper values → attributes object for persistence
 *   4. buildTypeZodSchema integration — validates attributeValues via the type's attribute_defs
 *
 * These tests must pass without touching the database or rendering React.
 */

import { describe, expect, it } from "vitest";

import {
  buildTypeZodSchema,
  type AttributeDef,
} from "@/lib/catalog/type-schema";
import {
  defaultStepperValues,
  mapProductToStepperValues,
} from "@/components/admin/product-stepper/types";
import { buildAttributePayload } from "@/components/admin/product-stepper/attributes";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const conditionOptions = [
  { label: "Mint", value: "mint" },
  { label: "Excellent", value: "excellent" },
  { label: "Very Good", value: "very_good" },
  { label: "Good", value: "good" },
  { label: "Fair", value: "fair" },
];

const preloved_saree_defs: AttributeDef[] = [
  {
    key: "fabric",
    meta: { type: "text", label: "Fabric", placeholder: "e.g. Pure Silk" },
    required: true,
  },
  {
    key: "condition",
    meta: { type: "select", label: "Condition", options: conditionOptions },
    required: true,
  },
  {
    key: "length",
    meta: { type: "text", label: "Length", placeholder: "e.g. 5.5m" },
    required: false,
  },
  {
    key: "designer",
    meta: { type: "text", label: "Designer / Weaver" },
    required: false,
  },
];

const TYPE_UUID = "11111111-1111-1111-1111-111111111111";

// ---------------------------------------------------------------------------
// defaultStepperValues includes new fields
// ---------------------------------------------------------------------------

describe("defaultStepperValues — includes typeId and attributeValues", () => {
  it("typeId defaults to null (no type selected)", () => {
    expect(defaultStepperValues.typeId).toBeNull();
  });

  it("attributeValues defaults to empty object", () => {
    expect(defaultStepperValues.attributeValues).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// mapProductToStepperValues — hydrates typeId and attributeValues
// ---------------------------------------------------------------------------

describe("mapProductToStepperValues — typeId + attributeValues hydration", () => {
  it("hydrates typeId when product has a typeId", () => {
    const values = mapProductToStepperValues({
      typeId: TYPE_UUID,
    });
    expect(values.typeId).toBe(TYPE_UUID);
  });

  it("hydrates attributeValues from product.attributes jsonb", () => {
    const attrs = { fabric: "Pure Silk", condition: "mint", length: "5.5m" };
    const values = mapProductToStepperValues({
      typeId: TYPE_UUID,
      attributes: attrs,
    });
    expect(values.attributeValues).toEqual(attrs);
  });

  it("defaults typeId to null when product has none", () => {
    const values = mapProductToStepperValues({});
    expect(values.typeId).toBeNull();
  });

  it("defaults attributeValues to empty object when product has none", () => {
    const values = mapProductToStepperValues({});
    expect(values.attributeValues).toEqual({});
  });

  it("defaults attributeValues to empty object when product.attributes is empty", () => {
    const values = mapProductToStepperValues({ attributes: {} });
    expect(values.attributeValues).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// buildAttributePayload — stepper values → persistence shape
// ---------------------------------------------------------------------------

describe("buildAttributePayload — maps attributeValues to products.attributes", () => {
  it("returns attributeValues as-is for the attributes column", () => {
    const attrs = { fabric: "Silk", condition: "mint" };
    const result = buildAttributePayload({ ...defaultStepperValues, attributeValues: attrs });
    expect(result.attributes).toEqual(attrs);
  });

  it("returns typeId for the typeId column", () => {
    const result = buildAttributePayload({ ...defaultStepperValues, typeId: TYPE_UUID });
    expect(result.typeId).toBe(TYPE_UUID);
  });

  it("returns null typeId when no type selected", () => {
    const result = buildAttributePayload({ ...defaultStepperValues, typeId: null });
    expect(result.typeId).toBeNull();
  });

  it("returns empty attributes when attributeValues is empty", () => {
    const result = buildAttributePayload({ ...defaultStepperValues, attributeValues: {} });
    expect(result.attributes).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// buildTypeZodSchema integration — validates attributeValues via schema
// ---------------------------------------------------------------------------

describe("buildTypeZodSchema integration with attributeValues", () => {
  const schema = buildTypeZodSchema(preloved_saree_defs);

  it("validates a complete attributeValues object against type schema", () => {
    const attributeValues = {
      fabric: "Pure Silk",
      condition: "mint",
      length: "5.5m",
      designer: "Chandralekha",
    };
    const result = schema.safeParse(attributeValues);
    expect(result.success).toBe(true);
  });

  it("validates attributeValues with only required fields", () => {
    const attributeValues = {
      fabric: "Banarasi",
      condition: "excellent",
    };
    const result = schema.safeParse(attributeValues);
    expect(result.success).toBe(true);
  });

  it("rejects attributeValues missing a required field (fabric)", () => {
    const attributeValues = {
      condition: "good",
    };
    const result = schema.safeParse(attributeValues);
    expect(result.success).toBe(false);
  });

  it("rejects attributeValues with invalid enum for condition", () => {
    const attributeValues = {
      fabric: "Silk",
      condition: "Pristine", // invalid
    };
    const result = schema.safeParse(attributeValues);
    expect(result.success).toBe(false);
  });

  it("validates that changing type defs changes which fields are required — no per-type UI code", () => {
    // A type with only "material" as required (e.g. accessory type)
    const accessory_defs: AttributeDef[] = [
      {
        key: "material",
        meta: { type: "text", label: "Material" },
        required: true,
      },
      {
        key: "condition",
        meta: { type: "select", label: "Condition", options: conditionOptions },
        required: false,
      },
    ];
    const accessorySchema = buildTypeZodSchema(accessory_defs);

    // Accessory with only material passes
    expect(accessorySchema.safeParse({ material: "Sterling Silver" }).success).toBe(true);

    // Saree schema rejects if fabric is missing
    expect(schema.safeParse({ condition: "mint" }).success).toBe(false);

    // This demonstrates schema-driven behaviour: different attribute_defs → different required fields
    // No per-type code needed in the UI — just pass the defs to buildTypeZodSchema
  });
});

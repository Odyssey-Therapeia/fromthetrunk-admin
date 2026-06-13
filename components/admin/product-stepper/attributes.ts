/**
 * components/admin/product-stepper/attributes.ts
 *
 * P4-02: Pure helpers for the attributes step.
 *
 * buildAttributePayload(values) — extracts typeId and attributes from
 * ProductStepperValues for inclusion in the CREATE / PATCH product payload.
 *
 * No React, no DB calls — pure TypeScript, unit-testable.
 */

import type { ProductStepperValues } from "./types";

// ---------------------------------------------------------------------------
// AttributePayload — the slice of the product payload driven by attributes
// ---------------------------------------------------------------------------

export type AttributePayload = {
  /** UUID of the selected product_types row, or null if none selected. */
  typeId: string | null;
  /**
   * Attribute values keyed by attribute_defs[n].key.
   * Stored as jsonb in products.attributes.
   */
  attributes: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// buildAttributePayload
// ---------------------------------------------------------------------------

/**
 * buildAttributePayload(values) → { typeId, attributes }
 *
 * Extracts the two attribute-related fields from ProductStepperValues and
 * returns them in the shape expected by the product API payload.
 *
 * Pure function — no side effects, no async.
 */
export function buildAttributePayload(values: ProductStepperValues): AttributePayload {
  return {
    typeId: values.typeId ?? null,
    attributes: values.attributeValues,
  };
}

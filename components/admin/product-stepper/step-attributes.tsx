"use client";

/**
 * components/admin/product-stepper/step-attributes.tsx
 *
 * P4-02: Attributes step — schema-driven via SchemaForm + buildTypeZodSchema.
 *
 * This step renders the attribute fields for the selected product type.
 * There is NO per-type code here: the attribute_defs from the product_types
 * table drive the FormSchema passed to SchemaForm. A type with 5 defs renders
 * 5 fields; a type with 2 renders 2. No changes to this file are needed when
 * new product types are added.
 *
 * Attribute values are stored in ProductStepperValues.attributeValues
 * (Record<string, unknown>) and persisted to products.attributes (jsonb).
 *
 * Validation: buildTypeZodSchema(attributeDefs) is called at submit time
 * (see stepper.tsx persistProduct). Field-level errors from the zod parse
 * are surfaced via the errors prop of SchemaForm.
 *
 * Design: shadcn + Tailwind tokens only; no hex/px. Mobile-first.
 */

import { useState } from "react";
import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";

import { SchemaForm } from "@/components/admin/schema-form/schema-form";
import {
  attributeDefsToFormSchema,
  buildTypeZodSchema,
} from "@/lib/catalog/type-schema";

import { useProductTypeAttributeDefs } from "./use-product-type";
import type { ProductStepperValues } from "./types";

// ---------------------------------------------------------------------------
// Typed form handle (same pattern as step-details, step-pricing)
// ---------------------------------------------------------------------------

type ProductStepperSyncValidator =
  | FormValidateOrFn<ProductStepperValues>
  | undefined;
type ProductStepperAsyncValidator =
  | FormAsyncValidateOrFn<ProductStepperValues>
  | undefined;

type ProductStepperForm = ReactFormExtendedApi<
  ProductStepperValues,
  ProductStepperSyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperSyncValidator,
  ProductStepperAsyncValidator,
  ProductStepperAsyncValidator,
  unknown
>;

type StepAttributesProps = {
  form: ProductStepperForm;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepAttributes({ form }: StepAttributesProps) {
  const typeId = form.state.values.typeId;
  const { attributeDefs, loading } = useProductTypeAttributeDefs(typeId);

  // Local validation errors: populated when user attempts to validate and
  // buildTypeZodSchema rejects the current attributeValues.
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Build a FormSchema from the attributeDefs so SchemaForm can render fields.
  // No per-type code: the defs drive everything — attributeDefsToFormSchema()
  // converts AttributeDef[] → FormSchema (same derivation path as validation).
  const schema = attributeDefsToFormSchema(attributeDefs);

  const currentValues = form.state.values.attributeValues;

  const handleChange = (key: string, value: unknown) => {
    const updated = { ...currentValues, [key]: value };
    form.setFieldValue("attributeValues", updated);

    // Clear the per-field error on change
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleBlur = (key: string) => {
    // Validate the single field on blur using the full type schema
    if (attributeDefs.length === 0) return;
    const fullSchema = buildTypeZodSchema(attributeDefs);
    const result = fullSchema.safeParse(currentValues);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const fieldKey = issue.path[0];
        if (typeof fieldKey === "string" && fieldKey === key) {
          fieldErrors[fieldKey] = issue.message;
        }
      }
      setErrors((prev) => ({ ...prev, ...fieldErrors }));
    } else {
      // Clear errors for this field if schema now passes
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  if (!typeId) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-12 text-sm text-muted-foreground">
        Select a product type in the previous step to configure attributes.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading attribute schema...
      </div>
    );
  }

  if (attributeDefs.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-dashed py-12 text-sm text-muted-foreground">
        No attributes defined for this product type.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Product Attributes</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Attributes are specific to the selected product type and are persisted
          to the product record.
        </p>
      </div>

      <SchemaForm
        schema={schema}
        values={currentValues}
        errors={errors}
        className="grid gap-4 md:grid-cols-2"
        onChange={handleChange}
        onBlur={handleBlur}
      />
    </div>
  );
}

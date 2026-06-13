"use client";

/**
 * components/admin/product-stepper/step-type-selection.tsx
 *
 * P4-02: Type Selection step — first step of the product stepper.
 *
 * Renders a card-based chooser for product types (preloved-saree, blouse,
 * accessory, etc.) loaded from the API. Selecting a type sets
 * ProductStepperValues.typeId and clears attributeValues (to avoid stale
 * attributes from a previously selected type).
 *
 * Design: shadcn + Tailwind tokens only; no hex/px.
 */

import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";
import { CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

import { useProductTypes } from "./use-product-type";
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

type StepTypeSelectionProps = {
  form: ProductStepperForm;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepTypeSelection({ form }: StepTypeSelectionProps) {
  const { loading, types } = useProductTypes();
  const selectedTypeId = form.state.values.typeId;

  const handleSelect = (typeId: string) => {
    // If switching type, clear attribute values to avoid stale data
    if (typeId !== selectedTypeId) {
      form.setFieldValue("attributeValues", {});
    }
    form.setFieldValue("typeId", typeId);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        Loading product types...
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        No product types configured. Contact an administrator.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">Select Product Type</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Choose the type that best describes this product. The attributes step
          will adapt to the type you select.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {types.map((type) => {
          const isSelected = selectedTypeId === type.id;
          return (
            <button
              key={type.id}
              type="button"
              onClick={() => handleSelect(type.id)}
              className={cn(
                "relative flex flex-col gap-1.5 rounded-lg border p-4 text-left transition-colors",
                "hover:border-primary/60 hover:bg-accent/50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card"
              )}
            >
              {isSelected ? (
                <CheckCircle2 className="absolute right-3 top-3 h-4 w-4 text-primary" />
              ) : null}
              <span className="text-sm font-medium">{type.name}</span>
              <span className="text-xs text-muted-foreground">{type.slug}</span>
            </button>
          );
        })}
      </div>

      {selectedTypeId ? (
        <p className="text-xs text-muted-foreground">
          Type selected. Proceed to the next step to fill in attributes.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          No type selected — attributes step will be skipped.
        </p>
      )}
    </div>
  );
}

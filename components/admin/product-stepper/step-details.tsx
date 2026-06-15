"use client";

import { useState } from "react";

import type {
  FormAsyncValidateOrFn,
  FormValidateOrFn,
  ReactFormExtendedApi,
} from "@tanstack/react-form";

import { Button } from "@/components/ui/button";
import {
  productDetailsSchema,
  detailsFullWidthKeys,
} from "@/components/admin/schema-form/product-details.schema";
import { SchemaForm } from "@/components/admin/schema-form/schema-form";
import { SchemaFormField } from "@/components/admin/schema-form/schema-form-field";

import type { FormSchema } from "@/lib/forms/types";
import type { ProductStepperValues } from "./types";

// ---------------------------------------------------------------------------
// Typed form handle (mirrors step-pricing.tsx pattern)
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

type StepDetailsProps = {
  form: ProductStepperForm;
};

// ---------------------------------------------------------------------------
// Standard field keys rendered via SchemaForm (all except tagsCsv which has
// a custom Suggest Tags button alongside it).
// ---------------------------------------------------------------------------

const standardFieldKeys = [
  "name",
  "slug",
  "collectionId",
  "detailsFabric",
  "detailsDesigner",
  "detailsLength",
  "detailsWidth",
  "detailsCondition",
] as const satisfies ReadonlyArray<keyof ProductStepperValues>;

// Sub-schema for the 8 standard fields — derived from productDetailsSchema.
// productDetailsSchema is the single source of truth; this is a projection.
const standardSchema: FormSchema = {
  fields: Object.fromEntries(
    standardFieldKeys.map((key) => [key, productDetailsSchema.fields[key]])
  ),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepDetails({ form }: StepDetailsProps) {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState<
    Array<{ category: string; id: number; name: string }>
  >([]);

  const handleSuggestTags = async () => {
    setIsSuggesting(true);
    try {
      const values = form.state.values;
      const response = await fetch("/api/v2/products/tag-suggestions", {
        body: JSON.stringify({
          detailsDesigner: values.detailsDesigner,
          detailsFabric: values.detailsFabric,
          storyEra: values.storyEra,
          storyNarrative: values.storyNarrative,
          storyProvenance: values.storyProvenance,
          storyTitle: values.storyTitle,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      });

      if (!response.ok) {
        setSuggestedTags([]);
        return;
      }

      const data = (await response.json()) as {
        suggestions?: Array<{ category: string; id: number; name: string }>;
      };
      setSuggestedTags(data.suggestions ?? []);
    } finally {
      setIsSuggesting(false);
    }
  };

  // -------------------------------------------------------------------------
  // Build values and errors maps from the TanStack form state.
  // All field metadata is sourced from productDetailsSchema (single source of
  // truth) — no hand-assembled meta objects here.
  // -------------------------------------------------------------------------

  const formValues = form.state.values as Record<string, unknown>;

  const standardValues: Record<string, unknown> = Object.fromEntries(
    standardFieldKeys.map((key) => [key, formValues[key] ?? ""])
  );

  const standardErrors: Record<string, string> = {};
  for (const key of standardFieldKeys) {
    const firstError = form.state.fieldMeta[key]?.errors[0];
    if (firstError !== undefined) {
      standardErrors[key] = String(firstError);
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Standard fields — schema-driven via SchemaForm + productDetailsSchema.
          Field layout (full-width) is specified via getFieldClassName. */}
      <SchemaForm
        schema={standardSchema}
        values={standardValues}
        errors={standardErrors}
        className="contents"
        getFieldClassName={(key) =>
          detailsFullWidthKeys.has(key) ? "md:col-span-2" : undefined
        }
        onChange={(key, value) => {
          form.setFieldValue(
            key as keyof ProductStepperValues,
            value as ProductStepperValues[keyof ProductStepperValues]
          );
        }}
        onBlur={(key) => {
          const fieldInfo = form.getFieldInfo(key as keyof ProductStepperValues);
          if (fieldInfo?.instance) {
            fieldInfo.instance.handleBlur();
          }
        }}
      />

      {/* tagsCsv — metadata from productDetailsSchema (no inline meta);
          has a custom "Suggest Tags" button as additional UI. */}
      <form.Field name="tagsCsv">
        {(field) => {
          const tagFieldMeta = productDetailsSchema.fields["tagsCsv"].meta;
          const tagError =
            field.state.meta.errors[0] !== undefined
              ? String(field.state.meta.errors[0])
              : undefined;

          return (
            <div className="space-y-2 md:col-span-2">
              <div className="flex items-center justify-between gap-3">
                <SchemaFormField
                  fieldKey="tagsCsv"
                  meta={tagFieldMeta}
                  value={field.state.value}
                  error={tagError}
                  formValues={formValues}
                  onBlur={field.handleBlur}
                  onChange={(v) => field.handleChange(v as string)}
                />
                <Button
                  className="mt-6 shrink-0"
                  onClick={handleSuggestTags}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {isSuggesting ? "Suggesting..." : "Suggest Tags"}
                </Button>
              </div>
              {suggestedTags.length > 0 ? (
                <div className="space-y-2 rounded-md border border-dashed p-3 text-xs text-muted-foreground">
                  <p>Suggested tags:</p>
                  <p>
                    {suggestedTags
                      .map((tag) => `${tag.name} (#${tag.id})`)
                      .join(", ")}
                  </p>
                  <Button
                    onClick={() =>
                      field.handleChange(
                        suggestedTags.map((tag) => tag.id).join(", ")
                      )
                    }
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    Apply suggested IDs
                  </Button>
                </div>
              ) : null}
            </div>
          );
        }}
      </form.Field>
    </div>
  );
}

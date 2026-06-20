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
import { useRenderLog, logEvent } from "./_render-log";

import type { FormSchema } from "@/lib/forms/types";
import type { ProductStepperValues } from "./types";

import { useStore } from "@tanstack/react-form";
import { TagPicker } from "./tag-picker";

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
    standardFieldKeys.map((key) => [key, productDetailsSchema.fields[key]]),
  ),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepDetails({ form }: StepDetailsProps) {
  useRenderLog("StepDetails");
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

  // const formValues = form.state.values as Record<string, unknown>;
  const formValues = useStore(form.store, (state) => state.values);

  const standardValues: Record<string, unknown> = Object.fromEntries(
    standardFieldKeys.map((key) => [key, formValues[key] ?? ""]),
  );

  const standardErrors: Record<string, string> = {};
  for (const key of standardFieldKeys) {
    const firstError = form.state.fieldMeta[key]?.errors[0];
    if (firstError !== undefined) {
      standardErrors[key] = String(firstError);
    }
  }

  const parseTagIds = (csv: string): number[] =>
    csv
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

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
          logEvent(`keystroke: ${key}`, value); // inside SchemaForm's onChange
          form.setFieldValue(
            key as keyof ProductStepperValues,
            value as ProductStepperValues[keyof ProductStepperValues],
          );
        }}
        onBlur={(key) => {
          const { instance } = form.getFieldInfo(
            key as keyof ProductStepperValues,
          );
          (instance as { handleBlur?: () => void } | null)?.handleBlur?.();
        }}
      />

      {/* tagsCsv — metadata from productDetailsSchema (no inline meta);
          has a custom "Suggest Tags" button as additional UI. */}
      <form.Field name="tagsCsv">
        {(field) => (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Tags</label>
            <TagPicker
              value={parseTagIds(field.state.value)}
              onChange={(ids) => field.handleChange(ids.join(","))}
            />
          </div>
        )}
      </form.Field>
    </div>
  );
}

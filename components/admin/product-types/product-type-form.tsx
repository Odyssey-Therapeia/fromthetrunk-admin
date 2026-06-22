import { useState } from "react";

import { AttributeDefsEditor } from "@/components/admin/product-types/attribute-defs-editor";
import {
  slugifyTypeName,
  type ProductTypeFormValues,
  type ProductTypeRecord,
} from "@/components/admin/product-types/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProductTypeFormProps = {
  initialValue?: ProductTypeRecord | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSubmit: (values: ProductTypeFormValues) => Promise<void>;
};

const emptyValues: ProductTypeFormValues = {
  name: "",
  slug: "",
  attributeDefs: [],
};

function getInitialFormValues(
  initialValue?: ProductTypeRecord | null,
): ProductTypeFormValues {
  if (!initialValue) {
    return emptyValues;
  }

  return {
    name: initialValue.name,
    slug: initialValue.slug,
    attributeDefs: initialValue.attributeDefs ?? [],
  };
}

export function ProductTypeForm({
  initialValue,
  isSaving = false,
  onCancel,
  onSubmit,
}: ProductTypeFormProps) {
  const [values, setValues] = useState<ProductTypeFormValues>(() =>
    getInitialFormValues(initialValue),
  );

  const isEditing = Boolean(initialValue?.id);

  return (
    <form
      className="space-y-6 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm"
      onSubmit={async (event) => {
        event.preventDefault();

        const name = values.name.trim();
        const slug = values.slug.trim() || slugifyTypeName(name);

        await onSubmit({
          ...values,
          name,
          slug,
          attributeDefs: values.attributeDefs.map((attribute) => {
            const label = attribute.meta.label?.trim() ?? "";
            const key = attribute.key.trim();

            return {
              ...attribute,
              key,
              meta: {
                ...attribute.meta,
                label,
                placeholder: attribute.meta.placeholder?.trim(),
                helpText: attribute.meta.helpText?.trim(),
              },
            };
          }),
        });
      }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
          {isEditing ? "Edit type" : "New type"}
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-neutral-950">
          {isEditing ? initialValue?.name : "Create product type"}
        </h2>
        <p className="mt-2 text-sm text-neutral-500">
          Configure the taxonomy and dynamic product form fields for this type.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="type-name">Name</Label>
          <Input
            id="type-name"
            value={values.name}
            placeholder="Saree"
            onChange={(event) => {
              const name = event.target.value;

              setValues((current) => ({
                ...current,
                name,
                slug: isEditing ? current.slug : slugifyTypeName(name),
              }));
            }}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="type-slug">Generated slug</Label>
          <Input
            id="type-slug"
            value={values.slug}
            placeholder="saree"
            readOnly
            className="bg-neutral-50 text-neutral-600"
          />
          <p className="text-xs text-neutral-500">
            Slugs are generated from the name. Existing type slugs stay stable
            after creation.
          </p>
        </div>
      </div>

      <AttributeDefsEditor
        value={values.attributeDefs}
        onChange={(attributeDefs) => {
          setValues((current) => ({
            ...current,
            attributeDefs,
          }));
        }}
      />

      <div className="flex items-center justify-end gap-3 border-t border-neutral-200 pt-5">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>

        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : isEditing ? "Save changes" : "Create type"}
        </Button>
      </div>
    </form>
  );
}

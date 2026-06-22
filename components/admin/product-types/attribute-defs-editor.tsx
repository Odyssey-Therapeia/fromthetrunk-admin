import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  keyifyAttributeLabel,
  productTypeFieldTypes,
  type ProductTypeAttributeDef,
  type ProductTypeFieldType,
} from "@/components/admin/product-types/types";

type AttributeDefsEditorProps = {
  value: ProductTypeAttributeDef[];
  onChange: (value: ProductTypeAttributeDef[]) => void;
};

function formatOptions(options: ProductTypeAttributeDef["meta"]["options"]) {
  return (options ?? [])
    .map((option) => `${option.label}:${option.value}`)
    .join("\n");
}

function parseOptions(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawLabel, ...rawValueParts] = line.split(":");
      const label = rawLabel?.trim() ?? "";
      const explicitValue = rawValueParts.join(":").trim();
      const optionValue = explicitValue || keyifyAttributeLabel(label);

      return {
        label,
        value: optionValue,
      };
    })
    .filter((option) => option.label && option.value);
}

function createEmptyAttribute(): ProductTypeAttributeDef {
  return {
    key: "",
    required: false,
    meta: {
      type: "text",
      label: "",
      placeholder: "",
      helpText: "",
    },
  };
}

export function AttributeDefsEditor({
  value,
  onChange,
}: AttributeDefsEditorProps) {
  const updateAttribute = (
    index: number,
    updater: (current: ProductTypeAttributeDef) => ProductTypeAttributeDef,
  ) => {
    onChange(
      value.map((attribute, i) =>
        i === index ? updater(attribute) : attribute,
      ),
    );
  };

  const removeAttribute = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-neutral-950">Attributes</h2>
          <p className="text-sm text-neutral-500">
            These fields appear in the product form after this type is selected.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => onChange([...value, createEmptyAttribute()])}
        >
          <Plus className="mr-2 h-4 w-4" />
          Add attribute
        </Button>
      </div>

      {value.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-500">
          No attributes yet. Add fields like fabric, condition, length, era, or
          provenance.
        </div>
      ) : (
        <div className="space-y-4">
          {value.map((attribute, index) => {
            const needsOptions =
              attribute.meta.type === "select" ||
              attribute.meta.type === "multi-select";

            return (
              <div
                key={index}
                className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-neutral-950">
                      Attribute {index + 1}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Saved as products.attributes.{attribute.key || "key"}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => removeAttribute(index)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </Button>
                </div>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Label</Label>
                    <Input
                      value={attribute.meta.label ?? ""}
                      placeholder="Fabric"
                      onChange={(event) => {
                        const label = event.target.value;

                        updateAttribute(index, (current) => ({
                          ...current,
                          key: keyifyAttributeLabel(label),
                          meta: {
                            ...current.meta,
                            label,
                          },
                        }));
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Generated key</Label>
                    <Input
                      value={attribute.key}
                      placeholder="fabric"
                      readOnly
                      className="bg-neutral-50 text-neutral-600"
                    />
                    <p className="text-xs text-neutral-500">
                      Generated from the label. This is the internal field name.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Field type</Label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={attribute.meta.type}
                      onChange={(event) => {
                        const type = event.target.value as ProductTypeFieldType;

                        updateAttribute(index, (current) => ({
                          ...current,
                          meta: {
                            ...current.meta,
                            type,
                            ...(type === "select" || type === "multi-select"
                              ? { options: current.meta.options ?? [] }
                              : { options: undefined }),
                          },
                        }));
                      }}
                    >
                      {productTypeFieldTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Placeholder</Label>
                    <Input
                      value={attribute.meta.placeholder ?? ""}
                      placeholder="Kanjivaram silk"
                      onChange={(event) => {
                        updateAttribute(index, (current) => ({
                          ...current,
                          meta: {
                            ...current.meta,
                            placeholder: event.target.value,
                          },
                        }));
                      }}
                    />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  <Label>Help text</Label>
                  <Input
                    value={attribute.meta.helpText ?? ""}
                    placeholder="Shown below the field in the product form"
                    onChange={(event) => {
                      updateAttribute(index, (current) => ({
                        ...current,
                        meta: {
                          ...current.meta,
                          helpText: event.target.value,
                        },
                      }));
                    }}
                  />
                </div>

                {needsOptions && (
                  <div className="mt-4 space-y-2">
                    <Label>Options</Label>
                    <textarea
                      className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formatOptions(attribute.meta.options)}
                      placeholder={"Excellent:excellent\nGood:good\nFair:fair"}
                      onChange={(event) => {
                        updateAttribute(index, (current) => ({
                          ...current,
                          meta: {
                            ...current.meta,
                            options: parseOptions(event.target.value),
                          },
                        }));
                      }}
                    />
                    <p className="text-xs text-neutral-500">
                      One option per line. Use Label:value. If value is omitted,
                      it will be generated from the label.
                    </p>
                  </div>
                )}

                <label className="mt-4 flex items-center gap-2 text-sm text-neutral-700">
                  <input
                    type="checkbox"
                    checked={attribute.required}
                    onChange={(event) => {
                      updateAttribute(index, (current) => ({
                        ...current,
                        required: event.target.checked,
                      }));
                    }}
                  />
                  Required field
                </label>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

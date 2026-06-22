"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ProductTypeForm } from "@/components/admin/product-types/product-type-form";
import type {
  ProductTypeFormValues,
  ProductTypeRecord,
} from "@/components/admin/product-types/types";
import { Button } from "@/components/ui/button";

type ProductTypesManagerProps = {
  initialTypes: ProductTypeRecord[];
};

type ProductTypesResponse = {
  types: ProductTypeRecord[];
};

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message || response.statusText;
  } catch {
    return response.statusText;
  }
}

export function ProductTypesManager({
  initialTypes,
}: ProductTypesManagerProps) {
  const [types, setTypes] = useState<ProductTypeRecord[]>(initialTypes);
  const [selectedType, setSelectedType] = useState<ProductTypeRecord | null>(
    null,
  );
  const [isCreating, setIsCreating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sortedTypes = useMemo(
    () => [...types].sort((a, b) => a.name.localeCompare(b.name)),
    [types],
  );

  const loadTypes = async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch("/api/v2/product-types", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const body = (await response.json()) as ProductTypesResponse;
      setTypes(body.types ?? []);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load product types.",
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const closeForm = () => {
    setSelectedType(null);
    setIsCreating(false);
  };

  const saveType = async (values: ProductTypeFormValues) => {
    setIsSaving(true);

    try {
      const isEditing = Boolean(selectedType?.id);
      const response = await fetch(
        isEditing
          ? `/api/v2/product-types/${selectedType?.id}`
          : "/api/v2/product-types",
        {
          method: isEditing ? "PATCH" : "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(values),
        },
      );

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      const saved = (await response.json()) as ProductTypeRecord;

      setTypes((current) => {
        if (isEditing) {
          return current.map((type) => (type.id === saved.id ? saved : type));
        }

        return [...current, saved];
      });

      toast.success(
        isEditing ? "Product type updated." : "Product type created.",
      );
      closeForm();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save product type.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const deleteType = async (type: ProductTypeRecord) => {
    const confirmed = window.confirm(
      `Delete "${type.name}"? This will fail if products are using this type.`,
    );

    if (!confirmed) {
      return;
    }

    try {
      const response = await fetch(`/api/v2/product-types/${type.id}`, {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await parseError(response));
      }

      setTypes((current) => current.filter((item) => item.id !== type.id));
      toast.success("Product type deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete product type.",
      );
    }
  };

  const isFormOpen = isCreating || selectedType;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-neutral-500">
            Catalogue configuration
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-neutral-950">
            Product Types
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
            Configure the product taxonomy and the dynamic fields shown in the
            product creation flow.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => void loadTypes()}
            disabled={isRefreshing}
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>

          <Button
            type="button"
            onClick={() => {
              setSelectedType(null);
              setIsCreating(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Type
          </Button>
        </div>
      </div>

      {isFormOpen && (
        <ProductTypeForm
          key={selectedType?.id ?? (isCreating ? "new-type" : "type-form")}
          initialValue={selectedType}
          isSaving={isSaving}
          onCancel={closeForm}
          onSubmit={saveType}
        />
      )}

      <div className="rounded-3xl border border-neutral-200 bg-white shadow-sm">
        <div className="border-b border-neutral-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-neutral-950">
            Existing types
          </h2>
          <p className="text-sm text-neutral-500">
            These types are available in the product stepper.
          </p>
        </div>

        {sortedTypes.length === 0 ? (
          <div className="p-6 text-sm text-neutral-500">
            No product types yet. Create your first type to start configuring
            dynamic product fields.
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {sortedTypes.map((type) => (
              <div
                key={type.id}
                className="flex flex-col justify-between gap-4 px-6 py-4 md:flex-row md:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-base font-semibold text-neutral-950">
                      {type.name}
                    </h3>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">
                      {type.slug}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-neutral-500">
                    {(type.attributeDefs ?? []).length} attribute
                    {(type.attributeDefs ?? []).length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsCreating(false);
                      setSelectedType(type);
                    }}
                  >
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => void deleteType(type)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
